// Accueil : la scène du jeu sélectionné, la frise des jeux récents en bas, et la capsule des
// espaces en haut à gauche. Sur une icône (sans appuyer), la scène devient l'aperçu de
// l'espace ; la page (souvent web) ne s'ouvre qu'avec A.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { EngineClient } from "../../../api/client.ts";
import type { Game } from "../../../api/types.ts";
import { Icon } from "../components/Icons.tsx";
import { PadHints, type Pad } from "../components/PadHints.tsx";
import type { Progress } from "../components/ProgressBar.tsx";
import { useBattery } from "../components/TopBar.tsx";
import { formatBytes, formatPlaytime, STORE_LABELS } from "../format.ts";
import { useNavAction } from "../input/navigation.ts";
import { system, useSystem, type SystemSnapshot } from "../system.ts";
import { MUSIC_SITES, SPACE_HOME, SPACES, type Route, type SpaceId } from "./spaces.ts";
import "./home.css";

const DAY = 86_400_000;

/** Où était le focus sur l'accueil : un jeu, un espace, ou la tuile Bibliothèque. */
export interface HomeFocus {
  game?: string | null;
  space?: SpaceId | null;
  library?: boolean;
}
const MAX_RECENT = 8;

interface Props {
  client: EngineClient;
  games: Game[] | null;
  error: string | null;
  installs: Record<string, Progress | null>;
  runningId: string | null;
  /** Durées de partie vues pendant cette session de Playscreen (game.stopped). */
  sessions: Record<string, number>;
  /** Où remettre le focus en arrivant : un jeu ou un espace. */
  initialFocus: HomeFocus;
  onFocusChange(focus: HomeFocus): void;
  onPlay(game: Game): void;
  onInstall(game: Game): void;
  onResume(): void;
  onOptions(game: Game): void;
  onLibrary(): void;
  onNavigate(route: Route): void;
  onRetry(): void;
}

// ——— Frise : jeux récents groupés par moment ———

function daysAgo(iso: string): number {
  const date = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - date.getTime()) / DAY);
}

function bucket(iso: string): string {
  const days = daysAgo(iso);
  if (days <= 0) return "Aujourd'hui";
  if (days === 1) return "Hier";
  if (days <= 7) return "Cette semaine";
  if (days <= 31) return "Ce mois-ci";
  return "Plus tôt";
}

interface Group {
  label: string;
  games: Game[];
}

function buildTimeline(games: Game[], installs: Record<string, Progress | null>): Group[] {
  const downloading = games.filter((g) => g.id in installs);
  const rest = games.filter((g) => !(g.id in installs));
  const played = rest
    .filter((g) => g.lastPlayed)
    .sort((a, b) => new Date(b.lastPlayed!).getTime() - new Date(a.lastPlayed!).getTime())
    .slice(0, MAX_RECENT);
  const groups: Group[] = [];
  for (const game of played) {
    const label = bucket(game.lastPlayed!);
    const last = groups.at(-1);
    if (last?.label === label) last.games.push(game);
    else groups.push({ label, games: [game] });
  }
  // Peu de jeux joués (premier usage) : on complète avec les derniers ajoutés.
  if (played.length < 4) {
    const added = rest
      .filter((g) => !g.lastPlayed)
      .sort((a, b) => new Date(b.added ?? 0).getTime() - new Date(a.added ?? 0).getTime())
      .slice(0, MAX_RECENT - played.length);
    if (added.length) groups.push({ label: "Ajoutés récemment", games: added });
  }
  if (downloading.length) groups.push({ label: "Téléchargement", games: downloading.slice(0, 2) });
  return groups;
}

function playedLabel(iso: string): string {
  const days = daysAgo(iso);
  if (days <= 0) return "Joué aujourd'hui";
  if (days === 1) return "Joué hier";
  if (days < 30) return `Joué il y a ${days} jours`;
  return `Joué le ${new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`;
}

function ratio(progress: Progress | null | undefined): number | null {
  return progress && progress.bytesTotal > 0 ? Math.min(1, progress.bytesDone / progress.bytesTotal) : null;
}

// ——— Petits éléments ———

