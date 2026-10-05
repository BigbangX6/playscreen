// Client de l'API Playscreen, partagé par `psc`, les tests et (plus tard) l'interface.

import type { EngineEvent, EventType, Game, MediaCommand, PowerAction, Session, Status, Store, StoreId, SystemInfo, TrophySummary, Volume } from "./types.ts";

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Ce que l'interface utilise du moteur. PlayscreenClient l'implémente par HTTP ; la
 * version démo de l'interface (ui/src/demo) l'implémente en mémoire, dans la page.
 */
export interface EngineClient {
  status(): Promise<Status>;
  stores(): Promise<Store[]>;
  games(filter?: { installed?: boolean; store?: StoreId }): Promise<Game[]>;
  game(id: string): Promise<Game>;
  start(id: string): Promise<void>;
  install(id: string): Promise<void>;
  uninstall(id: string): Promise<void>;
  sync(storeId: StoreId): Promise<void>;
  login(storeId: StoreId, options?: { alternative?: boolean }): Promise<void>;
  /** Partie en cours, ou null (pour la retrouver après un redémarrage de l'interface). */
  session(): Promise<Session | null>;
  /** Quitte le jeu en cours ; `force` le ferme de force (jeu bloqué). Suite : game.stopped. */
  stop(id: string, options?: { force?: boolean }): Promise<void>;
  volume(): Promise<Volume>;
  setVolume(change: { level?: number; muted?: boolean }): Promise<Volume>;
  /** Réseau, manette, luminosité, sortie audio, disques, musique en cours. */
  system(): Promise<SystemInfo>;
  /** Veille, arrêt ou redémarrage immédiats du PC. */
  power(action: PowerAction): Promise<void>;
  /** Faux (409) si l'écran ne se règle pas. */
  setBrightness(level: number): Promise<number>;
  /** Passe à la sortie audio suivante ; renvoie son nom. */
  nextAudioOutput(): Promise<string | null>;
  /** Lecture / pause, précédent, suivant sur ce qui joue (409 si rien ne joue). */
  media(command: MediaCommand): Promise<void>;
  /** Trophées de la bibliothèque (vide si le moteur n'a pas SuccessStory). */
  trophies(): Promise<TrophySummary>;
  /** Récupère les trophées de toute la bibliothèque en arrière-plan (suite : trophies.updated). */
  refreshTrophies(): Promise<void>;
  mediaUrl(id: string, kind: "cover" | "background" | "icon"): string;
  events(signal?: AbortSignal): AsyncGenerator<EngineEvent>;
}

export class PlayscreenClient implements EngineClient {
  readonly baseUrl: string;
  readonly token: string;

