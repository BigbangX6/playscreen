// Tuile d'un jeu dans la bibliothèque : jaquette (ou remplacement lisible), nom, état.

import type { EngineClient } from "../../../api/client.ts";
import type { Game } from "../../../api/types.ts";
import { Cover } from "./Cover.tsx";
import { ProgressBar, type Progress } from "./ProgressBar.tsx";

interface Props {
  game: Game;
  client: EngineClient;
  progress: Progress | null;
  /** Installation demandée (la progression peut ne pas être encore connue). */
  installing: boolean;
  running: boolean;
  onOpen(game: Game): void;
  onFocus(game: Game): void;
}

export function GameTile({ game, client, progress, installing, running, onOpen, onFocus }: Props) {
  const status = running ? "En cours" : installing ? "Installation…" : game.installed ? null : "Non installé";
  return (
    <button
      className={`tile ${game.installed ? "" : "tile-uninstalled"}`}
      data-focusable
      data-game-id={game.id}
      onClick={() => onOpen(game)}
      onFocus={() => onFocus(game)}
    >
      <div className="tile-cover">
        <Cover game={game} src={game.media?.cover ? client.mediaUrl(game.id, "cover") : null} titleSize={1.8} />
        {status && <span className={`tile-status ${running ? "tile-status-running" : ""}`}>{status}</span>}
        {installing && (
          <div className="tile-progress">
            <ProgressBar progress={progress} compact />
          </div>
        )}
      </div>
      <span className="tile-name">{game.name}</span>
    </button>
  );
}