function Battery() {
  const battery = useBattery();
  if (!battery) return null;
  const percent = Math.round(battery.level * 100);
  return (
    <span className="home-batt">
      <i style={{ ["--level" as string]: `${percent}%` }} />
      {percent} %
    </span>
  );
}

function Clock() {
  const format = () => new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const [time, setTime] = useState(format);
  useEffect(() => {
    const timer = setInterval(() => setTime(format()), 10_000);
    return () => clearInterval(timer);
  }, []);
  return <span className="home-clock">{time}</span>;
}

function CoverArt({ game, client }: { game: Game; client: EngineClient }) {
  const [failed, setFailed] = useState(false);
  if (game.media?.cover && !failed) {
    return <img src={client.mediaUrl(game.id, "cover")} alt="" draggable={false} onError={() => setFailed(true)} />;
  }
  return (
    <span className={`tl-fallback store-${game.store}`}>
      <span>{game.name}</span>
    </span>
  );
}

// ——— Aperçus des espaces ———

interface Dest {
  label: string;
  sub: string;
  route?: Route;
  main?: boolean;
}

interface Preview {
  eyebrow: string;
  title: string;
  text?: string;
  live?: ReactNode;
  dests: Dest[];
  /** Ce que fait A sur l'icône. */
  open: string;
}

function LiveButton({ children, onClick }: { children: ReactNode; onClick(): void }) {
  return (
    <button className="live-act" data-focusable onClick={onClick}>
      {children}
    </button>
  );
}

