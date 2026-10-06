// Fenêtre par-dessus l'écran courant (menu, confirmation, accompagnement). L'écran derrière
// est rendu `inert` par App : la navigation reste dans la fenêtre.

import type { ReactNode } from "react";
import type { NavAction } from "../input/gamepad.ts";
import { useNavAction } from "../input/navigation.ts";
import { useFocusScope } from "./focus.ts";

interface Props {
  title?: string;
  children: ReactNode;
  /** B : fermer. Absent = la fenêtre ne se ferme pas avec B. */
  onBack?: () => void;
  /** Placement : centré (dialogue) ou panneau sur le côté (menu). */
  variant?: "dialog" | "panel" | "fullscreen";
  /** Élément qui reçoit le focus à l'ouverture (sélecteur CSS). */
  initialFocus?: string;
  onAction?: (action: NavAction) => boolean | void;
}

const PASS_THROUGH = new Set<NavAction>(["up", "down", "left", "right", "confirm"]);

export function Overlay({ title, children, onBack, variant = "dialog", initialFocus, onAction }: Props) {
  const ref = useFocusScope<HTMLDivElement>(initialFocus);
  // La fenêtre garde toutes les actions pour elle : rien ne fuit vers l'écran derrière.
  useNavAction((action) => {
    if (onAction?.(action) === true) return true;
    if (action === "back") {
      onBack?.();
      return true;
    }
    return !PASS_THROUGH.has(action);
  });
  return (
    <div className={`overlay overlay-${variant}`} role="dialog" aria-modal="true">
      <div className="overlay-card" ref={ref}>
        {title && <h2 className="overlay-title">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