  /** baseUrl : par exemple http://127.0.0.1:47800/api/v0 */
  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = token;
  }

  status() {
    return this.get<Status>("/status");
  }

  stores() {
    return this.get<Store[]>("/stores");
  }

  games(filter: { installed?: boolean; store?: StoreId } = {}) {
    const query = new URLSearchParams();
    if (filter.installed !== undefined) query.set("installed", String(filter.installed));
    if (filter.store) query.set("store", filter.store);
    const suffix = query.size ? `?${query}` : "";
    return this.get<Game[]>(`/games${suffix}`);
  }

  game(id: string) {
    return this.get<Game>(`/games/${encodeURIComponent(id)}`);
  }

  start(id: string) {
    return this.post(`/games/${encodeURIComponent(id)}/start`);
  }

  install(id: string) {
    return this.post(`/games/${encodeURIComponent(id)}/install`);
  }

  uninstall(id: string) {
    return this.post(`/games/${encodeURIComponent(id)}/uninstall`);
  }

  sync(storeId: StoreId) {
    return this.post(`/stores/${storeId}/sync`);
  }

  /** alternative : connexion de secours de l'extension (Epic : navigateur du système). */
  login(storeId: StoreId, options: { alternative?: boolean } = {}) {
    return this.post(`/stores/${storeId}/login${options.alternative ? "?method=alternative" : ""}`);
  }

  session() {
    return this.get<Session | null>("/session");
  }

  stop(id: string, options: { force?: boolean } = {}) {
    return this.post(`/games/${encodeURIComponent(id)}/stop${options.force ? "?force=true" : ""}`);
  }

  volume() {
    return this.get<Volume>("/system/volume");
  }

  async setVolume(change: { level?: number; muted?: boolean }) {
    const query = new URLSearchParams();
    if (change.level !== undefined) query.set("level", String(Math.round(change.level)));
    if (change.muted !== undefined) query.set("muted", String(change.muted));
    const response = await this.request("POST", `/system/volume?${query}`);
    return (await response.json()) as Volume;
  }

  /**
   * Adresse d'une image du jeu, utilisable telle quelle dans <img src> (le jeton passe
   * dans l'URL, comme pour EventSource : une balise image n'envoie pas d'en-têtes).
   */
  mediaUrl(id: string, kind: "cover" | "background" | "icon"): string {
    return `${this.baseUrl}/games/${encodeURIComponent(id)}/media/${kind}?access_token=${encodeURIComponent(this.token)}`;
  }

  /** Flux d'événements. Interrompre avec `signal`. */
  async system(): Promise<SystemInfo> {
    // Le moteur omet les valeurs nulles.
    const info = await this.get<Partial<SystemInfo>>("/system");
    return {
      network: info.network ? { kind: info.network.kind, name: info.network.name ?? null } : null,
      controllerBattery: info.controllerBattery ?? null,
      brightness: info.brightness ?? null,
      audioOutput: info.audioOutput ?? null,
      disks: info.disks ?? null,
      media: info.media ? { ...info.media, app: info.media.app ?? null, artist: info.media.artist ?? null } : null,
    };
  }

  power(action: PowerAction) {
    return this.post(`/system/power?action=${action}`);
  }

  async setBrightness(level: number) {
    const response = await this.request("POST", `/system/brightness?level=${Math.round(level)}`);
    return ((await response.json()) as { level: number }).level;
  }

  async nextAudioOutput() {
    const response = await this.request("POST", "/system/audio-output/next");
    return ((await response.json()) as { name?: string | null }).name ?? null;
  }

  media(command: MediaCommand) {
    return this.post(`/system/media/${command}`);
  }

  async trophies(): Promise<TrophySummary> {
    const summary = await this.get<Partial<TrophySummary>>("/trophies");
    return { games: summary.games ?? {}, unlocked: summary.unlocked ?? 0, last: summary.last ?? null, refreshing: summary.refreshing ?? false };
  }

  refreshTrophies() {
    return this.post("/trophies/refresh");
  }

  async *events(signal?: AbortSignal): AsyncGenerator<EngineEvent> {
    const response = await this.request("GET", "/events", signal);
    if (!response.body) return;
    const decoder = new TextDecoder();
    // getReader() plutôt que `for await` : marche aussi dans un navigateur (l'interface).
    const reader = response.body.getReader();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        const event = parseSseMessage(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        if (event) yield event;
      }
    }
  }

  private async get<T>(path: string): Promise<T> {
    const response = await this.request("GET", path);
    return (await response.json()) as T;
  }

  private async post(path: string): Promise<void> {
    await this.request("POST", path);
  }

  private async request(method: string, path: string, signal?: AbortSignal): Promise<Response> {
    const response = await fetch(this.baseUrl + path, {
      method,
      signal,
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new ApiError(response.status, `${method} ${path} -> ${response.status} ${text}`.trim());
    }
    return response;
  }
}

export function parseSseMessage(message: string): EngineEvent | null {
  let type: string | null = null;
  const data: string[] = [];
  for (const line of message.split("\n")) {
    if (line.startsWith("event:")) type = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trim());
  }
  if (!type || data.length === 0) return null;
  return { type: type as EventType, data: JSON.parse(data.join("\n")) } as EngineEvent;
}
