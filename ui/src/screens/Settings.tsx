// Paramètres : la liste à gauche, le contenu à droite. On ne refait que les réglages
// courants ; la dernière ligne ouvre les vrais Paramètres Windows par le relais.

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Game, Store, Volume } from "../../../api/types.ts";
import { PadHints, type Pad } from "../components/PadHints.tsx";
import { formatBytes, formatRelativeDate, STORE_LABELS } from "../format.ts";
import { useNavAction } from "../input/navigation.ts";
import { system, useSystem, type PowerAction } from "../system.ts";
import { SETTINGS_SECTIONS, type Route, type SettingsSection } from "./spaces.ts";
import "./console-pages.css";

interface Props {
  section: SettingsSection;
  games: Game[] | null;
  stores: Store[] | null;
  volume: Volume | null;
  onSection(section: SettingsSection): void;
  onNavigate(route: Route): void;
  onOpenGame(game: Game): void;
  onUninstall(game: Game): void;
  onPower(action: PowerAction): void;
  onBack(): void;
}

interface Row {
  label: string;
  sub?: string;
  value?: ReactNode;
  run?: () => void;
  game?: Game;
}

function shortAgo(iso: string | null | undefined): string {
  if (!iso) return "jamais joué";
  const label = formatRelativeDate(iso).toLowerCase();
  return `joué ${label.replace(/^il y a (\d+) jours$/, "il y a $1 j")}`;
}

