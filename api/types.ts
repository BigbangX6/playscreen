// Types de l'API Playscreen v0. Miroir de api/openapi.yaml : garder les deux synchronisés.

export const API_VERSION = "0.1.0";

/**
 * Origines web autorisées à appeler l'API (CORS) : l'interface dans Tauri, et Vite en
 * développement. Le jeton reste exigé ; une autre page web reste bloquée par le navigateur.
 */
export const ALLOWED_ORIGINS = ["http://tauri.localhost", "tauri://localhost", "http://localhost:5173"] as const;

export const STORE_IDS = ["steam", "epic", "xbox", "battlenet"] as const;
export type StoreId = (typeof STORE_IDS)[number];

export interface Status {
  engine: "playnite" | "mock";
  apiVersion: string;
  engineVersion?: string;
  ready: boolean;
}

export interface Store {
  id: StoreId;
  name: string;
  pluginInstalled: boolean;
  launcherInstalled: boolean | null;
  connected: boolean | null;
  gameCount: number;
}

export interface Game {
  id: string;
  name: string;
  sortingName?: string | null;
  store: StoreId | "other";
  storeGameId?: string | null;
  installed: boolean;
  installDirectory?: string | null;
  installSizeBytes?: number | null;
  playtimeSeconds: number;
  lastPlayed?: string | null;
  added?: string | null;
  /** Durée de la dernière partie, notée par le moteur à chaque fin de partie. */
  lastSessionSeconds?: number | null;
  media?: { cover?: boolean; background?: boolean; icon?: boolean };
}

/** Partie en cours (une seule à la fois), ou null. */
export interface Session {
  gameId: string;
  /** « starting » : lancé, le jeu n'a pas encore démarré ; « running » : il tourne. */
  phase: "starting" | "running";
  startedAt: string;
}

/**
 * État d'un launcher pendant une demande (lancement, installation, désinstallation) :
 * fermé, démarre, se met à jour, prêt. F25, F26.
 */
export const LAUNCHER_STATES = ["closed", "starting", "updating", "ready"] as const;
export type LauncherState = (typeof LAUNCHER_STATES)[number];

/** Volume principal de Windows. */
export interface Volume {
  /** 0 à 100. */
  level: number;
  muted: boolean;
}

/** Disque interne, avec la place prise par les jeux installés dessus. */
export interface Disk {
  letter: string;
  label: string;
  totalBytes: number;
  freeBytes: number;
  gamesBytes: number;
}

/** Musique (ou vidéo) en cours d'après les commandes multimédias de Windows. */
export interface NowPlaying {
  /** Application qui joue : « Spotify », « Chrome »… */
  app: string | null;
  title: string;
  artist: string | null;
  playing: boolean;
}

/** Le PC en dehors des jeux. Chaque valeur vaut null si elle n'existe pas sur ce PC. */
export interface SystemInfo {
  network: { kind: "wifi" | "ethernet" | "none"; name: string | null } | null;
  /** Batterie de la manette sans fil, 0 à 100 (par paliers). */
  controllerBattery: number | null;
  /** Luminosité de l'écran intégré, 0 à 100 ; null pour une télé ou un écran externe. */
  brightness: number | null;
  /** Nom de la sortie audio par défaut. */
  audioOutput: string | null;
  disks: Disk[] | null;
  media: NowPlaying | null;
}

export type PowerAction = "sleep" | "shutdown" | "restart";
export type MediaCommand = "toggle" | "previous" | "next";

export interface EventMap {
  "game.starting": { gameId: string };
  "game.started": { gameId: string };
  "game.stopped": { gameId: string; sessionSeconds: number };
  "game.installed": { gameId: string };
  "game.uninstalled": { gameId: string };
  "install.progress": { gameId: string; bytesDone: number; bytesTotal: number };
  "library.updated": { added: string[]; updated: string[]; removed: string[] };
  "sync.started": { storeId: StoreId };
  "sync.finished": { storeId: StoreId; ok: boolean; error?: string };
  "store.updated": Store;
  "volume.changed": Volume;
  /**
   * Une fenêtre du launcher vient de s'ouvrir après une demande (confirmation
   * d'installation, de désinstallation…) : l'interface la met au premier plan
   * (`handle`, fenêtre Windows) et affiche une consigne. F4, F27.
   */
  "launcher.prompt": { gameId: string | null; storeId: StoreId; title: string; handle: number };
  /**
   * Le launcher change d'état pendant quelques minutes après une demande (le premier
   * envoi donne l'état de départ). Steam, Epic et Battle.net ; pas Xbox.
   */
  "launcher.state": { storeId: StoreId; state: LauncherState };
}

export type EventType = keyof EventMap;
export type EngineEvent = { [K in EventType]: { type: K; data: EventMap[K] } }[EventType];

/** Contenu du fichier engine.json écrit par le moteur au démarrage. */
export interface EngineInfo {
  port: number;
  token: string;
}
