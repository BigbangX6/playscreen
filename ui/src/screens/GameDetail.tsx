// Fiche d'un jeu : image de fond, temps de jeu, dernière partie ; Jouer / Installer
// (avec progression) / Désinstaller.

import type { EngineClient } from "../../../api/client.ts";
import type { Game } from "../../../api/types.ts";
import { Cover, StoreBadge } from "../components/Cover.tsx";
import { useFocusScope } from "../components/focus.ts";
import { Hints, type Hint } from "../components/Hints.tsx";
import { ProgressBar, type Progress } from "../components/ProgressBar.tsx";
import { StateView } from "../components/StateView.tsx";
import { TopBar } from "../components/TopBar.tsx";
import { formatBytes, formatPlaytime, formatRelativeDate } from "../format.ts";
import { useNavAction } from "../input/navigation.ts";

interface Props {
  client: EngineClient;
  game: Game | null;
  /** Chargement de la bibliothèque en cours (le jeu n'est pas encore connu). */
  loading: boolean;
  installing: boolean;
  progress: Progress | null;
  running: boolean;
  runningName: string | null;
  onPlay(game: Game): void;
  onInstall(game: Game): void;
  onUninstall(game: Game): void;
  onBack(): void;
}

export function GameDetail(props: Props) {
  const { client, game, installing, progress, running } = props;
  const ref = useFocusScope<HTMLDivElement>(".detail-primary");

  useNavAction((action) => {
    if (action === "back") {
      props.onBack();
      return true;
    }
    if (action === "options" && game?.installed && !running) {
      props.onUninstall(game);
      return true;
    }
    return false;
  });

  if (!game) {
    return (
      <div className="screen" ref={ref}>
        <TopBar title="Jeu" running={props.runningName} />
        {props.loading ? (
          <StateView kind="loading" title="Chargement…" />
        ) : (
          <StateView kind="error" title="Ce jeu n'est plus dans la bibliothèque">
            <button className="btn btn-primary" data-focusable onClick={props.onBack}>
              Retour à la bibliothèque
            </button>
          </StateView>
        )}
        <Hints items={[["back", "Retour"]]} />
      </div>
    );
  }

  const primary = running
    ? { label: "En cours", action: () => undefined }
    : installing
      ? { label: "Installation…", action: () => undefined }
      : game.installed
        ? { label: "Jouer", action: () => props.onPlay(game) }
        : { label: "Installer", action: () => props.onInstall(game) };

  return (
    <div className={`screen detail store-tint-${game.store}`} ref={ref}>
      <div className="detail-bg">
        {game.media?.background && <img src={client.mediaUrl(game.id, "background")} alt="" draggable={false} />}
      </div>
      <div className="detail-scrim" />
      <TopBar title="Jeu" running={props.runningName} />
      <section className="detail-body">
        <div className="detail-info">
          <StoreBadge store={game.store} />
          <h1 className="detail-title">{game.name}</h1>
          <dl className="detail-stats">
            <div>
              <dt>Temps de jeu</dt>
              <dd>{formatPlaytime(game.playtimeSeconds)}</dd>
            </div>
            <div>
              <dt>Dernière partie</dt>
              <dd>{formatRelativeDate(game.lastPlayed)}</dd>
            </div>
            <div>
              <dt>{game.installed ? "Installé" : "Taille"}</dt>
              <dd>{formatBytes(game.installSizeBytes)}</dd>
            </div>
          </dl>
          {installing && (
            <div className="detail-progress">
              <ProgressBar progress={progress} />
            </div>
          )}
          <div className="detail-actions">
            <button
              className={`btn btn-primary btn-large detail-primary ${running || installing ? "btn-busy" : ""}`}
              data-focusable
              onClick={primary.action}
            >
              {!game.installed && !installing && <span className="btn-icon">↓</span>}
              {game.installed && !running && <span className="btn-icon">▶</span>}
              {primary.label}
            </button>
            {game.installed && !running && (
              <button className="btn btn-ghost" data-focusable onClick={() => props.onUninstall(game)}>
                Désinstaller
              </button>
            )}
          </div>
        </div>
        <div className="detail-cover">
          <Cover game={game} src={game.media?.cover ? client.mediaUrl(game.id, "cover") : null} titleSize={3} />
        </div>
      </section>
      <Hints
        items={[
          ["confirm", primary.label === "Installation…" ? "OK" : primary.label],
          ["back", "Retour"],
          ...(game.installed && !running ? [["options", "Désinstaller"] satisfies Hint] : []),
        ]}
      />
    </div>
  );
}
