// Préférences de l'interface, gardées sur ce PC (stockage du navigateur de la fenêtre
// Playscreen) : service de musique préféré, premier démarrage terminé.

import { useSyncExternalStore } from "react";

export interface Prefs {
  /** Identifiant d'un service de MUSIC_SERVICES, ou « custom ». */
  music: string;
  /** Lien personnalisé (music = « custom »). */
  musicUrl: string | null;
  /** L'accueil de premier démarrage a été terminé (ou passé). */
  welcomed: boolean;
}

const KEY = "playscreen.prefs";
const DEFAULTS: Prefs = { music: "spotify", musicUrl: null, welcomed: false };

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

let current = load();
const watchers = new Set<() => void>();

export function prefs(): Prefs {
  return current;
}

export function setPrefs(patch: Partial<Prefs>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Stockage indisponible : la préférence vaut pour cette session seulement.
  }
  watchers.forEach((callback) => callback());
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (callback) => {
      watchers.add(callback);
      return () => watchers.delete(callback);
    },
    prefs,
  );
}
