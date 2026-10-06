// Barre d'aide en bas de l'écran : quels boutons de la manette font quoi, comme sur console.

import type { NavAction } from "../input/gamepad.ts";

export type Hint = [action: NavAction | "tabs", label: string];
type GlyphAction = Hint[0];

const GLYPHS: Partial<Record<GlyphAction, { text: string; className: string }>> = {
  confirm: { text: "A", className: "pad-a" },
  back: { text: "B", className: "pad-b" },
  options: { text: "X", className: "pad-x" },
  search: { text: "Y", className: "pad-y" },
  menu: { text: "☰", className: "pad-menu" },
  previousTab: { text: "LB", className: "pad-bumper" },
  nextTab: { text: "RB", className: "pad-bumper" },
  tabs: { text: "LB RB", className: "pad-bumper" },
};

export function Glyph({ action }: { action: GlyphAction }) {
  const glyph = GLYPHS[action];
  if (!glyph) return null;
  return <span className={`glyph ${glyph.className}`}>{glyph.text}</span>;
}

export function Hints({ items }: { items: Hint[] }) {
  return (
    <footer className="hints">
      {items.map(([action, label]) => (
        <span key={action} className="hint">
          <Glyph action={action} />
          {label}
        </span>
      ))}
    </footer>
  );
}
