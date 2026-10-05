// Gestion du focus à l'ouverture et à la fermeture d'un écran ou d'une fenêtre :
// le focus n'est jamais perdu (docs/interface.md, § 3).

import { useEffect, useRef, type RefObject } from "react";
import { focusFirst } from "../input/navigation.ts";

/**
 * À l'ouverture : focus sur `preferred` (sélecteur CSS) s'il existe, sinon le premier
 * élément atteignable du conteneur. À la fermeture : retour à l'élément qui avait le focus
 * avant (s'il est encore affiché).
 */
export function useFocusScope<T extends HTMLElement>(preferred?: string): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = ref.current;
    if (root) {
      const target = preferred ? root.querySelector<HTMLElement>(preferred) : null;
      if (target) target.focus({ preventScroll: true });
      else focusFirst(root);
    }
    return () => {
      // Après le démontage (et la levée de `inert` sur l'écran derrière).
      requestAnimationFrame(() => {
        if (previous?.isConnected && !previous.closest("[inert]")) previous.focus({ preventScroll: true });
        else if (!document.activeElement || document.activeElement === document.body) focusFirst();
      });
    };
    // Une seule fois à l'ouverture : `preferred` ne doit pas déplacer le focus ensuite.
  }, []);
  return ref;
}
