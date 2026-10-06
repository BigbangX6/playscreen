// Les espaces de Playscreen (capsule de l'accueil) et les sites ouverts dans le navigateur.

import type { IconName } from "../components/Icons.tsx";

export type SpaceId = "search" | "boutique" | "social" | "musique" | "internet" | "trophees" | "parametres";

export interface Space {
  id: SpaceId;
  label: string;
  icon: IconName;
}

/** Ordre de la capsule ; un séparateur après Rechercher et avant Paramètres. */
export const SPACES: Space[] = [
  { id: "search", label: "Rechercher", icon: "search" },
  { id: "boutique", label: "Boutique", icon: "bag" },
  { id: "social", label: "Social", icon: "people" },
  { id: "musique", label: "Musique", icon: "music" },
  { id: "internet", label: "Internet", icon: "globe" },
  { id: "trophees", label: "Trophées", icon: "trophy" },
  { id: "parametres", label: "Paramètres", icon: "gear" },
];

export type SettingsSection =
  | "reseau"
  | "manettes"
  | "son"
  | "ecran"
  | "stockage"
  | "comptes"
  | "alimentation"
  | "playscreen";

export const SETTINGS_SECTIONS: [SettingsSection, string][] = [
  ["reseau", "Réseau"],
  ["manettes", "Manettes et Bluetooth"],
  ["son", "Son"],
  ["ecran", "Écran"],
  ["stockage", "Stockage"],
  ["comptes", "Comptes et launchers"],
  ["alimentation", "Alimentation"],
  ["playscreen", "Playscreen"],
];

/** Les quatre fenêtres du navigateur (un seul navigateur, comme dans Steam). */
export type BrowserWindow = "boutique" | "social" | "musique" | "internet";

export type SiteId =
  | "instant-gaming"
  | "steam"
  | "epic"
  | "xbox"
  | "battlenet"
  | "discord"
  | "spotify"
  | "youtube-music"
  | "deezer"
  | "new-page"
  | "youtube"
  | "wikipedia"
  | "twitch";

export interface Site {
  name: string;
  domain: string;
  window: BrowserWindow;
  /** Adresse ouverte dans le vrai navigateur (fenêtre Playscreen). */
  url: string;
  /** Couleurs du bandeau de la page simulée (démo). */
  hero: [string, string];
}

export const SITES: Record<SiteId, Site> = {
  "instant-gaming": { name: "Instant Gaming", domain: "instant-gaming.com", window: "boutique", url: "https://www.instant-gaming.com/fr/", hero: ["#ff5a1f", "#ff9a3c"] },
  steam: { name: "Boutique Steam", domain: "store.steampowered.com", window: "boutique", url: "https://store.steampowered.com/", hero: ["#1b2838", "#2a475e"] },
  epic: { name: "Epic Games Store", domain: "store.epicgames.com", window: "boutique", url: "https://store.epicgames.com/fr/", hero: ["#2a2a2a", "#4a4a4a"] },
  xbox: { name: "Xbox", domain: "xbox.com", window: "boutique", url: "https://www.xbox.com/fr-FR/microsoft-store", hero: ["#0e7a0d", "#5dc21e"] },
  battlenet: { name: "Battle.net", domain: "shop.battle.net", window: "boutique", url: "https://shop.battle.net/fr-fr", hero: ["#0a2a4f", "#148eff"] },
  discord: { name: "Discord", domain: "discord.com", window: "social", url: "https://discord.com/app", hero: ["#404eed", "#7983f5"] },
  spotify: { name: "Spotify", domain: "open.spotify.com", window: "musique", url: "https://open.spotify.com/", hero: ["#1db954", "#0f6b30"] },
  "youtube-music": { name: "YouTube Music", domain: "music.youtube.com", window: "musique", url: "https://music.youtube.com/", hero: ["#ff0033", "#7a0019"] },
  deezer: { name: "Deezer", domain: "deezer.com", window: "musique", url: "https://www.deezer.com/fr/", hero: ["#a238ff", "#5b1aa8"] },
  "new-page": { name: "Nouvelle page", domain: "Rechercher ou saisir une adresse", window: "internet", url: "https://www.google.com/", hero: ["#3a4256", "#262c3c"] },
  youtube: { name: "YouTube", domain: "youtube.com", window: "internet", url: "https://www.youtube.com/", hero: ["#ff0033", "#a8001f"] },
  wikipedia: { name: "Wikipédia", domain: "fr.wikipedia.org", window: "internet", url: "https://fr.wikipedia.org/", hero: ["#8a8f99", "#c9ccd1"] },
  twitch: { name: "Twitch", domain: "twitch.tv", window: "internet", url: "https://www.twitch.tv/", hero: ["#9146ff", "#5c16c5"] },
};

/** Où mène un choix (aperçu d'un espace, centre rapide…). App sait y aller. */
export type Route =
  | { kind: "web"; site: SiteId }
  | { kind: "relay"; target: "windows-settings" | "activate-key" }
  | { kind: "settings"; section: SettingsSection }
  | { kind: "page"; page: "search" | "trophees" | "notifications" }
  | { kind: "stores" }
  | { kind: "library" };

/** Page principale de chaque espace (A sur son icône). */
export const SPACE_HOME: Record<SpaceId, Route> = {
  search: { kind: "page", page: "search" },
  boutique: { kind: "web", site: "instant-gaming" },
  social: { kind: "web", site: "discord" },
  musique: { kind: "web", site: "spotify" },
  internet: { kind: "web", site: "new-page" },
  trophees: { kind: "page", page: "trophees" },
  parametres: { kind: "settings", section: "reseau" },
};

export const MUSIC_SITES: Record<string, SiteId> = {
  Spotify: "spotify",
  "YouTube Music": "youtube-music",
  Deezer: "deezer",
};
