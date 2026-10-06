// Les espaces de Playscreen (capsule de l'accueil) et les sites ouverts dans le navigateur.

import type { StoreId } from "../../../api/types.ts";
import type { IconName } from "../components/Icons.tsx";
import { prefs } from "../prefs.ts";

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
  /** Le service de musique choisi (MUSIC_SERVICES, ou lien personnalisé). */
  | "music"
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
  // Remplacé par le service choisi : voir getSite().
  music: { name: "Musique", domain: "", window: "musique", url: "", hero: ["#1f4a3a", "#12261f"] },
  "new-page": { name: "Nouvelle page", domain: "Rechercher ou saisir une adresse", window: "internet", url: "https://www.google.com/", hero: ["#3a4256", "#262c3c"] },
  youtube: { name: "YouTube", domain: "youtube.com/tv", window: "internet", url: "https://www.youtube.com/tv", userAgent: TV_USER_AGENT, hero: ["#ff0033", "#a8001f"] },
  wikipedia: { name: "Wikipédia", domain: "fr.wikipedia.org", window: "internet", url: "https://fr.wikipedia.org/", hero: ["#8a8f99", "#c9ccd1"] },
  twitch: { name: "Twitch", domain: "twitch.tv", window: "internet", url: "https://www.twitch.tv/", hero: ["#9146ff", "#5c16c5"] },
};

/** Services de musique proposés ; on choisit son préféré (ou un lien personnalisé). */
export interface MusicService {
  id: string;
  name: string;
  url: string;
  domain: string;
  hint: string;
  hero: [string, string];
}

export const MUSIC_SERVICES: MusicService[] = [
  { id: "spotify", name: "Spotify", url: "https://open.spotify.com/", domain: "open.spotify.com", hint: "Gratuit avec publicités, ou Premium", hero: ["#1db954", "#0f6b30"] },
  { id: "deezer", name: "Deezer", url: "https://www.deezer.com/fr/", domain: "deezer.com", hint: "Gratuit avec publicités, ou Premium", hero: ["#a238ff", "#5b1aa8"] },
  { id: "youtube-music", name: "YouTube Music", url: "https://music.youtube.com/", domain: "music.youtube.com", hint: "Avec ton compte Google", hero: ["#ff0033", "#7a0019"] },
  { id: "apple-music", name: "Apple Music", url: "https://music.apple.com/fr/", domain: "music.apple.com", hint: "Avec ton identifiant Apple", hero: ["#fa2d48", "#7a1424"] },
  { id: "amazon-music", name: "Amazon Music", url: "https://music.amazon.fr/", domain: "music.amazon.fr", hint: "Inclus avec Prime", hero: ["#25d1da", "#0b4f6c"] },
  { id: "tidal", name: "Tidal", url: "https://listen.tidal.com/", domain: "listen.tidal.com", hint: "Haute fidélité", hero: ["#2b2b2b", "#5a5a5a"] },
  { id: "qobuz", name: "Qobuz", url: "https://play.qobuz.com/", domain: "play.qobuz.com", hint: "Haute fidélité", hero: ["#1d4ed8", "#0b1f5c"] },
  { id: "soundcloud", name: "SoundCloud", url: "https://soundcloud.com/", domain: "soundcloud.com", hint: "Artistes indépendants, mixes", hero: ["#ff5500", "#a33600"] },
  { id: "bandcamp", name: "Bandcamp", url: "https://bandcamp.com/", domain: "bandcamp.com", hint: "Artistes indépendants", hero: ["#1da0c3", "#0b4f61"] },
  { id: "radio-france", name: "Radio France", url: "https://www.radiofrance.fr/", domain: "radiofrance.fr", hint: "France Inter, FIP, Mouv'…", hero: ["#e2001a", "#5c000b"] },
  { id: "tunein", name: "TuneIn", url: "https://tunein.com/radio/home/", domain: "tunein.com", hint: "Radios du monde entier", hero: ["#14d8cc", "#0a5c57"] },
];

/** Le service de musique choisi (lien personnalisé compris). */
export function musicService(): MusicService {
  const p = prefs();
  if (p.music === "custom" && p.musicUrl) {
    let domain = p.musicUrl;
    try {
      domain = new URL(p.musicUrl).host;
    } catch {
      // Adresse incomplète : on l'affiche telle quelle.
    }
    return { id: "custom", name: domain, url: p.musicUrl, domain, hint: "Lien personnalisé", hero: ["#3a4256", "#262c3c"] };
  }
  return MUSIC_SERVICES.find((m) => m.id === p.music) ?? MUSIC_SERVICES[0]!;
}

/** Un site, avec le service de musique choisi à la place de « music ». */
export function getSite(id: SiteId): Site {
  if (id !== "music") return SITES[id];
  const m = musicService();
  return { name: m.name, domain: m.domain, window: "musique", url: m.url, hero: m.hero };
}

/**
 * Launchers : page d'installation officielle (même quand on a déjà des jeux), identifiant
 * winget pour une installation sans fenêtre (moteur, plus tard). `store` : jeux importés
 * par Playscreen (v1) ; les autres s'installent, leurs jeux viendront plus tard.
 */
export interface Launcher {
  id: string;
  name: string;
  store: StoreId | null;
  installUrl: string;
  winget: string;
}

