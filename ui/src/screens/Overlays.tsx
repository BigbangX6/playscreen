// Fenêtres par-dessus les écrans : menu principal, écran d'attente du lancement, menu
// rapide en jeu, accompagnement (connexion, installation), confirmation, moteur indisponible.

import { useEffect, useRef, useState } from "react";
import type { EngineClient } from "../../../api/client.ts";
import type { Game, LauncherState, Store, Volume } from "../../../api/types.ts";
import { useNavAction } from "../input/navigation.ts";
import { Cover } from "../components/Cover.tsx";
import { Hints } from "../components/Hints.tsx";
import { Overlay } from "../components/Overlay.tsx";
import { Spinner } from "../components/Spinner.tsx";
import { BatteryIndicator, useBattery } from "../components/TopBar.tsx";
import { formatDuration, INSTALL_GUIDANCE, STORE_LABELS } from "../format.ts";

/** Secondes écoulées depuis `since` (ms), mises à jour chaque seconde. */
function useElapsed(since: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, (now - since) / 1000);
}

// ——— Menu principal (Start) ———

interface MenuProps {
  onLibrary(): void;
  onStores(): void;
  onReload(): void;
  onClose(): void;
}

export function SystemMenu({ onLibrary, onStores, onReload, onClose }: MenuProps) {
  return (
    <Overlay variant="panel" title="Menu" onBack={onClose} onAction={(a) => (a === "menu" ? (onClose(), true) : false)}>
      <div className="menu-list">
        <button className="menu-item" data-focusable onClick={onLibrary}>
          <span className="menu-icon">▦</span>Bibliothèque
        </button>
        <button className="menu-item" data-focusable onClick={onStores}>
          <span className="menu-icon">⇄</span>Stores et comptes
        </button>
        <button className="menu-item" data-focusable onClick={onReload}>
          <span className="menu-icon">↻</span>Recharger la bibliothèque
        </button>
      </div>
      <Hints
        items={[
          ["confirm", "Choisir"],
          ["back", "Fermer"],
        ]}
      />
    </Overlay>
  );
}

// ——— Écran d'attente : un jeu (ou son launcher) démarre (F25, F26) ———

interface LaunchProps {
  client: EngineClient;
  game: Game;
  since: number;
  /** État du launcher envoyé par le moteur (absent pour Xbox et les jeux hors store). */
  launcher?: LauncherState;
  onHide(): void;
}

/** Message de l'écran d'attente : ce que fait le launcher, sinon une estimation selon le temps. */
function launchMessage(game: Game, launcher: LauncherState | undefined, elapsed: number): string {
  const store = STORE_LABELS[game.store];
  if (launcher === "updating") return `${store} se met à jour. Le jeu se lancera ensuite tout seul.`;
  // « Fermé » juste après la demande : le launcher n'a pas encore eu le temps de démarrer.
  if (launcher === "starting" || launcher === "closed") return `${store} démarre, puis il lancera le jeu…`;
  if (elapsed < 8) return game.store === "other" ? "Le jeu démarre…" : `${store} démarre le jeu…`;
  if (launcher === "ready") return `Le jeu prend un peu plus de temps : ${store} le vérifie peut-être.`;
  // Jamais un écran figé : sans nouvelles du launcher, le message évolue avec le temps.
  return elapsed < 25
    ? `${store} prend un peu plus de temps : il vérifie peut-être le jeu.`
    : `${store} se met peut-être à jour. Le jeu se lancera ensuite tout seul.`;
}

export function Launching({ client, game, since, launcher, onHide }: LaunchProps) {
  const elapsed = useElapsed(since);
  const message = launchMessage(game, launcher, elapsed);
  return (
    <Overlay variant="fullscreen" onBack={onHide}>
      <div className="launch-bg">
        {game.media?.background && <img src={client.mediaUrl(game.id, "background")} alt="" draggable={false} />}
      </div>
      <div className="launch-content">
        <div className="launch-cover">
          <Cover game={game} src={game.media?.cover ? client.mediaUrl(game.id, "cover") : null} titleSize={2} />
        </div>
        <div className="launch-text">
          <span className="eyebrow">Lancement</span>
          <h1>{game.name}</h1>
          <p className="launch-message">
            <Spinner size={3} /> {message}
          </p>
          <p className="muted">{formatDuration(elapsed)}</p>
          {elapsed >= 8 && (
            <button className="btn btn-ghost" data-focusable onClick={onHide}>
              Revenir à la bibliothèque
            </button>
          )}
        </div>
      </div>
      <Hints items={[["back", "Masquer"]]} />
    </Overlay>
  );
}

