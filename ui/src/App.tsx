// Racine de l'interface : connexion au moteur, données partagées (jeux, stores,
// installations, partie en cours), écran courant et fenêtres par-dessus.

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, type EngineClient } from "../../api/client.ts";
import type { EngineEvent, Game, Store, StoreId } from "../../api/types.ts";
import type { Progress } from "./components/ProgressBar.tsx";
import { Toasts, type Toast, type ToastTone } from "./components/Toasts.tsx";
import { useEngine } from "./engine.ts";
import { formatPlaytime } from "./format.ts";
import { useNavAction } from "./input/navigation.ts";
import { GameDetail } from "./screens/GameDetail.tsx";
import { Library, type LibraryFilter, type LibrarySort } from "./screens/Library.tsx";
import {
  EngineOffline,
  InstallGuide,
  Launching,
  LoginGuide,
  QuickMenu,
  SystemMenu,
  UninstallConfirm,
} from "./screens/Overlays.tsx";
import { Stores } from "./screens/Stores.tsx";
import { focusLauncherWindow, resumeGame } from "./shell.ts";
import "./components/components.css";
import "./screens/screens.css";

type Screen = { name: "library" } | { name: "game"; gameId: string } | { name: "stores" };

type Dialog =
  | { kind: "menu" }
  | { kind: "quick" }
  | { kind: "login"; storeId: StoreId; alternative: boolean; failed: boolean }
  | { kind: "install"; gameId: string }
  | { kind: "uninstall"; gameId: string };

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
  const [syncing, setSyncing] = useState<StoreId[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: "library" });
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [sort, setSort] = useState<LibrarySort>("recent");
  const [focusedId, setFocusedId] = useState<string | null>(null);

  // Les gestionnaires d'événements lisent toujours l'état le plus récent.
  const gamesRef = useRef(games);
  gamesRef.current = games;
  const installsRef = useRef(installs);
  installsRef.current = installs;
  const toastId = useRef(0);

  const notify = useCallback((tone: ToastTone, title: string, message?: string) => {
    const id = ++toastId.current;
    setToasts((list) => [...list.slice(-2), { id, tone, title, message }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), TOAST_MS);
  }, []);

  const nameOf = (id: string) => gamesRef.current?.find((g) => g.id === id)?.name ?? "Le jeu";

  const engine = useEngine((event) => onEvent(event));
  const client: EngineClient | null = engine.status === "ready" ? engine.client : null;
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
    client.session().then(
      (current) =>
        setSession((s) =>
          current
            ? { gameId: current.gameId, phase: current.phase, since: Date.parse(current.startedAt), hidden: s?.hidden ?? false }
            : null,
        ),
      () => undefined,
    );
  }, [client, loadGames, loadStores]);

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
        setInstalls((all) => ({ ...all, [gameId]: { bytesDone, bytesTotal } }));
        // Le téléchargement a commencé : la consigne n'est plus utile.
        setDialog((d) => (d?.kind === "install" && d.gameId === gameId ? null : d));
        break;
      }
      case "game.installed":
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
        void loadGames();
        break;
      case "game.starting":
        setSession((s) => (s?.gameId === event.data.gameId ? s : { gameId: event.data.gameId, phase: "starting", since: Date.now(), hidden: false }));
        break;
      case "game.started": {
        setSession((s) => ({ gameId: event.data.gameId, phase: "running", since: s?.since ?? Date.now(), hidden: false }));
        // Ce que le joueur verra en revenant sur Playscreen pendant la partie.
        setDialog({ kind: "quick" });
        // Windows empêche le jeu (lancé en arrière-plan par son launcher) de passer devant
        // Playscreen : c'est Playscreen, au premier plan, qui lui cède la place.
        const game = gamesRef.current?.find((g) => g.id === event.data.gameId);
        if (game) void resumeGame(game);
        break;
      }
      case "game.stopped":
        setSession(null);
        setDialog((d) => (d?.kind === "quick" ? null : d));
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

  const play = (game: Game) => {
    if (!client) return;
    setSession({ gameId: game.id, phase: "starting", since: Date.now(), hidden: false });
    client.start(game.id).catch((error) => {
      setSession(null);
      notify("error", `Impossible de lancer ${game.name}`, describeError(error));
    });
  };

  const install = (game: Game) => {
    if (!client) return;
    setInstalls((all) => ({ ...all, [game.id]: null }));
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

  /** Reprendre : on ferme le menu et on remet le jeu au premier plan (dans Tauri). */
  const resume = (game: Game) => {
    setDialog(null);
    void resumeGame(game);
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

  const goLibrary = () => {
    setDialog(null);
    setScreen({ name: "library" });
  };

  // Start : menu rapide pendant une partie, menu principal sinon. Priorité la plus basse :
  // les écrans et fenêtres passent avant.
  useNavAction((action) => {
    if (action !== "menu" || !client) return false;
    setDialog(session?.phase === "running" ? { kind: "quick" } : { kind: "menu" });
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

  let current;
  if (screen.name === "game") {
    const game = games?.find((g) => g.id === screen.gameId) ?? null;
    current = (
      <GameDetail
        key={screen.gameId}
        client={view}
        game={game}
        loading={!games}
        installing={screen.gameId in installs}
        progress={installs[screen.gameId] ?? null}
        running={session?.gameId === screen.gameId}
        runningName={runningName}
        onPlay={play}
        onInstall={install}
        onUninstall={(g) => setDialog({ kind: "uninstall", gameId: g.id })}
        onBack={() => setScreen({ name: "library" })}
      />
    );
  } else if (screen.name === "stores") {
    current = (
      <Stores
        stores={stores}
        error={storesError}
        syncing={syncing}
        runningName={runningName}
        onLogin={login}
        onSync={sync}
        onRetry={() => void loadStores()}
        onBack={() => setScreen({ name: "library" })}
      />
    );
  } else {
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
          setScreen({ name: "game", gameId: game.id });
        }}
        onRetry={() => void loadGames()}
        onOpenStores={() => setScreen({ name: "stores" })}
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
          onHide={() => setSession((s) => (s ? { ...s, hidden: true } : s))}
        />
      )}
      {client && dialog?.kind === "menu" && (
        <SystemMenu
          onLibrary={goLibrary}
          onStores={() => {
            setDialog(null);
            setScreen({ name: "stores" });
          }}
          onReload={() => {
            setDialog(null);
            void loadGames();
            void loadStores();
            notify("info", "Bibliothèque rechargée");
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {client && dialog?.kind === "quick" && sessionGame && session && (
        <QuickMenu
          client={client}
          game={sessionGame}
          since={session.since}
          stopping={Boolean(session.stopping)}
          onResume={() => resume(sessionGame)}
          onLibrary={goLibrary}
          onQuit={(force) => quit(sessionGame, force)}
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
      {client && dialog?.kind === "install" && dialogGame && <InstallGuide game={dialogGame} onClose={() => setDialog(null)} />}
      {client && dialog?.kind === "uninstall" && dialogGame && (
        <UninstallConfirm game={dialogGame} onConfirm={() => uninstall(dialogGame)} onClose={() => setDialog(null)} />
      )}

      {!client && <EngineOffline firstConnection={false} />}
      <Toasts toasts={toasts} />
    </>
  );
}
