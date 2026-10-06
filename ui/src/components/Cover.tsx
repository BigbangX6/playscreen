// Image d'un jeu, avec une version lisible quand l'image manque (fréquent aujourd'hui).

import { useState } from "react";
import type { Game } from "../../../api/types.ts";
import { initials, STORE_LABELS } from "../format.ts";

interface Props {
  game: Game;
  src: string | null;
  /** Taille du titre de remplacement, en unités. */
  titleSize?: number;
}

export function Cover({ game, src, titleSize = 2 }: Props) {
  // Image en échec retenue par adresse : une nouvelle adresse (nouveau jeton) est réessayée.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (src && src !== failedSrc) {
    return <img className="cover-img" src={src} alt="" onError={() => setFailedSrc(src)} draggable={false} />;
  }
  return (
    <div className={`cover-fallback store-${game.store}`}>
      <span className="cover-initials">{initials(game.name)}</span>
      <span className="cover-title" style={{ fontSize: `calc(var(--unit) * ${titleSize})` }}>
        {game.name}
      </span>
      <span className="cover-store">{STORE_LABELS[game.store]}</span>
    </div>
  );
}

export function StoreBadge({ store }: { store: Game["store"] }) {
  return <span className={`store-badge store-${store}`}>{STORE_LABELS[store]}</span>;
}
