// Racine de l'interface : connexion au moteur, données partagées (jeux, stores,
// installations, partie en cours), écran courant et fenêtres par-dessus.

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, type EngineClient } from "../../api/client.ts";
import type { EngineEvent, Game, LauncherState, Store, StoreId, Volume } from "../../api/types.ts";
import type { Progress } from "./components/ProgressBar.tsx";
import { Toasts, type Toast, type ToastTone } from "./components/Toasts.tsx";
import { DEMO, useEngine } from "./engine.ts";
import { formatPlaytime } from "./format.ts";
import { useNavAction } from "./input/navigation.ts";
import { Overlay } from "./components/Overlay.tsx";
import { Browser } from "./screens/Browser.tsx";
import { GamePage, GameSettingsPage, TrophyDetailPage } from "./screens/GamePages.tsx";
import { LauncherPage, LaunchersPage, Welcome } from "./screens/Launchers.tsx";
import { prefs, setPrefs } from "./prefs.ts";
import { Home, type HomeFocus } from "./screens/Home.tsx";
import { Library, type LibraryFilter, type LibrarySort } from "./screens/Library.tsx";
import { EngineOffline, InstallGuide, Launching, LoginGuide, UninstallConfirm } from "./screens/Overlays.tsx";
import { MusicPage, NotificationsPage, SearchPage, TrophiesPage, type NotificationEntry } from "./screens/Pages.tsx";
import { QuickCenter, type Download } from "./screens/QuickCenter.tsx";
import { Relay } from "./screens/Relay.tsx";
import { Settings } from "./screens/Settings.tsx";
import { getSite, relayInfo, type BrowserWindow, type RelayTarget, type Route, type SettingsSection, type SiteId, type SpaceId } from "./screens/spaces.ts";
import { browserClose, endRelay, focusLauncherWindow, mouseWhileAway, resumeGame, startRelay } from "./shell.ts";
import { connectSystem, system, type PowerAction } from "./system.ts";
import "./components/components.css";
import "./screens/screens.css";

type Screen =
  | { name: "home" }
  | { name: "library" }
  | { name: "game"; gameId: string; from: Screen }
  | { name: "launchers"; from: Screen }
  | { name: "launcher"; store: StoreId; from: Screen }
  | { name: "welcome" }
  | { name: "trophies"; gameId: string; from: Screen }
  | { name: "game-settings"; gameId: string; from: Screen }
  | { name: "settings"; section: SettingsSection }
  | { name: "page"; page: "search" | "trophees" | "notifications" | "music"; from: Screen }
  | { name: "web"; window: BrowserWindow; from: Screen };

type Dialog =
  | { kind: "quick" }
  | { kind: "login"; storeId: StoreId; alternative: boolean; failed: boolean }
  | { kind: "install"; gameId: string }
  | { kind: "uninstall"; gameId: string }
  | { kind: "force"; gameId: string }
  | { kind: "power"; action: "shutdown" | "restart" }
  | { kind: "relay"; target: RelayTarget }
  | { kind: "loading"; site: SiteId; from: Screen };

/** Onglets de chaque fenêtre du navigateur (LB / RB). */
const WINDOW_TABS: Record<BrowserWindow, SiteId[]> = {
  boutique: ["instant-gaming", "steam", "epic", "xbox", "battlenet"],
  social: ["discord"],
  musique: ["music"],
  internet: ["new-page", "youtube", "twitch", "wikipedia"],
};

/** Espace d'où vient un écran : le focus y revient sur l'accueil. */
function spaceOf(screen: Screen): SpaceId | null {
  if (screen.name === "web") return screen.window;
  if (screen.name === "settings") return "parametres";
  if (screen.name === "page") return screen.page === "search" ? "search" : screen.page === "trophees" ? "trophees" : screen.page === "music" ? "musique" : null;
  if (screen.name === "launchers" || screen.name === "launcher") return "parametres";
  return null;
}

/** Le temps de lire où l'on va et comment revenir, avant d'ouvrir la cible du relais. */
const RELAY_DELAY_MS = 2500;

const POWER_LABELS: Record<PowerAction, string> = {
  sleep: "Le PC se met en veille",
  shutdown: "Le PC s'éteint",
  restart: "Le PC redémarre",
  desktop: "Playscreen se cache : retour au bureau Windows",
};

