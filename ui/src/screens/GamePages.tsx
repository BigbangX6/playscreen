// La page d'un jeu (X Options depuis l'accueil, A dans la bibliothèque), ses trophées et
// ses réglages. Même langage que l'accueil : grande image, titre, une ligne d'infos, puis
// des choix.

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { EngineClient } from "../../../api/client.ts";
import type { Game } from "../../../api/types.ts";
import { Icon } from "../components/Icons.tsx";
import { PadHints, type Pad } from "../components/PadHints.tsx";
import type { Progress } from "../components/ProgressBar.tsx";
import { formatBytes, formatPlaytime, formatRelativeDate, STORE_LABELS } from "../format.ts";
import { useNavAction } from "../input/navigation.ts";
import { system, useSystem, type TrophyDetail } from "../system.ts";
import { Page } from "./Pages.tsx";
import type { Route } from "./spaces.ts";
import "./home.css";
import "./console-pages.css";

function ratio(progress: Progress | null | undefined): number | null {
  return progress && progress.bytesTotal > 0 ? Math.min(1, progress.bytesDone / progress.bytesTotal) : null;
}

/** Le Workshop n'existe que sur Steam, et il faut l'identifiant Steam du jeu. */
export function workshopRoute(game: Game): Route | null {
  return game.store === "steam" && game.storeGameId ? { kind: "relay", target: `steam-workshop:${game.storeGameId}` } : null;
}

function propertiesRoute(game: Game): Route | null {
  return game.store !== "other" && game.storeGameId ? { kind: "relay", target: `game-properties:${game.store}:${game.storeGameId}` } : null;
}

// ——— Page du jeu ———

interface GameProps {
  client: EngineClient;
  game: Game | null;
  loading: boolean;
  installing: boolean;
  progress: Progress | null;
  running: boolean;
  lastSession: number | null;
  onPlay(game: Game): void;
  onInstall(game: Game): void;
  onResume(): void;
  onUninstall(game: Game): void;
  onNavigate(route: Route): void;
  onBack(): void;
}

