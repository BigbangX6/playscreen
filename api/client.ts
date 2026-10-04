// Client de l'API Playscreen, partagé par `psc`, les tests et (plus tard) l'interface.

import type { EngineEvent, EventType, Game, Status, Store, StoreId } from "./types.ts";

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class PlayscreenClient {
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

  login(storeId: StoreId) {
    return this.post(`/stores/${storeId}/login`);
  }

  /** Flux d'événements. Interrompre avec `signal`. */
  async *events(signal?: AbortSignal): AsyncGenerator<EngineEvent> {
    const response = await this.request("GET", "/events", signal);
    if (!response.body) return;
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
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
