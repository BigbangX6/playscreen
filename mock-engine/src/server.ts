// Faux moteur : implémente l'API Playscreen v0 en mémoire, avec des délais simulés.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
  ALLOWED_ORIGINS,
  API_VERSION,
  type EngineEvent,
  type EventMap,
  type EventType,
  type Game,
  type Session,
  type LauncherSetting,
  type Store,
  type StoreId,
  type SystemInfo,
  type Volume,
} from "../../api/types.ts";
import { fixtureGames, fixtureStores } from "./fixtures.ts";

export interface MockEngineOptions {
  token: string;
  port?: number;
  /** Durée d'une étape simulée (progression, lancement…), en ms. */
  tickMs?: number;
  /** Durée d'une session de jeu simulée, en ms. */
  sessionMs?: number;
}

export interface MockEngine {
  url: string;
  port: number;
  close(): Promise<void>;
}

const INSTALL_STEPS = 10;
const DEFAULT_INSTALL_BYTES = 10 * 1024 ** 3;

export async function startMockEngine(options: MockEngineOptions): Promise<MockEngine> {
  const tickMs = options.tickMs ?? 500;
  const sessionMs = options.sessionMs ?? 5000;
  const games = new Map(fixtureGames().map((g) => [g.id, g]));
  const stores = new Map(fixtureStores().map((s) => [s.id, s]));
  const subscribers = new Set<ServerResponse>();
  const timers = new Set<NodeJS.Timeout>();
  const busy = new Set<string>();
  const syncing = new Set<StoreId>();
  let session: Session | null = null;
  const volume: Volume = { level: 60, muted: false };
  // Réglages des launchers simulés : Steam « tourne », Battle.net non.
  const launcherSettings: LauncherSetting[] = [
    { id: "steam.bigPictureOverlay", store: "steam", label: "Overlay Big Picture", value: "0", recommended: "1", applied: false, launcherRunning: true },
    { id: "battlenet.gameLaunch", store: "battlenet", label: "Réduire Battle.net au lancement d'un jeu", value: null, recommended: "3", applied: false, launcherRunning: false },
  ];
  // Le PC simulé : rien n'est vraiment éteint ni mis en veille.
  const audioOutputs = ["Haut-parleurs", "Télé (HDMI)"];
  const system: SystemInfo = {
    network: { kind: "wifi", name: "Maison" },
    controllerBattery: 60,
    brightness: 70,
    audioOutput: audioOutputs[0]!,
    disks: [{ letter: "C", label: "Windows", totalBytes: 512e9, freeBytes: 140e9, gamesBytes: 210e9 }],
    media: { app: "Spotify", title: "Midnight City", artist: "M83", playing: true },
  };
  // Une seule fenêtre de connexion à la fois, comme la passerelle.
  let loggingIn = false;
  // Launchers déjà ouverts : la première demande les fait démarrer.
  const openLaunchers = new Set<StoreId>();

  const later = (ms: number, fn: () => void) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      fn();
    }, ms);
    timers.add(timer);
  };

  const emit = <K extends EventType>(type: K, data: EventMap[K]) => {
    const event = { type, data } as EngineEvent;
    const message = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
    for (const subscriber of subscribers) subscriber.write(message);
  };

  /** Comme la passerelle : état du launcher au départ, puis « prêt » au tick suivant. */
  const watchLauncher = (store: Game["store"]) => {
    if (store === "other" || store === "xbox") return;
    if (openLaunchers.has(store)) {
      emit("launcher.state", { storeId: store, state: "ready" });
      return;
    }
    emit("launcher.state", { storeId: store, state: "starting" });
    later(tickMs / 2, () => {
      openLaunchers.add(store);
      emit("launcher.state", { storeId: store, state: "ready" });
    });
  };

  const storeView = (store: Store): Store => ({
    ...store,
    gameCount: [...games.values()].filter((g) => g.store === store.id).length,
  });

  const handlers: Route[] = [
    route("GET", /^\/status$/, () =>
      json(200, { engine: "mock", apiVersion: API_VERSION, engineVersion: "mock", ready: true }),
    ),
    route("GET", /^\/stores$/, () => json(200, [...stores.values()].map(storeView))),
    route("POST", /^\/stores\/([^/]+)\/sync$/, ([storeId]) => {
      const store = stores.get(storeId as StoreId);
      if (!store) return json(404, { error: "unknown store" });
      if (!store.pluginInstalled) return json(409, { error: "plugin not installed" });
      if (syncing.has(store.id)) return json(409, { error: "busy" });
      syncing.add(store.id);
      emit("sync.started", { storeId: store.id });
      later(tickMs, () => {
        syncing.delete(store.id);
        const ok = store.connected !== false;
        emit("store.updated", storeView(store));
        emit("sync.finished", ok ? { storeId: store.id, ok } : { storeId: store.id, ok, error: "not connected" });
      });
      return empty(202);
    }),
    route("POST", /^\/stores\/([^/]+)\/login$/, ([storeId]) => {
      const store = stores.get(storeId as StoreId);
      if (!store) return json(404, { error: "unknown store" });
      if (!store.pluginInstalled) return json(409, { error: "plugin not installed" });
      if (loggingIn) return json(409, { error: "busy" });
      loggingIn = true;
      later(tickMs, () => {
        loggingIn = false;
        store.connected = true;
        emit("store.updated", storeView(store));
      });
      return empty(202);
    }),
    route("GET", /^\/games$/, (_, query) => {
      let list = [...games.values()];
      const installed = query.get("installed");
      if (installed !== null) list = list.filter((g) => g.installed === (installed === "true"));
      const store = query.get("store");
      if (store !== null) list = list.filter((g) => g.store === store);
      return json(200, list);
    }),
    route("GET", /^\/games\/([^/]+)$/, ([id]) => {
      const game = games.get(id!);
      return game ? json(200, game) : json(404, { error: "unknown game" });
    }),
    route("POST", /^\/games\/([^/]+)\/start$/, ([id]) =>
      withGame(id!, (game) => {
        if (!game.installed) return json(409, { error: "not installed" });
        if (session) return json(409, { error: "another game is running" });
        busy.add(game.id);
        session = { gameId: game.id, phase: "starting", startedAt: new Date().toISOString() };
        emit("game.starting", { gameId: game.id });
        watchLauncher(game.store);
        later(tickMs, () => {
          if (session?.gameId !== game.id) return;
          session.phase = "running";
          emit("game.started", { gameId: game.id });
        });
        later(tickMs + sessionMs, () => stopGame(game));
        return empty(202);
      }),
    ),
    route("POST", /^\/games\/([^/]+)\/stop$/, ([id]) => {
      const game = games.get(id!);
      if (!game) return json(404, { error: "unknown game" });
      if (session?.gameId !== game.id) return json(409, { error: "not running" });
      later(tickMs, () => stopGame(game));
      return empty(202);
    }),
    route("GET", /^\/session$/, () => json(200, session)),
    route("GET", /^\/system\/volume$/, () => json(200, volume)),
    route("POST", /^\/system\/volume$/, (_, query) => {
      const level = query.get("level");
      const muted = query.get("muted");
      if (level !== null) volume.level = Math.max(0, Math.min(100, Number(level) || 0));
      if (muted !== null) volume.muted = muted === "true";
      emit("volume.changed", { ...volume });
      return json(200, volume);
    }),
    route("GET", /^\/launchers\/settings$/, () => json(200, launcherSettings)),
    route("POST", /^\/launchers\/settings\/([^/]+)\/apply$/, ([id]) => {
      const setting = launcherSettings.find((s) => s.id === decodeURIComponent(id!));
      if (!setting) return json(404, { error: "unknown" });
      if (setting.launcherRunning) return json(409, { error: "running" });
      setting.value = setting.recommended;
      setting.applied = true;
      return empty(204);
    }),
    route("GET", /^\/trophies$/, () =>
      json(200, {
        games: { [[...games.values()][0]!.id]: { unlocked: 12, total: 40 } },
        unlocked: 12,
        last: { name: "Premier pas", gameId: [...games.values()][0]!.id, gameName: [...games.values()][0]!.name, unlockedAt: "2026-10-05T20:00:00Z" },
        refreshing: false,
      }),
    ),
    route("POST", /^\/trophies\/refresh$/, () => {
      later(tickMs, () => emit("trophies.updated", {}));
      return empty(202);
    }),
    route("GET", /^\/system$/, () => json(200, system)),
    route("POST", /^\/system\/power$/, (_, query) =>
      ["sleep", "shutdown", "restart"].includes(query.get("action") ?? "") ? empty(202) : json(400, { error: "unknown action" }),
    ),
    route("POST", /^\/system\/brightness$/, (_, query) => {
      const level = Number(query.get("level"));
      if (!Number.isFinite(level)) return json(400, { error: "level required" });
      system.brightness = Math.max(0, Math.min(100, Math.round(level)));
      return json(200, { level: system.brightness });
    }),
    route("POST", /^\/system\/audio-output\/next$/, () => {
      system.audioOutput = audioOutputs[(audioOutputs.indexOf(system.audioOutput ?? "") + 1) % audioOutputs.length]!;
      return json(200, { name: system.audioOutput });
    }),
    route("POST", /^\/system\/media\/(toggle|previous|next)$/, ([command]) => {
      if (!system.media) return json(409, { error: "nothing playing" });
      if (command === "toggle") system.media.playing = !system.media.playing;
      return empty(202);
    }),
    route("POST", /^\/games\/([^/]+)\/install$/, ([id]) =>
      withGame(id!, (game) => {
        if (game.installed) return json(409, { error: "already installed" });
        busy.add(game.id);
        const bytesTotal = game.installSizeBytes ?? DEFAULT_INSTALL_BYTES;
        for (let step = 1; step <= INSTALL_STEPS; step++) {
          later(tickMs * step, () =>
            emit("install.progress", {
              gameId: game.id,
              bytesDone: Math.round((bytesTotal * step) / INSTALL_STEPS),
              bytesTotal,
            }),
          );
        }
        later(tickMs * (INSTALL_STEPS + 1), () => {
          game.installed = true;
          game.installDirectory = `C:\\Games\\${game.name.replace(/[^\w ]/g, "")}`;
          busy.delete(game.id);
          emit("game.installed", { gameId: game.id });
          emit("library.updated", { added: [], updated: [game.id], removed: [] });
        });
        return empty(202);
      }),
    ),
    route("POST", /^\/games\/([^/]+)\/uninstall$/, ([id]) =>
      withGame(id!, (game) => {
        if (!game.installed) return json(409, { error: "not installed" });
        busy.add(game.id);
        later(tickMs, () => {
          game.installed = false;
          game.installDirectory = null;
          busy.delete(game.id);
          emit("game.uninstalled", { gameId: game.id });
          emit("library.updated", { added: [], updated: [game.id], removed: [] });
        });
        return empty(202);
      }),
    ),
    route("GET", /^\/games\/([^/]+)\/media\/(cover|background|icon)$/, ([id, kind]) => {
      const game = games.get(id!);
      const available = game?.media?.[kind as "cover" | "background" | "icon"];
      if (!game || !available) return json(404, { error: "no media" });
      return { status: 200, type: "image/svg+xml", body: placeholderSvg(game, kind!) };
    }),
  ];

  /** Fin de partie (arrêt demandé ou fin de la session simulée), une seule fois. */
  function stopGame(game: Game) {
    if (session?.gameId !== game.id) return;
    const sessionSeconds = Math.max(1, Math.round((Date.now() - Date.parse(session.startedAt)) / 1000));
    session = null;
    game.playtimeSeconds += sessionSeconds;
    game.lastSessionSeconds = sessionSeconds;
    game.lastPlayed = new Date().toISOString();
    busy.delete(game.id);
    emit("game.stopped", { gameId: game.id, sessionSeconds });
  }

  function withGame(id: string, fn: (game: Game) => Reply): Reply {
    const game = games.get(id);
    if (!game) return json(404, { error: "unknown game" });
    if (busy.has(id)) return json(409, { error: "busy" });
    return fn(game);
  }

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const origin = req.headers.origin;
    if (origin && (ALLOWED_ORIGINS as readonly string[]).includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    // Demande préalable du navigateur (en-tête Authorization) : pas de jeton à ce stade.
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Methods": "GET, POST",
        "Access-Control-Allow-Headers": "Authorization",
        "Access-Control-Max-Age": "600",
      });
      return res.end();
    }
    if (!isAuthorized(req, url, options.token)) {
      return send(res, json(401, { error: "unauthorized" }));
    }
    const path = url.pathname.replace(/^\/api\/v0/, "");

    if (req.method === "GET" && path === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(": connected\n\n");
      subscribers.add(res);
      req.on("close", () => subscribers.delete(res));
      return;
    }

    for (const handler of handlers) {
      if (handler.method !== req.method) continue;
      const match = handler.pattern.exec(path);
      if (match) return send(res, handler.run(match.slice(1).map(decodeURIComponent), url.searchParams));
    }
    send(res, json(404, { error: "not found" }));
  });

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  return {
    port,
    url: `http://127.0.0.1:${port}/api/v0`,
    close: async () => {
      for (const timer of timers) clearTimeout(timer);
      for (const subscriber of subscribers) subscriber.end();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

interface Reply {
  status: number;
  type?: string;
  body?: string;
}

interface Route {
  method: string;
  pattern: RegExp;
  run(params: string[], query: URLSearchParams): Reply;
}

function route(method: string, pattern: RegExp, run: Route["run"]): Route {
  return { method, pattern, run };
}

function json(status: number, value: unknown): Reply {
  return { status, type: "application/json", body: JSON.stringify(value) };
}

function empty(status: number): Reply {
  return { status };
}

function send(res: ServerResponse, reply: Reply) {
  res.writeHead(reply.status, reply.type ? { "Content-Type": reply.type } : {});
  res.end(reply.body);
}

function isAuthorized(req: IncomingMessage, url: URL, token: string): boolean {
  // Le jeton en paramètre d'URL est accepté pour EventSource (qui ne peut pas envoyer d'en-têtes).
  return req.headers.authorization === `Bearer ${token}` || url.searchParams.get("access_token") === token;
}

function placeholderSvg(game: Game, kind: string): string {
  const [w, h] = kind === "cover" ? [600, 900] : kind === "background" ? [1920, 1080] : [256, 256];
  const hue = [...game.id].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 360;
  const label = game.name.replace(/[<&>]/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="hsl(${hue} 45% 30%)"/><text x="50%" y="50%" fill="#fff" font-family="sans-serif" font-size="${Math.round(w / 16)}" text-anchor="middle">${label}</text></svg>`;
}