function previewFor(space: SpaceId, sys: SystemSnapshot): Preview {
  switch (space) {
    case "search":
      return {
        eyebrow: "Rechercher",
        title: "Trouver un jeu",
        text: "Le clavier manette s'ouvre : tape quelques lettres du nom d'un jeu.",
        dests: [],
        open: "Rechercher",
      };
    case "boutique":
      return {
        eyebrow: "Boutique",
        title: "Acheter des jeux",
        text: "Tout s'ouvre dans le navigateur Playscreen. Ce que tu achètes arrive dans ta bibliothèque à la synchronisation suivante.",
        dests: [
          { label: "Instant Gaming", sub: "Clés pour toutes les plateformes", route: { kind: "web", site: "instant-gaming" }, main: true },
          { label: "Steam", sub: "Boutique", route: { kind: "relay", target: "store-steam" } },
          { label: "Epic Games", sub: "Jeu gratuit cette semaine", route: { kind: "relay", target: "store-epic" } },
          { label: "Xbox", sub: "Game Pass", route: { kind: "relay", target: "store-xbox" } },
          { label: "Battle.net", sub: "Boutique", route: { kind: "relay", target: "store-battlenet" } },
          { label: "Activer une clé", sub: "Steam, Epic, Xbox…", route: { kind: "relay", target: "activate-key" } },
        ],
        open: "Ouvrir Instant Gaming",
      };
    case "social": {
      const discord = sys.discord;
      const call = discord?.call;
      return {
        eyebrow: "Social",
        title: "Discord",
        text: discord ? undefined : "Discord s'ouvre dans le navigateur Playscreen : messages, salons et appels.",
        live: call ? (
          <div className="live">
            <span className="live-dot" />
            <span>
              <b>Appel en cours</b> · {call.channel} · {call.people} personnes
            </span>
            <LiveButton onClick={() => system.toggleMicrophone()}>{call.muted ? "Réactiver le micro" : "Couper le micro"}</LiveButton>
            <LiveButton onClick={() => system.leaveCall()}>Quitter</LiveButton>
          </div>
        ) : undefined,
        dests: [
          {
            label: "Ouvrir Discord",
            sub: discord ? (discord.unread ? `${discord.unread} messages non lus` : "Aucun message non lu") : "Messages et appels",
            route: { kind: "web", site: "discord" },
            main: true,
          },
          ...(discord ? [{ label: "Amis en ligne", sub: `${discord.online} sur Discord`, route: { kind: "web", site: "discord" } } satisfies Dest] : []),
          { label: "Amis des launchers", sub: "Bientôt" },
        ],
        open: "Ouvrir Discord",
      };
    }
    case "musique": {
      const music = sys.music;
      const service = music?.service ?? sys.musicServices[0] ?? "Spotify";
      const others = sys.musicServices.filter((s) => s !== service);
      return {
        eyebrow: "Musique",
        title: service,
        text: music ? undefined : "Ta musique continue pendant que tu joues ; les commandes sont aussi dans le centre rapide.",
        live: music ? (
          <div className={`live ${music.playing ? "" : "live-paused"}`}>
            <span className="live-dot" />
            <span>
              <b>{music.playing ? "En lecture" : "En pause"}</b> · {[music.title, music.artist].filter(Boolean).join(" · ")}
            </span>
            <LiveButton onClick={() => system.musicPrevious()}>|◀</LiveButton>
            <LiveButton onClick={() => system.musicToggle()}>{music.playing ? "❚❚" : "▶"}</LiveButton>
            <LiveButton onClick={() => system.musicNext()}>▶|</LiveButton>
          </div>
        ) : undefined,
        dests: [
          {
            label: `Ouvrir ${service}`,
            sub: music ? (music.playing ? "Lecture en cours" : "Reprendre l'écoute") : "Ton service de musique",
            route: { kind: "web", site: MUSIC_SITES[service] ?? "spotify" },
            main: true,
          },
          ...others.map((s) => ({ label: s, sub: "Changer de service", route: { kind: "web", site: MUSIC_SITES[s] ?? "spotify" } }) satisfies Dest),
        ],
        open: `Ouvrir ${service}`,
      };
    }
    case "internet":
      return {
        eyebrow: "Internet",
        title: "Navigateur",
        text: "Le même navigateur que la Boutique et Discord, sans page imposée.",
        dests: [
          { label: "Nouvelle page", sub: "Rechercher ou saisir une adresse", route: { kind: "web", site: "new-page" }, main: true },
          { label: "YouTube", sub: "Épinglé", route: { kind: "web", site: "youtube" } },
          { label: "Twitch", sub: "Épinglé", route: { kind: "web", site: "twitch" } },
          { label: "Wikipédia", sub: "Épinglé", route: { kind: "web", site: "wikipedia" } },
        ],
        open: "Nouvelle page",
      };
    case "trophees": {
      const last = sys.lastTrophy;
      return {
        eyebrow: "Trophées",
        title: sys.trophiesUnlocked !== null ? `${sys.trophiesUnlocked.toLocaleString("fr-FR")} trophées` : "Trophées",
        text: last
          ? `Dernier obtenu : « ${last.name} » dans ${last.game}, ${last.when}.`
          : "Tes succès Steam, Epic, Xbox et Battle.net réunis, et tes statistiques de jeu.",
        dests: [
          { label: "Par jeu", sub: "Progression de chaque jeu", route: { kind: "page", page: "trophees" }, main: true },
          { label: "Derniers obtenus", sub: "Les plus récents", route: { kind: "page", page: "trophees" } },
          { label: "Statistiques", sub: "Temps de jeu, séries", route: { kind: "page", page: "trophees" } },
        ],
        open: "Voir les trophées",
      };
    }
    case "parametres": {
      const disk = sys.disks?.[0];
      return {
        eyebrow: "Paramètres",
        title: "Paramètres",
        text: disk ? `${formatBytes(disk.freeBytes)} libres sur ${disk.letter} · ${sys.network ? `connecté à ${sys.network}` : "réseau inconnu"}` : undefined,
        // Une seule rangée : les sections les plus utiles ; les autres sont dans la page (A).
        dests: [
          { label: "Réseau", sub: sys.network ?? "Wi-Fi, câble", route: { kind: "settings", section: "reseau" } },
          { label: "Son", sub: sys.audioOutput ?? "Volume, sortie", route: { kind: "settings", section: "son" } },
          { label: "Stockage", sub: disk ? `${formatBytes(disk.freeBytes)} libres` : "Espace disque", route: { kind: "settings", section: "stockage" } },
          { label: "Comptes et launchers", sub: "Steam, Epic, Xbox…", route: { kind: "stores" } },
          { label: "Paramètres Windows…", sub: "Avec la souris virtuelle", route: { kind: "relay", target: "windows-settings" } },
        ],
        open: "Ouvrir les paramètres",
      };
    }
  }
}

// ——— Écran ———

