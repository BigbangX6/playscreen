// Mise en forme des données pour l'affichage (temps de jeu, tailles, dates, stores).

import type { Game } from "../../api/types.ts";

export type StoreKey = Game["store"];

export const STORE_LABELS: Record<StoreKey, string> = {
  steam: "Steam",
  epic: "Epic Games",
  xbox: "Xbox",
  battlenet: "Battle.net",
  other: "Autre",
};

/** Ce que le joueur doit faire quand le launcher prend la main pour une installation (F4). */
export const INSTALL_GUIDANCE: Record<StoreKey, string> = {
  steam: "Steam ouvre une fenêtre de confirmation : choisis « Installer ».",
  epic: "Epic ouvre la fenêtre d'installation du jeu : choisis « Installer ».",
  xbox: "La page du Microsoft Store s'ouvre : choisis « Installer ».",
  battlenet: "La page du jeu s'ouvre dans Battle.net : appuie sur « Installer ».",
  other: "Suis les instructions qui s'affichent dans le launcher.",
};

export function formatPlaytime(seconds: number): string {
  if (seconds <= 0) return "Jamais joué";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 10 && minutes % 60 ? `${hours} h ${minutes % 60}` : `${hours} h`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "Taille inconnue";
  const units = ["o", "Ko", "Mo", "Go", "To"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[unit]}`;
}

export function formatRelativeDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Aujourd'hui";
  if (days === 1) return "Hier";
  if (days < 30) return `Il y a ${days} jours`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${rest}` : `${m}:${rest}`;
}

/** Initiales d'un titre, pour les tuiles sans image. */
export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
}
