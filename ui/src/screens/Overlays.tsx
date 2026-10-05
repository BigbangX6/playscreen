// Fenêtres par-dessus les écrans : écran d'attente du lancement, accompagnement (connexion,
// installation), confirmation, moteur indisponible. Le menu est devenu le centre rapide
// (QuickCenter.tsx).

import { useEffect, useState } from "react";
import type { EngineClient } from "../../../api/client.ts";
import type { Game, Store } from "../../../api/types.ts";
import { Cover } from "../components/Cover.tsx";
import { Hints } from "../components/Hints.tsx";
import { Overlay } from "../components/Overlay.tsx";
import { Spinner } from "../components/Spinner.tsx";
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

// ——— Écran d'attente : un jeu (ou son launcher) démarre (F25, F26) ———

interface LaunchProps {
  client: EngineClient;
  game: Game;
  since: number;
  onHide(): void;
}

export function Launching({ client, game, since, onHide }: LaunchProps) {
  const elapsed = useElapsed(since);
  const store = STORE_LABELS[game.store];
  // Jamais un écran figé : le message évolue avec le temps d'attente.
  const message =
    elapsed < 8
      ? game.store === "other"
        ? "Le jeu démarre…"
        : `${store} démarre le jeu…`
      : elapsed < 25
        ? `${store} prend un peu plus de temps : il vérifie peut-être le jeu.`
        : `${store} se met peut-être à jour. Le jeu se lancera ensuite tout seul.`;
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

export function InstallGuide({ game, onClose }: { game: Game; onClose(): void }) {
  return (
    <Overlay title={`Installer ${game.name}`} onBack={onClose}>
      <div className="guide">
        <p className="guide-status">
          <Spinner size={3} /> {STORE_LABELS[game.store]} prend la main…
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