export function GamePage(props: GameProps) {
  const { client, game, installing, running } = props;
  useSystem(); // Trophées et réglages du jeu suivent le moteur.
  const ref = useRef<HTMLDivElement>(null);
  const [recent, setRecent] = useState<TrophyDetail[] | null>(null);
  const [focusLabel, setFocusLabel] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>(".rb-primary")?.focus({ preventScroll: true });
  }, [game?.id]);

  useEffect(() => {
    if (!game) return;
    let live = true;
    void system.trophyDetails(game.id).then((list) => {
      if (!live) return;
      const unlocked = (list ?? []).filter((t) => t.unlockedAt).sort((a, b) => b.unlockedAt!.localeCompare(a.unlockedAt!));
      setRecent(unlocked.slice(0, 4));
    });
    return () => {
      live = false;
    };
  }, [game?.id]);

  useNavAction((action) => {
    if (action === "back") {
      props.onBack();
      return true;
    }
    if (action === "options" && game) {
      props.onNavigate({ kind: "game-settings", gameId: game.id });
      return true;
    }
    return false;
  });

  if (!game) {
    return (
      <Page title="Jeu" onBack={props.onBack} hints={[["B", "Retour"]]}>
        <p className="page-note">{props.loading ? "Chargement…" : "Ce jeu n'est plus dans la bibliothèque."}</p>
      </Page>
    );
  }

  const trophies = system.trophies(game.id);
  const workshop = workshopRoute(game);
  const properties = propertiesRoute(game);
  const progress = ratio(props.progress);
  const store = STORE_LABELS[game.store];

  const line: ReactNode[] = [];
  if (installing) {
    line.push(progress === null ? "Préparation…" : `Téléchargement · ${Math.round(progress * 100)} %`);
    if (props.progress) line.push(`${formatBytes(props.progress.bytesDone)} sur ${formatBytes(props.progress.bytesTotal)}`);
  } else {
    if (game.lastPlayed)
      line.push(`Joué ${formatRelativeDate(game.lastPlayed).toLowerCase()}${props.lastSession ? `, ${formatPlaytime(props.lastSession)}` : ""}`);
    line.push(game.playtimeSeconds > 0 ? `${formatPlaytime(game.playtimeSeconds)} au total` : "Jamais joué");
    line.push(game.installed ? `${formatBytes(game.installSizeBytes)} installés` : `${formatBytes(game.installSizeBytes)} à télécharger`);
  }

  const primary = running
    ? { label: "Reprendre", icon: "▶", run: props.onResume }
    : installing
      ? { label: "Téléchargement…", icon: "", run: () => undefined }
      : game.installed
        ? { label: "Jouer", icon: "▶", run: () => props.onPlay(game) }
        : { label: "Installer", icon: "↓", run: () => props.onInstall(game) };

  const dests: { label: string; sub: string; route: Route; main?: boolean }[] = [];
  if (trophies)
    dests.push({ label: "Trophées", sub: `${trophies.unlocked} / ${trophies.total} obtenus`, route: { kind: "trophies", gameId: game.id }, main: true });
  if (workshop) dests.push({ label: "Workshop", sub: "Mods et contenus de la communauté", route: workshop });
  dests.push({ label: "Paramètres du jeu", sub: "Favori, fichiers, propriétés…", route: { kind: "game-settings", gameId: game.id } });
  if (properties) dests.push({ label: `Dans ${store}`, sub: "Propriétés du jeu", route: properties });

  const hints: [Pad, ReactNode][] = [
    ["A", focusLabel ?? primary.label],
    ["X", "Paramètres du jeu"],
    ["B", "Retour"],
  ];

  return (
    <div className="home game-page" ref={ref}>
      {game.media?.background ? (
        <div className="home-art home-art-dim" key={game.id}>
          <img src={client.mediaUrl(game.id, "background")} alt="" draggable={false} />
        </div>
      ) : game.media?.cover ? (
        <div className="home-art home-art-dim home-art-blur" key={game.id}>
          <img src={client.mediaUrl(game.id, "cover")} alt="" draggable={false} />
        </div>
      ) : (
        <div className="home-art home-art-dim home-art-flat" />
      )}

      <div className="scene2 game-scene">
        <span className="scene-eb">
          {running ? "En cours" : store}
          {game.installed && !running ? " · installé" : ""}
        </span>
        <h1 className={`scene-title ${game.name.length > 22 ? "scene-title-m" : ""} ${game.name.length > 40 ? "scene-title-s" : ""}`}>{game.name}</h1>
        <div className="scene-line">
          {line.map((part, index) => (
            <span key={index} className="scene-part">
              {index > 0 && <i className="scene-sep" />}
              {part}
            </span>
          ))}
        </div>
        {installing && (
          <span className="game-progress">
            <i style={{ width: `${(progress ?? 0.03) * 100}%` }} />
          </span>
        )}
        <div className="scene-btns">
          <button
            className={`rb rb-primary ${installing ? "rb-busy" : ""}`}
            data-focusable
            onClick={primary.run}
            onFocus={() => setFocusLabel(null)}
          >
            {primary.icon && <span>{primary.icon}</span>}
            {primary.label}
          </button>
          {game.installed && !running && (
            <button className="rb" data-focusable onClick={() => props.onUninstall(game)} onFocus={() => setFocusLabel("Désinstaller")}>
              Désinstaller
            </button>
          )}
        </div>
      </div>

      <div className="game-below">
        <div className="dest">
          {dests.map((d) => (
            <button
              key={d.label}
              className={`d ${d.main ? "d-main" : ""}`}
              data-focusable
              onClick={() => props.onNavigate(d.route)}
              onFocus={() => setFocusLabel(d.label === "Trophées" ? "Voir les trophées" : `Ouvrir ${d.label}`)}
            >
              {d.label}
              <small>{d.sub}</small>
            </button>
          ))}
        </div>
        {recent && recent.length > 0 && (
          <div className="game-trophies">
            <span className="game-sec">Derniers trophées</span>
            <div className="game-trophy-row">
              {recent.map((t) => (
                <div key={t.id} className="trophy-chip">
                  <span className="trophy-ico trophy-ico-on">
                    <Icon name="trophy" />
                  </span>
                  <span>
                    {t.name}
                    <small>{formatRelativeDate(t.unlockedAt).toLowerCase()}</small>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <PadHints className="home-hints" items={hints} />
    </div>
  );
}

// ——— Trophées d'un jeu ———

type TrophyFilter = "all" | "unlocked" | "locked";
const FILTERS: [TrophyFilter, string][] = [
  ["all", "Tous"],
  ["unlocked", "Obtenus"],
  ["locked", "À obtenir"],
];

export function TrophyDetailPage({ game, onBack }: { game: Game | null; onBack(): void }) {
  const [list, setList] = useState<TrophyDetail[] | null | undefined>(undefined);
  const [filter, setFilter] = useState<TrophyFilter>("all");

  useEffect(() => {
    if (!game) return;
    void system.trophyDetails(game.id).then(setList);
  }, [game?.id]);

  useNavAction((action) => {
    if (action !== "previousTab" && action !== "nextTab") return false;
    const index = FILTERS.findIndex(([f]) => f === filter);
    setFilter(FILTERS[(index + (action === "nextTab" ? 1 : -1) + FILTERS.length) % FILTERS.length]![0]);
    return true;
  });

  const summary = game ? system.trophies(game.id) : null;
  const sorted = [...(list ?? [])].sort((a, b) =>
    a.unlockedAt && b.unlockedAt ? b.unlockedAt.localeCompare(a.unlockedAt) : a.unlockedAt ? -1 : b.unlockedAt ? 1 : (b.rarity ?? 0) - (a.rarity ?? 0),
  );
  const shown = sorted.filter((t) => (filter === "all" ? true : filter === "unlocked" ? t.unlockedAt : !t.unlockedAt));

  return (
    <Page
      title="Trophées"
      subtitle={game?.name}
      onBack={onBack}
      hints={[
        ["LB RB", "Filtrer"],
        ["B", "Retour"],
      ]}
    >
      {summary && (
        <div className="disk trophy-head">
          <div className="disk-head">
            <b>
              {summary.unlocked} / {summary.total} obtenus
            </b>
            <span>{Math.round((summary.unlocked / summary.total) * 100)} %</span>
          </div>
          <div className="stack">
            <i className="stack-games" style={{ width: `${(summary.unlocked / summary.total) * 100}%` }} />
          </div>
          <div className="trophy-tabs">
            <span className="pad pad-s">LB</span>
            {FILTERS.map(([f, label]) => (
              <span key={f} className={`trophy-tab ${f === filter ? "trophy-tab-on" : ""}`}>
                {label}
              </span>
            ))}
            <span className="pad pad-s">RB</span>
          </div>
        </div>
      )}
      {list === undefined && <p className="page-note">Chargement des trophées…</p>}
      {list === null && <p className="page-note">Le détail des trophées arrive bientôt (moteur). Le total est déjà là.</p>}
      {shown.map((t) => {
        const hidden = t.secret && !t.unlockedAt;
        return (
          <button key={t.id} className={`srow trophy-row ${t.unlockedAt ? "" : "trophy-locked"}`} data-focusable>
            <span className={`trophy-ico ${t.unlockedAt ? "trophy-ico-on" : ""}`}>
              <Icon name="trophy" />
            </span>
            <span className="trophy-text">
              <b>{hidden ? "Trophée secret" : t.name}</b>
              <small>{hidden ? "Continue à jouer pour le découvrir." : t.description}</small>
            </span>
            <span className="trophy-meta">
              {t.unlockedAt ? `Obtenu ${formatRelativeDate(t.unlockedAt).toLowerCase()}` : "À obtenir"}
              {t.rarity !== null && <small>{t.rarity.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % des joueurs</small>}
            </span>
          </button>
        );
      })}
    </Page>
  );
}

// ——— Paramètres d'un jeu ———

interface SettingsProps {
  game: Game | null;
  onNavigate(route: Route): void;
  onUninstall(game: Game): void;
  onNotify(title: string, message?: string): void;
  onBack(): void;
}

export function GameSettingsPage({ game, onNavigate, onUninstall, onNotify, onBack }: SettingsProps) {
  useSystem();
  if (!game) {
    return (
      <Page title="Paramètres du jeu" onBack={onBack} hints={[["B", "Retour"]]}>
        <p className="page-note">Ce jeu n'est plus dans la bibliothèque.</p>
      </Page>
    );
  }
  const store = STORE_LABELS[game.store];
  const options = system.gameOptions(game.id);
  const workshop = workshopRoute(game);
  const properties = propertiesRoute(game);

  const rows: { label: string; sub?: string; value: ReactNode; run?: () => void; danger?: boolean }[] = [];
  if (options) {
    rows.push({
      label: "Favori",
      sub: "· en tête de la bibliothèque",
      value: options.favorite ? "✓ Oui" : "Non",
      run: () => system.setGameOption(game.id, "favorite", !options.favorite),
    });
    rows.push({
      label: "Caché",
      sub: "· n'apparaît plus sur l'accueil ni dans la bibliothèque",
      value: options.hidden ? "✓ Oui" : "Non",
      run: () => system.setGameOption(game.id, "hidden", !options.hidden),
    });
    if (game.installed && game.store !== "other")
      rows.push({
        label: "Vérifier les fichiers du jeu",
        sub: `· ${store} répare ce qui manque`,
        value: "Lancer ›",
        run: () => (system.verifyGame(game.id) ? onNotify(`${store} vérifie ${game.name}`, "Ça peut prendre quelques minutes.") : onNotify("Pas encore possible ici")),
      });
  }
  if (properties) rows.push({ label: `Propriétés dans ${store}`, sub: "· options de lancement, langue, versions", value: "Ouvrir ›", run: () => onNavigate(properties) });
  if (workshop) rows.push({ label: "Workshop", sub: "· mods et contenus de la communauté", value: "Ouvrir ›", run: () => onNavigate(workshop) });
  if (game.installed) {
    if (game.installDirectory) rows.push({ label: "Emplacement", value: <span className="srow-dim">{game.installDirectory}</span> });
    rows.push({ label: "Taille", value: formatBytes(game.installSizeBytes) });
    rows.push({ label: "Désinstaller", sub: "· libère la place ; réinstallable depuis la bibliothèque", value: "›", run: () => onUninstall(game), danger: true });
  }

  return (
    <Page
      title="Paramètres du jeu"
      subtitle={game.name}
      onBack={onBack}
      hints={[
        ["A", "Choisir"],
        ["B", "Retour"],
      ]}
    >
      {rows.map((row) => (
        <button key={row.label} className={`srow ${row.danger ? "srow-danger" : ""}`} data-focusable onClick={() => row.run?.()}>
          <span>
            {row.label} {row.sub && <small>{row.sub}</small>}
          </span>
          <span>{row.value}</span>
        </button>
      ))}
    </Page>
  );
}
