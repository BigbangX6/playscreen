// Navigation « spatiale » : les directions déplacent le focus vers l'élément le plus proche
// dans cette direction, A le déclenche. Un écran peut intercepter une action (useNavAction).

import { useEffect, useRef } from "react";
import { NAV_EVENT, type NavAction } from "./gamepad.ts";

/** Attribut à poser sur tout élément atteignable à la manette (bouton, tuile de jeu…). */
export const FOCUSABLE = "[data-focusable]";

/**
 * Éléments atteignables maintenant : on ignore ceux d'une zone `inert` (l'écran derrière
 * une fenêtre ouverte par-dessus) et ceux qui ne sont pas affichés.
 */
export function reachable(root: ParentNode = document): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => !element.closest("[inert]") && element.getClientRects().length > 0,
  );
}

/** Met le focus sur le premier élément atteignable (de `root`), sans faire défiler brusquement. */
export function focusFirst(root: ParentNode = document): boolean {
  const first = reachable(root)[0];
  first?.focus({ preventScroll: true });
  return Boolean(first);
}

type Handler = (action: NavAction) => boolean | void;
/** Le dernier écran monté est prioritaire (une fenêtre par-dessus la bibliothèque, par ex.). */
const handlers: Handler[] = [];

/**
 * Intercepte une action pour l'écran courant. Renvoyer `true` = action consommée (la
 * navigation par défaut n'a pas lieu). Exemple : `back` pour fermer un écran.
 */
export function useNavAction(handler: Handler) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const wrapper: Handler = (action) => latest.current(action);
    handlers.push(wrapper);
    return () => {
      handlers.splice(handlers.indexOf(wrapper), 1);
    };
  }, []);
}

function center(rect: DOMRect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** Élément le plus proche dans la direction, en privilégiant l'alignement. */
function nextInDirection(from: HTMLElement, direction: NavAction): HTMLElement | null {
  const origin = center(from.getBoundingClientRect());
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const element of reachable()) {
    if (element === from) continue;
    const point = center(element.getBoundingClientRect());
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    const ahead = direction === "left" ? -dx : direction === "right" ? dx : direction === "up" ? -dy : dy;
    const side = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
    if (ahead <= 1) continue;
    const score = ahead + side * 2;
    if (score < bestScore) {
      bestScore = score;
      best = element;
    }
  }
  return best;
}

/** Comportement par défaut, si aucun écran n'a consommé l'action. */
function defaultAction(action: NavAction) {
  const active = document.activeElement;
  const current =
    active instanceof HTMLElement && active.matches(FOCUSABLE) && !active.closest("[inert]") ? active : null;
  if (!current) {
    focusFirst();
    return;
  }
  if (action === "confirm") {
    current.click();
    return;
  }
  if (action === "up" || action === "down" || action === "left" || action === "right") {
    const next = nextInDirection(current, action);
    next?.focus();
    next?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }
}

/** Branche la navigation ; renvoie la fonction d'arrêt. */
export function startNavigation(): () => void {
  const onNav = (event: Event) => {
    const action = (event as CustomEvent<NavAction>).detail;
    for (let i = handlers.length - 1; i >= 0; i--) {
      if (handlers[i]!(action) === true) return;
    }
    defaultAction(action);
  };
  window.addEventListener(NAV_EVENT, onNav);
  return () => window.removeEventListener(NAV_EVENT, onNav);
}
