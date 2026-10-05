// Aide des boutons des écrans « console » (accueil, centre rapide, navigateur, paramètres) :
// pastilles de la manette en couleur, taille en --cq.

import type { ReactNode } from "react";
import "./console.css";

export type Pad = "A" | "B" | "X" | "Y" | "menu" | "down" | "leftRight" | "LB RB" | "LT RT" | "L" | "R";

export function PadGlyph({ pad }: { pad: Pad }) {
  if (pad === "L" || pad === "R") return <span className="pad-stick">{pad}</span>;
  const text = pad === "menu" ? "☰" : pad === "down" ? "▼" : pad === "leftRight" ? "◀ ▶" : pad;
  const kind = pad === "A" ? "a" : pad === "B" ? "b" : pad === "X" ? "x" : pad === "Y" ? "y" : "s";
  return <i className={`pad pad-${kind}`}>{text}</i>;
}

export function PadHints({ items, className }: { items: [Pad, ReactNode][]; className?: string }) {
  return (
    <div className={`pad-hints ${className ?? ""}`}>
      {items.map(([pad, label], index) => (
        <span key={index}>
          <PadGlyph pad={pad} />
          {label}
        </span>
      ))}
    </div>
  );
}
