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
  media?: { cover?: boolean; background?: boolean; icon?: boolean };
}

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
}

export type EventType = keyof EventMap;
export type EngineEvent = { [K in EventType]: { type: K; data: EventMap[K] } }[EventType];

/** Contenu du fichier engine.json écrit par le moteur au démarrage. */
export interface EngineInfo {
  port: number;
  token: string;
}
