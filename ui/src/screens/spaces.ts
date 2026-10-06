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
  /** Identité donnée au site ; le site a alors sa propre fenêtre (YouTube TV). */
  userAgent?: string;
  /** Couleurs du bandeau de la page simulée (démo). */
  hero: [string, string];
}

/**
 * Une télé Sony : YouTube sert alors son interface TV (youtube.com/tv), faite pour la
 * télécommande (flèches, Entrée, Échap : croix, Start, B en mode souris). Même identité que
 * l'extension « Youtube TV On PC ».
 */
const TV_USER_AGENT =
  "Mozilla/5.0 (Linux; Andr0id 9; BRAVIA 8K UR2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.125 Safari/537.36 OPR/46.0.2207.0 OMI/4.21.0.273.DIA6.149 Model/Sony-BRAVIA-8K-UR2";

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
  youtube: { name: "YouTube", domain: "youtube.com/tv", window: "internet", url: "https://www.youtube.com/tv", userAgent: TV_USER_AGENT, hero: ["#ff0033", "#a8001f"] },
  wikipedia: { name: "Wikipédia", domain: "fr.wikipedia.org", window: "internet", url: "https://fr.wikipedia.org/", hero: ["#8a8f99", "#c9ccd1"] },
  twitch: { name: "Twitch", domain: "twitch.tv", window: "internet", url: "https://www.twitch.tv/", hero: ["#9146ff", "#5c16c5"] },
};

/**
 * Relais : Playscreen passe la main à une fenêtre de Windows ou d'un launcher, la manette
 * devient une souris, Select + Y revient. Les magasins des launchers plutôt que leurs sites :
 * on y est déjà connecté.
 */
export type RelayTarget = "windows-settings" | "activate-key" | "store-steam" | "store-epic" | "store-xbox" | "store-battlenet";

export const RELAY_INFO: Record<RelayTarget, { to: string; text: string }> = {
  "windows-settings": {
    to: "Paramètres Windows",
    text: "Les Paramètres Windows s'ouvrent en grand. Utilise-les comme avec une souris ; reviens quand tu as fini.",
  },
  "activate-key": {
    to: "Steam",
    text: "La fenêtre « Activer un produit » de Steam s'ouvre. Saisis ta clé, valide, puis reviens quand tu as fini.",
  },
  "store-steam": { to: "Magasin Steam", text: "Le magasin de Steam s'ouvre en grand, avec ton compte. Ce que tu achètes arrive dans ta bibliothèque." },
  "store-epic": { to: "Epic Games Store", text: "Le magasin d'Epic s'ouvre en grand, avec ton compte. Ce que tu achètes arrive dans ta bibliothèque." },
  "store-xbox": { to: "Xbox", text: "L'application Xbox s'ouvre en grand, avec ton compte : Game Pass et magasin." },
  "store-battlenet": { to: "Battle.net", text: "Battle.net s'ouvre en grand, avec ton compte. Choisis « Boutique » en haut." },
};

/** Où mène un choix (aperçu d'un espace, centre rapide…). App sait y aller. */
export type Route =
  | { kind: "web"; site: SiteId }
  | { kind: "relay"; target: RelayTarget }
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