export const LAUNCHERS: Launcher[] = [
  { id: "steam", name: "Steam", store: "steam", installUrl: "https://store.steampowered.com/about/", winget: "Valve.Steam" },
  { id: "epic", name: "Epic Games", store: "epic", installUrl: "https://store.epicgames.com/fr/download", winget: "EpicGames.EpicGamesLauncher" },
  { id: "xbox", name: "Xbox", store: "xbox", installUrl: "https://www.xbox.com/fr-FR/apps/xbox-app-for-pc", winget: "9MV0B5HZVK9Z" },
  { id: "battlenet", name: "Battle.net", store: "battlenet", installUrl: "https://download.battle.net/fr-fr/desktop", winget: "Blizzard.BattleNet" },
  { id: "gog", name: "GOG Galaxy", store: null, installUrl: "https://www.gog.com/fr/galaxy", winget: "GOG.Galaxy" },
  { id: "ea", name: "EA app", store: null, installUrl: "https://www.ea.com/fr-fr/ea-app", winget: "ElectronicArts.EADesktop" },
  { id: "ubisoft", name: "Ubisoft Connect", store: null, installUrl: "https://www.ubisoft.com/fr-fr/ubisoft-connect/download", winget: "Ubisoft.Connect" },
  { id: "amazon", name: "Amazon Games", store: null, installUrl: "https://gaming.amazon.com/home", winget: "Amazon.Games" },
];

export function launcherOf(store: StoreId): Launcher {
  return LAUNCHERS.find((l) => l.store === store)!;
}

/**
 * Relais : Playscreen passe la main à une fenêtre de Windows ou d'un launcher, la manette
 * devient une souris, Select + Y revient. Les magasins des launchers plutôt que leurs sites :
 * on y est déjà connecté. Cibles avec paramètre : `steam-workshop:<appid>`,
 * `install-<launcher>`, `launcher-settings-<store>`, `game-properties:<store>:<id>`.
 */
export type RelayTarget =
  | "windows-settings"
  | "activate-key"
  | "store-steam"
  | "store-epic"
  | "store-xbox"
  | "store-battlenet"
  | `install-${string}`
  | `launcher-settings-${StoreId}`
  | `steam-workshop:${string}`
  | `game-properties:${StoreId}:${string}`;

const STORE_NAMES: Record<StoreId, string> = { steam: "Steam", epic: "Epic Games", xbox: "Xbox", battlenet: "Battle.net" };

export function relayInfo(target: RelayTarget): { to: string; text: string } {
  switch (target) {
    case "windows-settings":
      return { to: "Paramètres Windows", text: "Les Paramètres Windows s'ouvrent en grand. Utilise-les comme avec une souris ; reviens quand tu as fini." };
    case "activate-key":
      return { to: "Steam", text: "La fenêtre « Activer un produit » de Steam s'ouvre. Saisis ta clé, valide, puis reviens quand tu as fini." };
    case "store-steam":
      return { to: "Magasin Steam", text: "Le magasin de Steam s'ouvre en grand, avec ton compte. Ce que tu achètes arrive dans ta bibliothèque." };
    case "store-epic":
      return { to: "Epic Games Store", text: "Le magasin d'Epic s'ouvre en grand, avec ton compte. Ce que tu achètes arrive dans ta bibliothèque." };
    case "store-xbox":
      return { to: "Xbox", text: "L'application Xbox s'ouvre en grand, avec ton compte : Game Pass et magasin." };
    case "store-battlenet":
      return { to: "Battle.net", text: "Battle.net s'ouvre en grand, avec ton compte. Choisis « Boutique » en haut." };
  }
  if (target.startsWith("install-")) {
    const launcher = LAUNCHERS.find((l) => `install-${l.id}` === target);
    const name = launcher?.name ?? "le launcher";
    return {
      to: `Installer ${name}`,
      text: `La page officielle de ${name} s'ouvre. Télécharge l'installateur et lance-le ; Windows te demandera une autorisation : choisis « Oui ».`,
    };
  }
  if (target.startsWith("launcher-settings-")) {
    const name = STORE_NAMES[target.slice("launcher-settings-".length) as StoreId] ?? "Launcher";
    return { to: `Paramètres de ${name}`, text: `Les paramètres de ${name} s'ouvrent en grand. Change ce que tu veux ; reviens quand tu as fini.` };
  }
  if (target.startsWith("steam-workshop:")) {
    return { to: "Workshop Steam", text: "Le Workshop du jeu s'ouvre dans Steam : abonne-toi aux contenus qui te plaisent, Steam les installe tout seul." };
  }
  const store = target.split(":")[1] as StoreId;
  return { to: STORE_NAMES[store] ?? "Launcher", text: `Les propriétés du jeu s'ouvrent dans ${STORE_NAMES[store] ?? "le launcher"} : options de lancement, langue, versions…` };
}

/** Où mène un choix (aperçu d'un espace, centre rapide…). App sait y aller. */
export type Route =
  | { kind: "web"; site: SiteId }
  | { kind: "relay"; target: RelayTarget }
  | { kind: "settings"; section: SettingsSection }
  | { kind: "page"; page: "search" | "trophees" | "notifications" | "music" }
  | { kind: "trophies"; gameId: string }
  | { kind: "game"; gameId: string }
  | { kind: "game-settings"; gameId: string }
  | { kind: "launchers" }
  | { kind: "launcher"; store: StoreId }
  | { kind: "welcome" }
  | { kind: "stores" }
  | { kind: "library" };

/** Page principale de chaque espace (A sur son icône). */
export const SPACE_HOME: Record<SpaceId, Route> = {
  search: { kind: "page", page: "search" },
  boutique: { kind: "web", site: "instant-gaming" },
  social: { kind: "web", site: "discord" },
  musique: { kind: "web", site: "music" },
  internet: { kind: "web", site: "new-page" },
  trophees: { kind: "page", page: "trophees" },
  parametres: { kind: "settings", section: "reseau" },
};