// ——— Menu rapide en jeu (D10 : Select + Start pendant une partie, Start ici) ———

interface QuickProps {
  client: EngineClient;
  game: Game;
  since: number;
  /** Une fermeture a été demandée : on attend la fin de partie. */
  stopping: boolean;
  onResume(): void;
  onLibrary(): void;
  onQuit(force: boolean): void;
}

const VOLUME_STEP = 5;

/** Volume de Windows : gauche / droite pour régler, A pour couper ou remettre le son. */
function VolumeItem({ client }: { client: EngineClient }) {
  const [volume, setVolume] = useState<Volume | null>(null);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    client.volume().then(setVolume, () => setVolume(null));
  }, [client]);

  const change = (patch: { level?: number; muted?: boolean }) => {
    client.setVolume(patch).then(setVolume, () => undefined);
  };

  useNavAction((action) => {
    if (!volume || document.activeElement !== ref.current) return false;
    if (action === "left") change({ level: volume.level - VOLUME_STEP });
    else if (action === "right") change({ level: volume.level + VOLUME_STEP });
    else return false;
    return true;
  });

  if (!volume) return null;
  return (
    <button ref={ref} className="menu-item" data-focusable onClick={() => change({ muted: !volume.muted })}>
      <span className="menu-icon">♪</span>
      Volume
      <span className="spacer" />
      <span className="muted">◀ {volume.muted ? "coupé" : `${volume.level} %`} ▶</span>
    </button>
  );
}

export function QuickMenu({ client, game, since, stopping, onResume, onLibrary, onQuit }: QuickProps) {
  const elapsed = useElapsed(since);
  const battery = useBattery();
  // Forcer la fermeture : demandé une seconde fois pour éviter une perte de partie.
  const [confirmForce, setConfirmForce] = useState(false);
  return (
    <Overlay variant="panel" onBack={onResume} onAction={(a) => (a === "menu" ? (onResume(), true) : false)}>
      <div className="quick-head">
        <div className="quick-cover">
          <Cover game={game} src={game.media?.cover ? client.mediaUrl(game.id, "cover") : null} titleSize={1.2} />
        </div>
        <div>
          <span className="eyebrow">En cours</span>
          <h2 className="quick-title">{game.name}</h2>
          <p className="muted">Session : {formatDuration(elapsed)}</p>
        </div>
      </div>
      {battery && (
        <div className="quick-row">
          Batterie <BatteryIndicator battery={battery} />
        </div>
      )}
      <div className="menu-list">
        <button className="menu-item" data-focusable onClick={onResume}>
          <span className="menu-icon">▶</span>Reprendre
        </button>
        <button className="menu-item" data-focusable onClick={onLibrary}>
          <span className="menu-icon">▦</span>Bibliothèque
        </button>
        <VolumeItem client={client} />
        <button className="menu-item" data-focusable disabled={stopping} onClick={() => onQuit(false)}>
          <span className="menu-icon">⏏</span>
          {stopping ? "Fermeture du jeu…" : "Quitter le jeu"}
        </button>
        <button
          className="menu-item"
          data-focusable
          onClick={() => (confirmForce ? onQuit(true) : setConfirmForce(true))}
          onBlur={() => setConfirmForce(false)}
        >
          <span className="menu-icon">✕</span>
          {confirmForce ? "Confirmer : la progression non sauvegardée sera perdue" : "Forcer la fermeture"}
        </button>
      </div>
      <Hints
        items={[
          ["confirm", "Choisir"],
          ["back", "Reprendre"],
        ]}
      />
    </Overlay>
  );
}

