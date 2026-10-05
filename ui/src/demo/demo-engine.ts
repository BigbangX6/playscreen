// Faux moteur dans la page, pour la version démo de l'interface (un seul fichier HTML,
// sans serveur). Même contrat que le vrai moteur (EngineClient, événements), délais
// réglables depuis le panneau de démo (F2) pour voir chaque situation.

import { ApiError, type EngineClient } from "../../../api/client.ts";
import type { EngineEvent, EventMap, EventType, Game, Session, Status, Store, StoreId, Volume } from "../../../api/types.ts";
import { demoGames, demoImage, demoStores } from "./library.ts";

export interface DemoSettings {
  /** Délai avant que le téléchargement démarre (le launcher attend une action : F4). */
  installWaitSeconds: number;
  /** Durée du téléchargement une fois démarré. */
  installSeconds: number;
  /** Durée d'une partie avant son arrêt automatique (0 = jusqu'à « Arrêter la partie »). */
  sessionSeconds: number;
  /** Les connexions aux stores réussissent-elles ? */
  loginSucceeds: boolean;
  /** Bibliothèque vide (premier lancement). */
  emptyLibrary: boolean;
  /** État du launcher quand on lance ou installe un jeu (F25, F26). */
  launcher: "ready" | "starting" | "updating";
}

const DEFAULTS: DemoSettings = {
  installWaitSeconds: 3,
  installSeconds: 20,
  sessionSeconds: 0,
  loginSucceeds: true,
  emptyLibrary: false,
  launcher: "ready",
};

/** Durées simulées : le launcher démarre, ou se met à jour puis redémarre. */
const LAUNCHER_START_MS = 6000;
const LAUNCHER_UPDATE_MS = 15000;

const PROGRESS_STEP_MS = 500;

type Listener = (event: EngineEvent) => void;

class DemoEngine implements EngineClient {
  settings: DemoSettings = { ...DEFAULTS };
  offline = false;
  private current: Session | null = null;
  private sound: Volume = { level: 60, muted: false };

  get runningId(): string | null {
    return this.current?.gameId ?? null;
  }

  private gameMap = new Map<string, Game>();
  private storeMap = new Map<StoreId, Store>();
  private busy = new Set<string>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private listeners = new Set<Listener>();
  private closers = new Set<() => void>();
  private watchers = new Set<() => void>();

  constructor() {
    this.reset();
  }

  // --- Contrôles du panneau de démo -------------------------------------------------

  /** Le panneau s'abonne pour se redessiner quand l'état change. */
  watch(callback: () => void): () => void {
    this.watchers.add(callback);
    return () => this.watchers.delete(callback);
  }

  private changed() {
    for (const callback of this.watchers) callback();
  }

  set(patch: Partial<DemoSettings>) {
    const libraryChanged = patch.emptyLibrary !== undefined && patch.emptyLibrary !== this.settings.emptyLibrary;
    this.settings = { ...this.settings, ...patch };
    if (libraryChanged) {
      this.loadLibrary();
      this.emit("library.updated", { added: [], updated: [], removed: [] });
    }
    this.changed();
  }

  /** Coupe le moteur quelques secondes (écran « moteur indisponible », puis reconnexion). */
  cutEngine(seconds = 5) {
    this.offline = true;
    // Fin des flux d'événements en cours : l'interface passe en « moteur indisponible ».
    for (const close of this.closers) close();
    this.changed();
    this.later(seconds * 1000, () => {
      this.offline = false;
      this.changed();
    });
  }

  /** Lecture directe d'un jeu (système simulé : trophées, durée de la dernière partie). */
  peek(id: string): Game | undefined {
    return this.gameMap.get(id);
  }

  stopGame() {
    const id = this.runningId;
    if (!id) return;
    const game = this.gameMap.get(id)!;
    const sessionSeconds = Math.max(1, Math.round((Date.now() - Date.parse(this.current!.startedAt)) / 1000));
    game.playtimeSeconds += sessionSeconds;
    game.lastPlayed = new Date().toISOString();
    this.current = null;
    this.busy.delete(id);
    this.emit("game.stopped", { gameId: id, sessionSeconds });
    this.changed();
  }