interface Session {
  gameId: string;
  phase: "starting" | "running";
  since: number;
  /** Écran d'attente masqué par le joueur (B). */
  hidden: boolean;
  /** « Quitter le jeu » demandé, en attente de la fin de partie. */
  stopping?: boolean;
}

/** Sans progression après ce délai, on explique ce que le launcher attend (F4). */
const INSTALL_GUIDE_DELAY_MS = 1500;
/** Après le retour sur Playscreen, le temps laissé au launcher pour commencer à télécharger. */
const NO_DOWNLOAD_GRACE_MS = 15_000;
const TOAST_MS = 5000;

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return "Une autre action est déjà en cours.";
    if (error.status === 404) return "Introuvable : la bibliothèque a peut-être changé.";
  }
  return "Le moteur n'a pas répondu.";
}


export function App() {
  const [games, setGames] = useState<Game[] | null>(null);
  const [gamesError, setGamesError] = useState<string | null>(null);
  const [stores, setStores] = useState<Store[] | null>(null);
  const [storesError, setStoresError] = useState<string | null>(null);
  const [installs, setInstalls] = useState<Record<string, Progress | null>>({});
  // État des launchers pendant une demande (launcher.state), pour les écrans d'attente.
  const [launchers, setLaunchers] = useState<Partial<Record<StoreId, LauncherState>>>({});
  const [syncing, setSyncing] = useState<StoreId[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [sort, setSort] = useState<LibrarySort>("recent");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  /** Accueil : jeu ou espace qui avait le focus (on y revient). */
  const [homeFocus, setHomeFocus] = useState<HomeFocus>({});
  /** Durée des parties jouées pendant cette session de Playscreen. */
  const [sessions, setSessions] = useState<Record<string, number>>({});
  /** Page ouverte dans chaque fenêtre du navigateur. */
  const [windowSites, setWindowSites] = useState<Record<BrowserWindow, SiteId>>({
    boutique: "instant-gaming",
    social: "discord",
    musique: "music",
    internet: "new-page",
  });
  const [history, setHistory] = useState<NotificationEntry[]>([]);
  /** Volume de Windows (moteur) ; null si indisponible. */
  const [volume, setVolume] = useState<Volume | null>(null);
  const [unread, setUnread] = useState(0);

  // Les gestionnaires d'événements lisent toujours l'état le plus récent.
  const gamesRef = useRef(games);
  gamesRef.current = games;
  const installsRef = useRef(installs);
  installsRef.current = installs;
  /** Début de chaque téléchargement (pour estimer le temps restant). */
  const installStarts = useRef<Record<string, { at: number; bytes: number }>>({});
  const toastId = useRef(0);

  const notify = useCallback((tone: ToastTone, title: string, message?: string) => {
    const id = ++toastId.current;
    setToasts((list) => [...list.slice(-2), { id, tone, title, message }]);
    setHistory((list) => [...list.slice(-49), { id, title, message, at: Date.now() }]);
    setUnread((n) => n + 1);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), TOAST_MS);
  }, []);

  const nameOf = (id: string) => gamesRef.current?.find((g) => g.id === id)?.name ?? "Le jeu";

  const engine = useEngine((event) => onEvent(event));
  const client: EngineClient | null = engine.status === "ready" ? engine.client : null;
  // Le PC (réseau, luminosité, musique…) est lu par le même moteur.
  useEffect(() => connectSystem(client), [client]);

  // Relais : après l'explication, Playscreen ouvre la cible et la manette devient une souris.
  // Quand Playscreen revient au premier plan (Select + Start), le relais se referme.
  const relayTarget = dialog?.kind === "relay" ? dialog.target : null;
  useEffect(() => {
    if (!relayTarget || DEMO) return;
    let away = false;
    const timer = setTimeout(() => void startRelay(relayTarget), RELAY_DELAY_MS);
    const onBlur = () => (away = true);
    const onFocus = () => {
      if (!away) return;
      setDialog(null);
      // La manette redevient une manette ; la fenêtre ouverte est fermée ou réduite.
      void endRelay(relayTarget);
    };
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, [relayTarget]);
  // Pendant une coupure, les écrans restent affichés (sous l'écran « moteur indisponible »).
  const lastClient = useRef<EngineClient | null>(null);
  if (client) lastClient.current = client;
  const view = lastClient.current;

  const loadGames = useCallback(async () => {
    if (!client) return;
    try {
      setGames(await client.games());
      setGamesError(null);
    } catch (error) {
      setGamesError(describeError(error));
    }
  }, [client]);

  const loadStores = useCallback(async () => {
    if (!client) return;
    try {
      setStores(await client.stores());
      setStoresError(null);
    } catch (error) {
      setStoresError(describeError(error));
    }
  }, [client]);

  // À chaque (re)connexion : le jeton a changé, on relit tout, y compris la partie en cours
  // (l'interface a pu redémarrer pendant qu'un jeu tournait).
  useEffect(() => {
    if (!client) return;
    void loadGames();
    void loadStores();
    client.volume().then(setVolume, () => setVolume(null));
    client.session().then(
      (current) => {
        if (current?.windowHandle) appWindows.current[current.gameId] = current.windowHandle;
        setSession((s) =>
          current
            ? { gameId: current.gameId, phase: current.phase, since: Date.parse(current.startedAt), hidden: s?.hidden ?? false }
            : null,
        );
      },
      () => undefined,
    );
  }, [client, loadGames, loadStores]);

  // Fenêtre des applications hors launcher (game.window) : « Reprendre » la met devant.
  const appWindows = useRef<Record<string, number>>({});
  const bringGameForward = (game: Game) => {
    const handle = appWindows.current[game.id];
    return handle ? focusLauncherWindow(handle) : resumeGame(game);
  };

  // Retour sur Playscreen pendant une partie (Select + Start, D10) : menu rapide d'abord.
  const sessionRef = useRef(session);
  sessionRef.current = session;
  useEffect(() => {
    const onFocus = () => {
      if (sessionRef.current?.phase === "running") setDialog((d) => d ?? { kind: "quick" });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Manette branchée / débranchée.
  useEffect(() => {
    const connected = () => notify("info", "Manette connectée");
    const disconnected = () => notify("warning", "Manette déconnectée", "Rebranche-la ou rallume-la pour continuer.");
    window.addEventListener("gamepadconnected", connected);
    window.addEventListener("gamepaddisconnected", disconnected);
    return () => {
      window.removeEventListener("gamepadconnected", connected);
      window.removeEventListener("gamepaddisconnected", disconnected);
    };
  }, [notify]);

  function onEvent(event: EngineEvent) {
    switch (event.type) {
      case "install.progress": {
        const { gameId, bytesDone, bytesTotal } = event.data;
        if (!installStarts.current[gameId] && bytesDone > 0) installStarts.current[gameId] = { at: Date.now(), bytes: bytesDone };
        setInstalls((all) => ({ ...all, [gameId]: { bytesDone, bytesTotal } }));
        // Le téléchargement a commencé : la consigne n'est plus utile.
        setDialog((d) => (d?.kind === "install" && d.gameId === gameId ? null : d));
        break;
      }
      case "install.cancelled":
        setInstalls(({ [event.data.gameId]: _, ...rest }) => rest);
        setDialog((d) => (d?.kind === "install" && d.gameId === event.data.gameId ? null : d));
        notify("info", `Installation annulée : ${nameOf(event.data.gameId)}`);
        break;
      case "game.installed":
        delete installStarts.current[event.data.gameId];
        setInstalls(({ [event.data.gameId]: _, ...rest }) => rest);
        setDialog((d) => (d?.kind === "install" && d.gameId === event.data.gameId ? null : d));
        notify("success", `${nameOf(event.data.gameId)} est installé`, "Prêt à jouer.");
        void loadGames();
        break;
      case "game.uninstalled":
        notify("info", `${nameOf(event.data.gameId)} est désinstallé`);
        void loadGames();
        break;
      case "library.updated":
      case "game.updated":
        void loadGames();
        break;
      case "game.starting":
        setSession((s) => (s?.gameId === event.data.gameId ? s : { gameId: event.data.gameId, phase: "starting", since: Date.now(), hidden: false }));
        // Mémoire pour le jeu : les fenêtres web fermées, sauf Discord et la musique.
        for (const window of ["boutique", "internet"] as const) {
          system.windowChanged(window, false);
          void browserClose(window);
        }
        break;
      case "game.started": {
        setSession((s) => ({ gameId: event.data.gameId, phase: "running", since: s?.since ?? Date.now(), hidden: false }));
        // Ce que le joueur verra en revenant sur Playscreen pendant la partie (D10).
        setDialog({ kind: "quick" });
        // Windows empêche le jeu (lancé en arrière-plan par son launcher) de passer devant
        // Playscreen : c'est Playscreen, au premier plan, qui lui cède la place.
        const game = gamesRef.current?.find((g) => g.id === event.data.gameId);
        if (game) void bringGameForward(game);
        break;
      }
      case "game.window":
        appWindows.current[event.data.gameId] = event.data.handle;
        // Lancée en arrière-plan, l'application s'ouvre derrière Playscreen : on lui cède la place.
        if (document.hasFocus()) void focusLauncherWindow(event.data.handle);
        break;
      case "game.stopped":
        delete appWindows.current[event.data.gameId];
        setSession(null);
        setSessions((all) => ({ ...all, [event.data.gameId]: event.data.sessionSeconds }));
        setDialog((d) => (d?.kind === "quick" || d?.kind === "force" ? null : d));
        notify("info", `Partie terminée : ${nameOf(event.data.gameId)}`, `Session de ${formatPlaytime(event.data.sessionSeconds)}`);
        void loadGames();
        break;
      case "sync.started":
        setSyncing((list) => (list.includes(event.data.storeId) ? list : [...list, event.data.storeId]));
        break;
      case "sync.finished": {
        const { storeId, ok, error } = event.data;
        setSyncing((list) => list.filter((id) => id !== storeId));
        const name = stores?.find((s) => s.id === storeId)?.name ?? storeId;
        if (ok) notify("success", `${name} synchronisé`);
        else if (error === "not connected") notify("warning", `${name} : compte non connecté`, "Seuls les jeux installés sont importés.");
        else notify("error", `${name} : synchronisation impossible`, error);
        void loadGames();
        void loadStores();
        break;
      }
      case "launcher.prompt": {
        // Fenêtre du launcher ouverte derrière Playscreen (F27) : on la met devant.
        void focusLauncherWindow(event.data.handle);
        const { gameId } = event.data;
        if (gameId && gameId in installsRef.current && installsRef.current[gameId] === null) {
          setDialog({ kind: "install", gameId });
        }
        break;
      }
      case "volume.changed":
        setVolume(event.data);
        break;
      case "launcher.state":
        setLaunchers((all) => ({ ...all, [event.data.storeId]: event.data.state }));
        break;
      case "store.updated": {
        const store = event.data;
        setStores((list) => list?.map((s) => (s.id === store.id ? store : s)) ?? list);
        if (dialog?.kind === "login" && dialog.storeId === store.id) {
          if (store.connected) {
            setDialog(null);
            notify("success", `${store.name} connecté`, "Synchronise-le pour importer tes jeux.");
          } else setDialog({ ...dialog, failed: true });
        }
        break;
      }
    }
  }

  // ——— Actions ———

  /** Oublie l'ancien état du launcher : le moteur renvoie l'état actuel à chaque demande. */
  const forgetLauncher = (game: Game) =>
    setLaunchers(({ [game.store as StoreId]: _, ...rest }) => rest);

  const play = (game: Game) => {
    if (!client) return;
    if (session && session.gameId !== game.id) {
      notify("warning", "Une partie est déjà en cours", `Quitte ${nameOf(session.gameId)} depuis le centre rapide (Start).`);
      return;
    }
    forgetLauncher(game);
    setSession({ gameId: game.id, phase: "starting", since: Date.now(), hidden: false });
    client.start(game.id).catch((error) => {
      setSession(null);
      notify("error", `Impossible de lancer ${game.name}`, describeError(error));
    });
  };

  const install = (game: Game) => {
    if (!client) return;
    forgetLauncher(game);
    setInstalls((all) => ({ ...all, [game.id]: null }));
    // Retour sur Playscreen sans téléchargement commencé (annulé, fenêtre fermée) : le jeu
    // n'est plus noté « en téléchargement ».
    mouseWhileAway(() =>
      setTimeout(() => {
        if (installsRef.current[game.id] === null) void client.cancelInstall(game.id).catch(() => undefined);
      }, NO_DOWNLOAD_GRACE_MS),
    );
    client.install(game.id).then(
      () =>
        setTimeout(() => {
          if (installsRef.current[game.id] === null) setDialog({ kind: "install", gameId: game.id });
        }, INSTALL_GUIDE_DELAY_MS),
      (error) => {
        setInstalls(({ [game.id]: _, ...rest }) => rest);
        notify("error", `Impossible d'installer ${game.name}`, describeError(error));
      },
    );
  };

  const uninstall = (game: Game) => {
    if (!client) return;
    setDialog(null);
    mouseWhileAway();
    client.uninstall(game.id).then(
      () => notify("info", `Désinstallation de ${game.name}…`),
      (error) => notify("error", `Impossible de désinstaller ${game.name}`, describeError(error)),
    );
  };

  const login = (store: Store, alternative: boolean) => {
    if (!client) return;
    setDialog({ kind: "login", storeId: store.id, alternative, failed: false });
    client.login(store.id, { alternative }).catch((error) => {
      // 409 : une fenêtre de connexion est déjà ouverte, on continue de l'attendre.
      if (error instanceof ApiError && error.status === 409) return;
      setDialog(null);
      notify("error", `Connexion à ${store.name} impossible`, describeError(error));
    });
  };

  const sync = (store: Store) => {
    if (!client) return;
    setSyncing((list) => [...list, store.id]);
    client.sync(store.id).catch((error) => {
      setSyncing((list) => list.filter((id) => id !== store.id));
      notify("error", `${store.name} : synchronisation impossible`, describeError(error));
    });
  };

  const changeVolume = (level: number) => {
    if (!client) return;
    client.setVolume({ level: Math.max(0, Math.min(100, level)), muted: false }).then(setVolume, () => undefined);
  };

  /** Reprendre : on ferme le menu et on remet le jeu au premier plan (dans Tauri). */
  const resume = (game: Game) => {
    setDialog(null);
    void bringGameForward(game);
  };

  /** Quitter le jeu (ou forcer sa fermeture) ; la fin arrive par game.stopped. */
  const quit = (game: Game, force: boolean) => {
    if (!client) return;
    setSession((s) => (s ? { ...s, stopping: true } : s));
    client.stop(game.id, { force }).catch((error) => {
      setSession((s) => (s ? { ...s, stopping: false } : s));
      notify(
        "error",
        `Impossible de fermer ${game.name}`,
        error instanceof ApiError && error.status === 409 ? "Le jeu ne répond pas : essaie « Forcer la fermeture »." : describeError(error),
      );
    });
  };


  const power = (action: PowerAction) => {
    if (action === "shutdown" || action === "restart") {
      setDialog({ kind: "power", action });
      return;
    }
    doPower(action);
  };

  const doPower = (action: PowerAction) => {
    setDialog(null);
    system.power(action);
    if (DEMO) notify("info", `Démo : ${POWER_LABELS[action].toLowerCase()}`);
  };

  /** Revenir d'un écran : vers celui d'où l'on vient, l'accueil sinon (focus sur l'espace). */
  const back = (to?: Screen) => {
    const target = to ?? { name: "home" };
    if (target.name === "home") {
      const space = spaceOf(screen);
      if (space) setHomeFocus((f) => ({ ...f, space, library: false }));
    }
    setScreen(target);
  };

  const navigate = (route: Route) => {
    const from: Screen = screen;
    setDialog(null);
    switch (route.kind) {
      case "web": {
        const window = getSite(route.site).window;
        setWindowSites((all) => ({ ...all, [window]: route.site }));
        setDialog({ kind: "loading", site: route.site, from });
        break;
      }
      case "relay":
        setDialog({ kind: "relay", target: route.target });
        break;
      case "settings":
        setScreen({ name: "settings", section: route.section });
        break;
      case "page":
        if (route.page === "notifications") setUnread(0);
        setScreen({ name: "page", page: route.page, from });
        break;
      case "stores":
      case "launchers":
        setScreen({ name: "launchers", from });
        break;
      case "launcher":
        setScreen({ name: "launcher", store: route.store, from });
        break;
      case "welcome":
        setScreen({ name: "welcome" });
        break;
      case "trophies":
        setScreen({ name: "trophies", gameId: route.gameId, from });
        break;
      case "game":
        setScreen({ name: "game", gameId: route.gameId, from });
        break;
      case "game-settings":
        setScreen({ name: "game-settings", gameId: route.gameId, from });
        break;
      case "library":
        setScreen({ name: "library" });
        break;
    }
  };

  /** Ferme une fenêtre web (Discord, musique) pour libérer la mémoire. */
  const closeWindow = (window: BrowserWindow) => {
    system.windowChanged(window, false);
    void browserClose(window);
    notify("info", window === "social" ? "Discord fermé" : `${getSite("music").name} fermé`, "Mémoire libérée.");
  };

  const openGame = (game: Game) => {
    setDialog(null);
    setScreen({ name: "game", gameId: game.id, from: screen });
  };

  // Console vierge (aucun jeu) au premier démarrage : l'accueil « Prépare ta console ».
  useEffect(() => {
    if (games && games.length === 0 && !prefs().welcomed && screen.name !== "welcome") setScreen({ name: "welcome" });
  }, [games]);

  // Start : centre rapide, partout. Priorité la plus basse : les écrans et fenêtres passent avant.
  useNavAction((action) => {
    if (action !== "menu" || !client) return false;
    setDialog({ kind: "quick" });
    return true;
  });

  // ——— Rendu ———

  if (!view) {
    return <EngineOffline firstConnection error={engine.status === "offline" ? "Le moteur ne répond pas encore." : undefined} />;
  }

  const sessionGame = session ? games?.find((g) => g.id === session.gameId) ?? null : null;
  const runningName = session?.phase === "running" ? sessionGame?.name ?? null : null;
  const showLaunching = session?.phase === "starting" && !session.hidden && sessionGame;
  const dialogGame = dialog && "gameId" in dialog ? games?.find((g) => g.id === dialog.gameId) : undefined;
  const loginStore = dialog?.kind === "login" ? stores?.find((s) => s.id === dialog.storeId) : undefined;
  const overlayOpen = Boolean(dialog || showLaunching || !client);
  const launcherOf = (game: Game) => (game.store === "other" ? undefined : launchers[game.store]);

  // Téléchargement en cours (le premier), pour le centre rapide.
  let download: Download | null = null;
  const downloadId = Object.keys(installs)[0];
  const downloadGame = downloadId ? games?.find((g) => g.id === downloadId) : undefined;
  if (downloadId && downloadGame) {
    const progress = installs[downloadId] ?? null;
    const start = installStarts.current[downloadId];
    let etaSeconds: number | null = null;
    if (progress && start) {
      const elapsed = (Date.now() - start.at) / 1000;
      const rate = elapsed > 1 ? (progress.bytesDone - start.bytes) / elapsed : 0;
      if (rate > 0) etaSeconds = Math.max(60, (progress.bytesTotal - progress.bytesDone) / rate);
    }
    download = { game: downloadGame, progress, etaSeconds };
  }

  let current;
  if (screen.name === "game") {
    const game = games?.find((g) => g.id === screen.gameId) ?? null;
    current = (
      <GamePage
        key={screen.gameId}
        client={view}
        game={game}
        loading={!games}
        installing={screen.gameId in installs}
        progress={installs[screen.gameId] ?? null}
        running={session?.phase === "running" && session.gameId === screen.gameId}
        lastSession={game ? sessions[game.id] ?? game.lastSessionSeconds ?? system.lastSession(game.id) : null}
        onPlay={play}
        onInstall={install}
        onResume={() => setDialog({ kind: "quick" })}
        onUninstall={(g) => setDialog({ kind: "uninstall", gameId: g.id })}
        onNavigate={navigate}
        onBack={() => back(screen.from)}
      />
    );
  } else if (screen.name === "trophies") {
    current = <TrophyDetailPage game={games?.find((g) => g.id === screen.gameId) ?? null} onBack={() => back(screen.from)} />;
  } else if (screen.name === "game-settings") {
    current = (
      <GameSettingsPage
        game={games?.find((g) => g.id === screen.gameId) ?? null}
        onNavigate={navigate}
        onUninstall={(g) => setDialog({ kind: "uninstall", gameId: g.id })}
        onNotify={(title, message) => notify("info", title, message)}
        onBack={() => back(screen.from)}
      />
    );
  } else if (screen.name === "launchers") {
    current = (
      <LaunchersPage
        stores={stores}
        error={storesError}
        syncing={syncing}
        onNavigate={navigate}
        onLogin={login}
        onSync={sync}
        onRetry={() => void loadStores()}
        onBack={() => back(screen.from.name === "home" ? undefined : screen.from)}
      />
    );
  } else if (screen.name === "launcher") {
    current = (
      <LauncherPage
        client={view}
        storeId={screen.store}
        store={stores?.find((s) => s.id === screen.store)}
        syncing={syncing}
        onNavigate={navigate}
        onLogin={login}
        onSync={sync}
        onNotify={(title, message) => notify("info", title, message)}
        onBack={() => back(screen.from)}
      />
    );
  } else if (screen.name === "welcome") {
    current = (
      <Welcome
        stores={stores}
        syncing={syncing}
        onNavigate={navigate}
        onLogin={login}
        onSync={sync}
        onDone={() => {
          setPrefs({ welcomed: true });
          setScreen({ name: "home" });
        }}
      />
    );
  } else if (screen.name === "library") {
    current = (
      <Library
        client={view}
        games={games}
        error={gamesError}
        installs={installs}
        runningId={session?.gameId ?? null}
        runningName={runningName}
        filter={filter}
        sort={sort}
        focusedId={focusedId}
        onFilter={setFilter}
        onSort={setSort}
        onFocusGame={setFocusedId}
        onOpen={(game) => {
          setFocusedId(game.id);
          setScreen({ name: "game", gameId: game.id, from: { name: "library" } });
        }}
        onRetry={() => void loadGames()}
        onOpenStores={() => setScreen({ name: "launchers", from: { name: "library" } })}
        onBack={() => back()}
      />
    );
  } else if (screen.name === "settings") {
    current = (
      <Settings
        section={screen.section}
        games={games}
        stores={stores}
        onSection={(section) => setScreen({ name: "settings", section })}
        onNavigate={navigate}
        onOpenGame={openGame}
        onUninstall={(g) => setDialog({ kind: "uninstall", gameId: g.id })}
        volume={volume}
        onPower={power}
        onBack={() => back()}
      />
    );
  } else if (screen.name === "page") {
    const onBack = () => back(screen.from.name === "home" ? undefined : screen.from);
    current =
      screen.page === "search" ? (
        <SearchPage games={games} onOpenGame={openGame} onBack={onBack} />
      ) : screen.page === "trophees" ? (
        <TrophiesPage games={games} onOpenTrophies={(g) => navigate({ kind: "trophies", gameId: g.id })} onBack={onBack} />
      ) : screen.page === "music" ? (
        <MusicPage onOpen={() => navigate({ kind: "web", site: "music" })} onBack={onBack} />
      ) : (
        <NotificationsPage entries={history} onBack={onBack} />
      );
  } else if (screen.name === "web") {
    const window = screen.window;
    current = (
      <Browser
        site={windowSites[window]}
        tabs={WINDOW_TABS[window]}
        covered={Boolean(dialog)}
        onSite={(site) => setWindowSites((all) => ({ ...all, [window]: site }))}
        onBack={() => back(screen.from.name === "home" ? undefined : screen.from)}
      />
    );
  } else {
    current = (
      <Home
        client={view}
        games={games}
        error={gamesError}
        installs={installs}
        runningId={session?.phase === "running" ? session.gameId : null}
        sessions={sessions}
        initialFocus={homeFocus}
        onFocusChange={setHomeFocus}
        onPlay={play}
        onInstall={install}
        onResume={() => setDialog({ kind: "quick" })}
        onOptions={openGame}
        onLibrary={() => setScreen({ name: "library" })}
        onNavigate={navigate}
        onRetry={() => void loadGames()}
      />
    );
  }


  return (
    <>
      {/* L'écran derrière une fenêtre est inerte : la manette reste dans la fenêtre. */}
      <div className="app-screen" inert={overlayOpen}>
        {current}
      </div>

      {client && showLaunching && (
        <Launching
          client={client}
          game={sessionGame}
          since={session.since}
          launcher={launcherOf(sessionGame)}
          onHide={() => setSession((s) => (s ? { ...s, hidden: true } : s))}
        />
      )}
      {client && dialog?.kind === "quick" && (
        <QuickCenter
          client={client}
          game={session?.phase === "running" ? sessionGame : null}
          since={session?.since ?? Date.now()}
          download={download}
          notifications={unread}
          stopping={Boolean(session?.stopping)}
          volume={volume}
          onVolume={changeVolume}
          onResume={() => (sessionGame ? resume(sessionGame) : setDialog(null))}
          onClose={() => setDialog(null)}
          onQuit={() => sessionGame && quit(sessionGame, false)}
          onForceQuit={() => session && setDialog({ kind: "force", gameId: session.gameId })}
          onNavigate={navigate}
          onCloseWindow={closeWindow}
          onOpenGame={openGame}
          onPower={power}
        />
      )}
      {client && dialog?.kind === "force" && dialogGame && (
        <Overlay title={`Forcer la fermeture de ${dialogGame.name} ?`} onBack={() => setDialog({ kind: "quick" })} initialFocus=".dialog-cancel">
          <p className="guide-text">À utiliser si le jeu ne répond plus. Ce qui n'a pas été sauvegardé sera perdu.</p>
          <div className="dialog-actions">
            <button className="btn btn-danger" data-focusable onClick={() => {
                if (sessionGame) quit(sessionGame, true);
                setDialog({ kind: "quick" });
              }}>
              Forcer la fermeture
            </button>
            <button className="btn btn-ghost dialog-cancel" data-focusable onClick={() => setDialog({ kind: "quick" })}>
              Annuler
            </button>
          </div>
        </Overlay>
      )}
      {client && dialog?.kind === "power" && (
        <Overlay
          title={dialog.action === "shutdown" ? "Éteindre le PC ?" : "Redémarrer le PC ?"}
          onBack={() => setDialog({ kind: "quick" })}
          initialFocus=".dialog-cancel"
        >
          <p className="guide-text">
            {session?.phase === "running" ? "Le jeu en cours sera fermé. " : ""}Pense à sauvegarder avant de continuer.
          </p>
          <div className="dialog-actions">
            <button className="btn btn-primary" data-focusable onClick={() => doPower(dialog.action)}>
              {dialog.action === "shutdown" ? "Éteindre" : "Redémarrer"}
            </button>
            <button className="btn btn-ghost dialog-cancel" data-focusable onClick={() => setDialog({ kind: "quick" })}>
              Annuler
            </button>
          </div>
        </Overlay>
      )}
      {client && dialog?.kind === "relay" && (
        <Relay
          to={relayInfo(dialog.target).to}
          title="Ta manette devient une souris"
          text={relayInfo(dialog.target).text}
          mouse
          onBack={() => {
            system.relayEnded(dialog.target);
            setDialog(null);
          }}
        />
      )}
      {client && dialog?.kind === "loading" && (
        <Relay
          key={dialog.site}
          to={getSite(dialog.site).name}
          title={`${getSite(dialog.site).name} s'ouvre…`}
          mouse={false}
          loading={{
            ms: 1200,
            onDone: () => {
              setDialog(null);
              const window = getSite(dialog.site).window;
              system.windowChanged(window, true);
              setScreen({ name: "web", window, from: dialog.from.name === "web" ? { name: "home" } : dialog.from });
            },
          }}
          onBack={() => setDialog(null)}
        />
      )}
      {client && dialog?.kind === "login" && loginStore && (
        <LoginGuide
          store={loginStore}
          alternative={dialog.alternative}
          failed={dialog.failed}
          onRetry={() => login(loginStore, dialog.alternative)}
          onClose={() => setDialog(null)}
        />
      )}
      {client && dialog?.kind === "install" && dialogGame && <InstallGuide game={dialogGame} launcher={launcherOf(dialogGame)} onClose={() => setDialog(null)} />}
      {client && dialog?.kind === "uninstall" && dialogGame && (
        <UninstallConfirm game={dialogGame} onConfirm={() => uninstall(dialogGame)} onClose={() => setDialog(null)} />
      )}

      {!client && <EngineOffline firstConnection={false} />}
      <Toasts toasts={toasts} />
    </>
  );
}