export function Home(props: Props) {
  const { client, games, installs, runningId } = props;
  const sys = useSystem();
  const [gameId, setGameId] = useState<string | null>(props.initialFocus.game ?? null);
  const [space, setSpace] = useState<SpaceId | null>(props.initialFocus.space ?? null);
  /** Élément ciblé dans la scène : sert à l'aide des boutons. */
  const [destLabel, setDestLabel] = useState<string | null>(null);
  /** La tuile Bibliothèque a le focus. */
  const [onLibrary, setOnLibrary] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const timeline = useMemo(() => (games ? buildTimeline(games, installs) : []), [games, installs]);
  const flat = timeline.flatMap((g) => g.games);
  const game = (gameId && games?.find((g) => g.id === gameId)) || flat[0] || null;

  const focusGame = (id: string | null) => {
    setSpace(null);
    setDestLabel(null);
    setOnLibrary(false);
    if (id) setGameId(id);
    props.onFocusChange({ game: id ?? gameId, space: null });
  };
  const focusSpace = (id: SpaceId) => {
    setOnLibrary(false);
    setSpace(id);
    setDestLabel(null);
    props.onFocusChange({ game: gameId, space: id });
  };

  // Focus à l'arrivée (et après le chargement) : l'espace d'où l'on revient, sinon le jeu.
  const placed = useRef(false);
  useEffect(() => {
    if (placed.current) return;
    const root = rootRef.current;
    if (!root) return;
    const target =
      (props.initialFocus.library && root.querySelector<HTMLElement>(".tl-lib")) ||
      (space && root.querySelector<HTMLElement>(`[data-space="${space}"]`)) ||
      (game && root.querySelector<HTMLElement>(`[data-cover="${game.id}"]`)) ||
      root.querySelector<HTMLElement>("[data-cover]") ||
      (games ? root.querySelector<HTMLElement>("[data-focusable]") : null);
    if (target) {
      target.focus({ preventScroll: true });
      placed.current = true;
    }
  }, [games, timeline]);

  // Le focus ne doit jamais se perdre (un jeu qui quitte la frise, par exemple).
  useEffect(() => {
    const active = document.activeElement;
    if (!active || active === document.body || !active.isConnected) {
      rootRef.current?.querySelector<HTMLElement>("[data-cover]")?.focus({ preventScroll: true });
    }
  });

  const backToGames = () => {
    const target =
      (game && rootRef.current?.querySelector<HTMLElement>(`[data-cover="${game.id}"]`)) ||
      rootRef.current?.querySelector<HTMLElement>("[data-cover]");
    target?.focus({ preventScroll: true });
    focusGame(game?.id ?? null);
  };

  useNavAction((action) => {
    if (action === "back" && space) {
      backToGames();
      return true;
    }
    if (action === "options" && !space && !onLibrary && game) {
      props.onOptions(game);
      return true;
    }
    if (action === "search") {
      props.onNavigate(SPACE_HOME.search);
      return true;
    }
    return false;
  });

  // ——— Scène du jeu ———
  let scene: ReactNode = null;
  let hints: [Pad, ReactNode][] = [];
  if (props.error && !games) {
    scene = (
      <div className="scene2">
        <span className="scene-eb">Bibliothèque</span>
        <h1 className="scene-title scene-title-m">Impossible de charger tes jeux</h1>
        <div className="scene-line">{props.error}</div>
        <div className="scene-btns">
          <button className="rb rb-primary" data-focusable onClick={props.onRetry}>
            Réessayer
          </button>
        </div>
      </div>
    );
    hints = [["A", "Réessayer"]];
  } else if (games && games.length === 0) {
    scene = (
      <div className="scene2">
        <span className="scene-eb">Bienvenue</span>
        <h1 className="scene-title scene-title-m">Aucun jeu pour l'instant</h1>
        <div className="scene-line">Connecte un store pour retrouver tes jeux ici.</div>
        <div className="scene-btns">
          <button className="rb rb-primary" data-focusable onClick={() => props.onNavigate({ kind: "stores" })}>
            Connecter un store
          </button>
        </div>
      </div>
    );
    hints = [["A", "Connecter un store"], ["menu", "Centre rapide"]];
  } else if (game) {
    const running = game.id === runningId;
    const installing = game.id in installs;
    const progress = ratio(installs[game.id]);
    const store = STORE_LABELS[game.store];
    const eyebrow = running
      ? "En cours"
      : installing
        ? "Téléchargement"
        : !game.installed
          ? "À installer"
          : game.lastPlayed
            ? "Reprendre"
            : "Nouveau";
    const trophies = system.trophies(game.id);
    const session = props.sessions[game.id] ?? game.lastSessionSeconds ?? system.lastSession(game.id);
    const line: ReactNode[] = [];
    if (installing) {
      const p = installs[game.id];
      line.push(progress === null ? "Préparation…" : `${Math.round(progress * 100)} %`);
      if (p) line.push(`${formatBytes(p.bytesDone)} sur ${formatBytes(p.bytesTotal)}`);
    } else {
      if (game.lastPlayed) line.push(session ? `${playedLabel(game.lastPlayed)}, ${formatPlaytime(session)}` : playedLabel(game.lastPlayed));
      if (game.playtimeSeconds > 0) line.push(`${formatPlaytime(game.playtimeSeconds)} au total`);
      if (!game.installed) line.push(`${formatBytes(game.installSizeBytes)} à télécharger`);
      else if (!game.lastPlayed) line.push(`${formatBytes(game.installSizeBytes)} installés`);
    }
    if (trophies)
      line.push(
        <>
          Trophées {trophies.unlocked} / {trophies.total}{" "}
          <span className="mini" style={{ ["--ratio" as string]: `${(trophies.unlocked / trophies.total) * 100}%` }} />
        </>,
      );
    const primary = running
      ? { label: "Reprendre", icon: "▶", run: props.onResume }
      : installing
        ? { label: "Téléchargement…", icon: "", run: () => undefined }
        : game.installed
          ? { label: "Jouer", icon: "▶", run: () => props.onPlay(game) }
          : { label: "Installer", icon: "↓", run: () => props.onInstall(game) };
    scene = (
      <div className="scene2">
        <span className="scene-eb">
          {eyebrow} · {store}
        </span>
        <h1 className={`scene-title ${game.name.length > 22 ? "scene-title-m" : ""} ${game.name.length > 40 ? "scene-title-s" : ""}`}>
          {game.name}
        </h1>
        <div className="scene-line">
          {line.map((part, index) => (
            <span key={index} className="scene-part">
              {index > 0 && <i className="scene-sep" />}
              {part}
            </span>
          ))}
        </div>
        <div className="scene-btns">
          <button className={`rb rb-primary ${installing ? "rb-busy" : ""}`} data-focusable onClick={primary.run} onFocus={() => focusGame(null)}>
            {primary.icon && <span>{primary.icon}</span>}
            {primary.label}
          </button>
          <button className="rb" data-focusable onClick={() => props.onOptions(game)} onFocus={() => focusGame(null)}>
            <i className="pad pad-x">X</i> Options
          </button>
        </div>
      </div>
    );
    hints = [
      ["A", primary.label === "Téléchargement…" ? "OK" : primary.label],
      ["X", "Options"],
      ["Y", "Rechercher"],
      ["menu", "Centre rapide"],
    ];
  } else if (!games) {
    scene = (
      <div className="scene2" aria-busy="true">
        <span className="scene-eb">Bibliothèque</span>
        <h1 className="scene-title scene-title-m scene-loading">Chargement…</h1>
      </div>
    );
  }

  if (onLibrary && !space) hints = [["A", "Ouvrir la bibliothèque"], ["Y", "Rechercher"], ["menu", "Centre rapide"]];

  // ——— Aperçu d'un espace ———
  let preview: ReactNode = null;
  if (space) {
    const p = previewFor(space, sys);
    preview = (
      <div className="preview" key={space}>
        <span className="scene-eb" style={{ color: `var(--space-${space}-eb)` }}>
          {p.eyebrow}
        </span>
        <h1 className="preview-title">{p.title}</h1>
        {p.text && <p className="preview-text">{p.text}</p>}
        {p.live}
        {p.dests.length > 0 && (
          <div className="dest">
            {p.dests.map((d) => (
              <button
                key={d.label}
                className={`d ${d.main ? "d-main" : ""}`}
                data-focusable={d.route ? true : undefined}
                disabled={!d.route}
                onClick={() => d.route && props.onNavigate(d.route)}
                onFocus={() => setDestLabel(d.label)}
              >
                {d.label}
                {d.sub && <small>{d.sub}</small>}
              </button>
            ))}
          </div>
        )}
      </div>
    );
    hints = [
      ["A", destLabel ? `Ouvrir ${destLabel}` : p.open],
      ...(p.dests.length && !destLabel ? [["down", "Choisir"] satisfies [Pad, ReactNode]] : []),
      ["B", "Revenir aux jeux"],
    ];
  }

  // ——— Fond ———
  let art: ReactNode;
  if (space) art = <div className="home-art" style={{ background: `var(--space-${space})` }} key={`space-${space}`} />;
  else if (game?.media?.background)
    art = (
      <div className="home-art home-art-dim" key={game.id}>
        <img src={client.mediaUrl(game.id, "background")} alt="" draggable={false} />
      </div>
    );
  else if (game?.media?.cover)
    art = (
      <div className="home-art home-art-dim home-art-blur" key={game.id}>
        <img src={client.mediaUrl(game.id, "cover")} alt="" draggable={false} />
      </div>
    );
  else art = <div className="home-art home-art-dim home-art-flat" />;

  const discordBadge = Boolean(sys.discord?.unread || sys.discord?.call);
  const librarySize = games?.length ?? 0;

  return (
    <div className={`home ${space ? "home-space" : ""}`} ref={rootRef}>
      {art}
      <div className="home-top">
        <div className="capsule">
          {SPACES.map((s, index) => (
            <span key={s.id} className="capsule-slot">
              {(index === 1 || s.id === "parametres") && <span className="capsule-sep" />}
              <button
                className={`capsule-ico ${s.id === "social" && discordBadge ? "capsule-dot" : ""}`}
                data-focusable
                data-space={s.id}
                aria-label={s.label}
                onFocus={() => focusSpace(s.id)}
                onClick={() => props.onNavigate(SPACE_HOME[s.id])}
              >
                <Icon name={s.icon} />
                {space === s.id && <span className="ico-label">{s.label}</span>}
              </button>
            </span>
          ))}
        </div>
        <span className="spacer" />
        <div className="home-status">
          {sys.network && <span className="home-net">{sys.network === "Câble" ? "Câble" : "Wi-Fi"}</span>}
          <Battery />
          <Clock />
        </div>
      </div>

      {space ? preview : scene}

      <div className={`timeline ${space ? "timeline-dim" : ""}`}>
        {timeline.map((group) => (
          <div className="tl-group" key={group.label}>
            <small>{group.label}</small>
            <div className="tl-covers">
              {group.games.map((g) => {
                const progress = ratio(installs[g.id]);
                return (
                  <button
                    key={g.id}
                    className={`tl-cover ${!g.installed && !(g.id in installs) ? "tl-uninstalled" : ""}`}
                    data-focusable
                    data-cover={g.id}
                    aria-label={g.name}
                    onFocus={() => focusGame(g.id)}
                    onClick={() =>
                      g.id === runningId ? props.onResume() : g.installed ? props.onPlay(g) : g.id in installs ? undefined : props.onInstall(g)
                    }
                  >
                    <CoverArt game={g} client={client} />
                    {g.id === runningId && <span className="tl-badge">En cours</span>}
                    {g.id in installs && (
                      <span className="tl-dl">
                        <i style={{ width: progress === null ? "8%" : `${progress * 100}%` }} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {games && games.length > 0 && (
          <div className="tl-group">
            <small>&nbsp;</small>
            <div className="tl-covers">
              <button className="tl-lib" data-focusable onClick={props.onLibrary}
                onFocus={() => {
                  focusGame(null);
                  setOnLibrary(true);
                  props.onFocusChange({ game: gameId, space: null, library: true });
                }}
              >
                <span className="tl-lib-ico">
                  <Icon name="grid" />
                </span>
                Bibliothèque
                <br />
                {librarySize} {librarySize > 1 ? "jeux" : "jeu"}
              </button>
            </div>
          </div>
        )}
      </div>

      <PadHints className="home-hints" items={hints} />
    </div>
  );
}