  reset() {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.busy.clear();
    this.current = null;
    this.offline = false;
    this.settings = { ...DEFAULTS };
    this.storeMap = new Map(demoStores().map((s) => [s.id, s]));
    this.loadLibrary();
    this.emit("library.updated", { added: [], updated: [], removed: [] });
    this.changed();
  }

  private loadLibrary() {
    this.gameMap = new Map(this.settings.emptyLibrary ? [] : demoGames().map((g) => [g.id, g]));
  }

  // --- EngineClient ------------------------------------------------------------------

  async status(): Promise<Status> {
    this.ensureOnline();
    return { engine: "mock", apiVersion: "0.1.0", engineVersion: "démo", ready: true };
  }

  async stores(): Promise<Store[]> {
    this.ensureOnline();
    return [...this.storeMap.values()].map((s) => this.storeView(s));
  }

  async games(filter: { installed?: boolean; store?: StoreId } = {}): Promise<Game[]> {
    this.ensureOnline();
    return [...this.gameMap.values()]
      .filter((g) => filter.installed === undefined || g.installed === filter.installed)
      .filter((g) => !filter.store || g.store === filter.store)
      .map((g) => ({ ...g }));
  }

  async game(id: string): Promise<Game> {
    this.ensureOnline();
    const game = this.gameMap.get(id);
    if (!game) throw new ApiError(404, "unknown game");
    return { ...game };
  }

  /**
   * Comme la passerelle : launcher.state au départ puis à chaque changement, selon le
   * réglage du panneau. Renvoie le délai avant que le launcher soit prêt.
   */
  private launcherSequence(store: Game["store"]): number {
    if (store === "other" || store === "xbox") return 0;
    const storeId = store;
    const mode = this.settings.launcher;
    if (mode === "ready") {
      this.emit("launcher.state", { storeId, state: "ready" });
      return 0;
    }
    const updateMs = mode === "updating" ? LAUNCHER_UPDATE_MS : 0;
    if (mode === "updating") this.emit("launcher.state", { storeId, state: "updating" });
    else this.emit("launcher.state", { storeId, state: "starting" });
    if (updateMs) this.later(updateMs, () => this.emit("launcher.state", { storeId, state: "starting" }));
    this.later(updateMs + LAUNCHER_START_MS, () => this.emit("launcher.state", { storeId, state: "ready" }));
    return updateMs + LAUNCHER_START_MS;
  }

  async start(id: string): Promise<void> {
    const game = this.free(id);
    if (!game.installed) throw new ApiError(409, "not installed");
    this.busy.add(id);
    this.current = { gameId: id, phase: "starting", startedAt: new Date().toISOString() };
    this.emit("game.starting", { gameId: id });
    const ready = this.launcherSequence(game.store);
    this.later(ready + 2000, () => {
      if (this.current?.gameId !== id) return;
      this.current.phase = "running";
      this.emit("game.started", { gameId: id });
      if (this.settings.sessionSeconds > 0) this.later(this.settings.sessionSeconds * 1000, () => this.stopGame());
    });
    this.changed();
  }

  async install(id: string): Promise<void> {
    const game = this.free(id);
    if (game.installed) throw new ApiError(409, "already installed");
    this.busy.add(id);
    const total = game.installSizeBytes ?? 4 * 1024 ** 3;
    const steps = Math.max(1, Math.round((this.settings.installSeconds * 1000) / PROGRESS_STEP_MS));
    const ready = this.launcherSequence(game.store);
    const wait = ready + this.settings.installWaitSeconds * 1000;
    if (wait > ready && game.store !== "other") {
      // Le launcher ouvre sa fenêtre de confirmation (pas de vraie fenêtre dans la démo).
      this.later(ready + 500, () =>
        this.emit("launcher.prompt", { gameId: id, storeId: game.store as StoreId, title: `Installer ${game.name}`, handle: 0 }),
      );
    }
    for (let step = 0; step <= steps; step++) {
      this.later(wait + step * PROGRESS_STEP_MS, () =>
        this.emit("install.progress", { gameId: id, bytesDone: Math.round((total * step) / steps), bytesTotal: total }),
      );
    }
    this.later(wait + steps * PROGRESS_STEP_MS + 800, () => {
      game.installed = true;
      game.installDirectory = `C:\\Games\\${game.name.replace(/[^\w ]/g, "")}`;
      this.busy.delete(id);
      this.emit("game.installed", { gameId: id });
    });
  }

