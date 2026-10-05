// Faux moteur : implémente l'API Playscreen v0 en mémoire, avec des délais simulés.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { API_VERSION, type EngineEvent, type EventMap, type EventType, type Game, type Store, type StoreId } from "../../api/types.ts";
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
  // Une seule fenêtre de connexion à la fois, comme la passerelle.
  let loggingIn = false;

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
        busy.add(game.id);
        emit("game.starting", { gameId: game.id });
        later(tickMs, () => emit("game.started", { gameId: game.id }));
        later(tickMs + sessionMs, () => {
          const sessionSeconds = Math.round(sessionMs / 1000);
          game.playtimeSeconds += sessionSeconds;
          game.lastPlayed = new Date().toISOString();
          busy.delete(game.id);
          emit("game.stopped", { gameId: game.id, sessionSeconds });
        });
        return empty(202);
      }),
    ),
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

  function withGame(id: string, fn: (game: Game) => Reply): Reply {
    const game = games.get(id);
    if (!game) return json(404, { error: "unknown game" });
    if (busy.has(id)) return json(409, { error: "busy" });
    return fn(game);
  }

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
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