// ——— Accompagnement : connexion à un store (F21 : Recommencer / Retour) ———

interface LoginProps {
  store: Store;
  alternative: boolean;
  failed: boolean;
  onRetry(): void;
  onClose(): void;
}

export function LoginGuide({ store, alternative, failed, onRetry, onClose }: LoginProps) {
  const instructions = alternative
    ? "Ton navigateur s'ouvre sur la page d'Epic Games. Connecte-toi, puis copie le code affiché dans la fenêtre de Playnite."
    : store.id === "steam"
      ? "La fenêtre de Steam est ouverte en grand. Scanne le QR code avec l'appli Steam de ton téléphone, ou saisis tes identifiants."
      : `La fenêtre de connexion de ${store.name} est ouverte en grand. Connecte-toi dedans : Playscreen reprend la main tout seul ensuite.`;
  return (
    <Overlay title={`Connexion à ${store.name}`} onBack={onClose}>
      <div className="guide">
        {failed ? (
          <p className="guide-status guide-status-warn">La connexion n'a pas abouti.</p>
        ) : (
          <p className="guide-status">
            <Spinner size={3} /> En attente de la connexion…
          </p>
        )}
        <p className="guide-text">{instructions}</p>
      </div>
      <div className="dialog-actions">
        <button className="btn btn-primary" data-focusable onClick={onRetry}>
          Recommencer
        </button>
        <button className="btn btn-ghost" data-focusable onClick={onClose}>
          Retour
        </button>
      </div>
    </Overlay>
  );
}

// ——— Accompagnement : le launcher demande une action pour installer (F4, F27) ———

export function InstallGuide({ game, launcher, onClose }: { game: Game; launcher?: LauncherState; onClose(): void }) {
  const store = STORE_LABELS[game.store];
  const status =
    launcher === "updating"
      ? `${store} se met à jour. Playscreen lui renverra la demande dès qu'il sera prêt.`
      : launcher === "starting" || launcher === "closed"
        ? `${store} démarre…`
        : `${store} prend la main…`;
  return (
    <Overlay title={`Installer ${game.name}`} onBack={onClose}>
      <div className="guide">
        <p className="guide-status">
          <Spinner size={3} /> {status}
        </p>
        <p className="guide-text guide-text-strong">{INSTALL_GUIDANCE[game.store]}</p>
        <p className="muted">Playscreen suit le téléchargement dès qu'il commence.</p>
      </div>
      <div className="dialog-actions">
        <button className="btn btn-primary" data-focusable onClick={onClose}>
          Compris
        </button>
      </div>
    </Overlay>
  );
}

// ——— Confirmation de désinstallation (le choix sûr a le focus) ———

export function UninstallConfirm({ game, onConfirm, onClose }: { game: Game; onConfirm(): void; onClose(): void }) {
  return (
    <Overlay title={`Désinstaller ${game.name} ?`} onBack={onClose} initialFocus=".dialog-cancel">
      <p className="guide-text">Les fichiers du jeu seront supprimés de ce PC. Tu pourras le réinstaller depuis la bibliothèque.</p>
      <div className="dialog-actions">
        <button className="btn btn-danger" data-focusable onClick={onConfirm}>
          Désinstaller
        </button>
        <button className="btn btn-ghost dialog-cancel" data-focusable onClick={onClose}>
          Annuler
        </button>
      </div>
    </Overlay>
  );
}

// ——— Moteur indisponible (démarrage ou redémarrage de Playnite) ———

export function EngineOffline({ firstConnection, error }: { firstConnection: boolean; error?: string }) {
  return (
    <div className="engine-offline">
      <span className="brand brand-big">
        <span className="brand-mark">▶</span>Playscreen
      </span>
      <Spinner size={6} />
      <h2>{firstConnection ? "Démarrage…" : "Reconnexion au moteur de jeux…"}</h2>
      <p className="muted">
        {firstConnection
          ? "Préparation de ta bibliothèque."
          : "Le moteur redémarre. Playscreen se reconnecte tout seul, rien à faire."}
      </p>
      {error && <p className="engine-error">{error}</p>}
    </div>
  );
}