  async uninstall(id: string): Promise<void> {
    const game = this.free(id);
    if (!game.installed) throw new ApiError(409, "not installed");
    this.busy.add(id);
    this.later(1500, () => {
      game.installed = false;
      game.installDirectory = null;
      this.busy.delete(id);
      this.emit("game.uninstalled", { gameId: id });
    });
  }

  async sync(storeId: StoreId): Promise<void> {
    this.ensureOnline();
    const store = this.storeMap.get(storeId);
    if (!store) throw new ApiError(404, "unknown store");
    if (this.busy.has(`sync:${storeId}`)) throw new ApiError(409, "busy");
    this.busy.add(`sync:${storeId}`);
    this.emit("sync.started", { storeId });
    this.later(2000, () => {
      this.busy.delete(`sync:${storeId}`);
      this.emit("store.updated", this.storeView(store));
      this.emit("sync.finished", store.connected === false
        ? { storeId, ok: false, error: "not connected" }
        : { storeId, ok: true });
    });
  }

  async login(storeId: StoreId): Promise<void> {
    this.ensureOnline();
    const store = this.storeMap.get(storeId);
    if (!store) throw new ApiError(404, "unknown store");
    if (this.busy.has("login")) throw new ApiError(409, "busy");
    this.busy.add("login");
    this.later(4000, () => {
      this.busy.delete("login");
      store.connected = this.settings.loginSucceeds;
      this.emit("store.updated", this.storeView(store));
    });
  }

  async session(): Promise<Session | null> {
    this.ensureOnline();
    return this.current ? { ...this.current } : null;
  }

  async stop(id: string, options: { force?: boolean } = {}): Promise<void> {
    this.ensureOnline();
    if (!this.gameMap.has(id)) throw new ApiError(404, "unknown game");
    if (this.current?.gameId !== id) throw new ApiError(409, "not running");
    // Un jeu met un moment à se fermer ; forcé, c'est presque immédiat.
    this.later(options.force ? 300 : 1500, () => this.stopGame());
  }

  async volume(): Promise<Volume> {
    this.ensureOnline();
    return { ...this.sound };
  }

  async setVolume(change: { level?: number; muted?: boolean }): Promise<Volume> {
    this.ensureOnline();
    if (change.level !== undefined) this.sound.level = Math.max(0, Math.min(100, Math.round(change.level)));
    if (change.muted !== undefined) this.sound.muted = change.muted;
    this.emit("volume.changed", { ...this.sound });
    return { ...this.sound };
  }

  mediaUrl(id: string, kind: "cover" | "background" | "icon"): string {
    const game = this.gameMap.get(id);
    return game ? demoImage(game, kind) : "";
  }

  async *events(signal?: AbortSignal): AsyncGenerator<EngineEvent> {
    this.ensureOnline();
    const queue: EngineEvent[] = [];
    let closed = false;
    let wake: (() => void) | null = null;
    const listener: Listener = (event) => {
      queue.push(event);
      wake?.();
    };
    const close = () => {
      closed = true;
      wake?.();
    };
    this.listeners.add(listener);
    this.closers.add(close);
    signal?.addEventListener("abort", close);
    try {
      while (!closed && !signal?.aborted) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => (wake = resolve));
          wake = null;
          continue;
        }
        yield queue.shift()!;
      }
    } finally {
      this.listeners.delete(listener);
      this.closers.delete(close);
    }
  }

  // --- Outils ------------------------------------------------------------------------

  private ensureOnline() {
    if (this.offline) throw new Error("moteur indisponible (démo)");
  }

  private free(id: string): Game {
    this.ensureOnline();
    const game = this.gameMap.get(id);
    if (!game) throw new ApiError(404, "unknown game");
    if (this.busy.has(id)) throw new ApiError(409, "busy");
    return game;
  }

  private storeView(store: Store): Store {
    return { ...store, gameCount: [...this.gameMap.values()].filter((g) => g.store === store.id).length };
  }

  private emit<K extends EventType>(type: K, data: EventMap[K]) {
    const event = { type, data } as EngineEvent;
    for (const listener of this.listeners) listener(event);
  }

  private later(ms: number, fn: () => void) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, ms);
    this.timers.add(timer);
  }
}

export const demoClient = new DemoEngine();