export function Settings(props: Props) {
  const { section } = props;
  const sys = useSystem();
  const rootRef = useRef<HTMLDivElement>(null);
  /** Le focus est dans le contenu (la ligne de la liste reste marquée). */
  const [inContent, setInContent] = useState(false);
  const [focusedRow, setFocusedRow] = useState<Row | null>(null);

  useEffect(() => {
    rootRef.current?.querySelector<HTMLElement>(`[data-section="${section}"]`)?.focus({ preventScroll: true });
  }, []);

  const installed = (props.games ?? [])
    .filter((g) => g.installed)
    .sort((a, b) => (b.installSizeBytes ?? 0) - (a.installSizeBytes ?? 0));
  const gamesBytes = installed.reduce((sum, g) => sum + (g.installSizeBytes ?? 0), 0);

  const unavailable: Row = { label: "Pas encore disponible", sub: "Ce réglage arrive avec le moteur" };
  const windows = (what: string): Row => ({ label: what, value: "Ouvrir ›", run: () => props.onNavigate({ kind: "relay", target: "windows-settings" }) });

  let rows: Row[] = [];
  let header: ReactNode = null;
  switch (section) {
    case "reseau":
      rows = sys.network
        ? [{ label: sys.network === "Câble" ? "Câble" : "Wi-Fi", sub: `· ${sys.network}`, value: "Connecté" }, windows("Autres réseaux")]
        : [unavailable, windows("Réseau")];
      break;
    case "manettes":
      rows = [
        ...(sys.controllerBattery !== null ? [{ label: "Manette", sub: "· sans fil", value: `${sys.controllerBattery} %` }] : [unavailable]),
        windows("Associer une manette Bluetooth"),
      ];
      break;
    case "son":
      rows = [
        props.volume ? { label: "Volume", sub: "· réglable dans le centre rapide", value: props.volume.muted ? "Coupé" : String(props.volume.level) } : unavailable,
        ...(sys.audioOutput ? [{ label: "Sortie audio", value: sys.audioOutput, run: () => system.nextAudioOutput() }] : []),
        windows("Autres réglages du son"),
      ];
      break;
    case "ecran":
      rows = [
        { label: "Résolution", value: `${window.screen.width} × ${window.screen.height}` },
        { label: "Luminosité", value: sys.brightness !== null ? `${sys.brightness} %` : "Non réglable sur cet écran" },
        windows("Autres réglages de l'écran"),
      ];
      break;
    case "stockage": {
      const disk = sys.disks?.[0];
      if (disk) {
        const games = disk.gamesBytes || gamesBytes;
        const other = disk.totalBytes - disk.freeBytes - games;
        header = (
          <div className="disk">
            <div className="disk-head">
              <b>
                {disk.letter} · {disk.label}
              </b>
              <span>
                {formatBytes(disk.freeBytes)} libres sur {formatBytes(disk.totalBytes)}
              </span>
            </div>
            <div className="stack">
              <i className="stack-games" style={{ width: `${(games / disk.totalBytes) * 100}%` }} />
              <i className="stack-other" style={{ width: `${(Math.max(0, other) / disk.totalBytes) * 100}%` }} />
            </div>
            <div className="legend2">
              <span className="legend2-games">Jeux {formatBytes(games)}</span>
              <span className="legend2-other">Windows et autres {formatBytes(Math.max(0, other))}</span>
            </div>
          </div>
        );
      }
      rows = installed.map((game) => ({
        label: game.name,
        sub: `· ${STORE_LABELS[game.store]} · ${shortAgo(game.lastPlayed)}`,
        value: formatBytes(game.installSizeBytes),
        run: () => props.onOpenGame(game),
        game,
      }));
      if (!rows.length) rows = [{ label: "Aucun jeu installé" }];
      break;
    }
    case "comptes":
      rows = (props.stores ?? []).map((store) => ({
        label: store.name,
        sub: `· ${store.gameCount} ${store.gameCount > 1 ? "jeux" : "jeu"}`,
        value: store.connected === null ? "Vérification…" : store.connected ? "Connecté" : "Non connecté",
        run: () => props.onNavigate({ kind: "launcher", store: store.id }),
      }));
      break;
    case "alimentation":
      rows = [
        { label: "Mettre en veille", value: "›", run: () => props.onPower("sleep") },
        { label: "Éteindre", value: "›", run: () => props.onPower("shutdown") },
        { label: "Redémarrer", value: "›", run: () => props.onPower("restart") },
        windows("Options d'alimentation"),
      ];
      break;
    case "playscreen":
      rows = [
        { label: "Ouvrir Playscreen, revenir d'une page", sub: "· dès l'appui", value: "Select + Y" },
        { label: "Disposition des boutons", value: "Xbox" },
      ];
      break;
  }

  const enterContent = () => rootRef.current?.querySelector<HTMLElement>(".settings-content [data-focusable]")?.focus({ preventScroll: true });

  useNavAction((action) => {
    if (action === "back") {
      if (inContent) rootRef.current?.querySelector<HTMLElement>(`[data-section="${section}"]`)?.focus({ preventScroll: true });
      else props.onBack();
      return true;
    }
    if (action === "options" && inContent && focusedRow?.game) {
      props.onUninstall(focusedRow.game);
      return true;
    }
    return false;
  });

  const hints: [Pad, ReactNode][] = [["A", "Ouvrir"]];
  if (inContent && focusedRow?.game) hints.push(["X", "Désinstaller"]);
  hints.push(["B", "Retour"]);

  return (
    <div className="console-page settings" ref={rootRef}>
      <div className="console-art" />
      <h1 className="title-s">Paramètres</h1>
      <div className="settings-grid">
        <div className="settings-list">
          {SETTINGS_SECTIONS.map(([id, label]) => (
            <button
              key={id}
              className={`mi ${id === section && inContent ? "mi-current" : ""}`}
              data-focusable
              data-section={id}
              onFocus={() => {
                setInContent(false);
                setFocusedRow(null);
                if (id !== section) props.onSection(id);
              }}
              onClick={() => (id === "comptes" ? props.onNavigate({ kind: "launchers" }) : enterContent())}
            >
              {label}
            </button>
          ))}
          <button
            className="mi mi-out"
            data-focusable
            onFocus={() => setInContent(false)}
            onClick={() => props.onNavigate({ kind: "relay", target: "windows-settings" })}
          >
            ↗&nbsp; Paramètres Windows…
          </button>
        </div>
        <div className="settings-content" key={section}>
          {header}
          {rows.map((row, index) => (
            <button
              key={`${row.label}-${index}`}
              className="srow"
              data-focusable
              onFocus={() => {
                setInContent(true);
                setFocusedRow(row);
              }}
              onClick={() => row.run?.()}
            >
              <span>
                {row.label} {row.sub && <small>{row.sub}</small>}
              </span>
              {row.value !== undefined && <span>{row.value}</span>}
            </button>
          ))}
        </div>
      </div>
      <PadHints className="console-hints" items={hints} />
    </div>
  );
}
