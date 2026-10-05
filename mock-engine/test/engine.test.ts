import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ApiError, PlayscreenClient } from "../../api/client.ts";
import type { EngineEvent, EventType } from "../../api/types.ts";
import { startMockEngine, type MockEngine } from "../src/server.ts";

const TOKEN = "test-token";
const HADES = "00000000-0000-4000-8000-000000000001";
const BG3 = "00000000-0000-4000-8000-000000000002";

let engine: MockEngine;
let client: PlayscreenClient;

before(async () => {
  engine = await startMockEngine({ token: TOKEN, tickMs: 5, sessionMs: 20 });
  client = new PlayscreenClient(engine.url, TOKEN);
});

after(() => engine.close());

/** Collecte les événements jusqu'à recevoir `until`. */
async function collectUntil(until: EventType, action: () => Promise<void>): Promise<EngineEvent[]> {
  const controller = new AbortController();
  const events: EngineEvent[] = [];
  const stream = client.events(controller.signal);
  const first = stream.next(); // ouvre la connexion avant l'action
  await new Promise((resolve) => setTimeout(resolve, 20));
  await action();
  let result = await first;
  while (!result.done) {
    events.push(result.value);
    if (result.value.type === until) break;
    result = await stream.next();
  }
  controller.abort();
  return events;
}

describe("faux moteur", () => {
  it("refuse les requêtes sans jeton", async () => {
    const intruder = new PlayscreenClient(engine.url, "mauvais-jeton");
    await assert.rejects(intruder.status(), (e: unknown) => e instanceof ApiError && e.status === 401);
  });

  it("autorise l'interface (CORS) mais pas une autre page web", async () => {
    const preflight = (origin: string) =>
      fetch(`${engine.url}/games`, {
        method: "OPTIONS",
        headers: { Origin: origin, "Access-Control-Request-Headers": "authorization" },
      });
    const ui = await preflight("http://tauri.localhost");
    assert.equal(ui.status, 204);
    assert.equal(ui.headers.get("access-control-allow-origin"), "http://tauri.localhost");
    const other = await preflight("https://example.com");
    assert.equal(other.headers.get("access-control-allow-origin"), null);
  });

  it("donne son état", async () => {
    const status = await client.status();
    assert.equal(status.engine, "mock");
    assert.equal(status.ready, true);
  });

  it("liste les 4 stores avec leur nombre de jeux", async () => {
    const stores = await client.stores();
    assert.deepEqual(stores.map((s) => s.id), ["steam", "epic", "xbox", "battlenet"]);
    assert.ok(stores.find((s) => s.id === "steam")!.gameCount > 0);
  });

  it("filtre les jeux par store et par installation", async () => {
    const steamInstalled = await client.games({ store: "steam", installed: true });
    assert.ok(steamInstalled.length > 0);
    assert.ok(steamInstalled.every((g) => g.store === "steam" && g.installed));
  });

  it("répond 404 pour un jeu inconnu et 409 pour lancer un jeu non installé", async () => {
    await assert.rejects(client.game("inconnu"), (e: unknown) => e instanceof ApiError && e.status === 404);
    await assert.rejects(client.start(BG3), (e: unknown) => e instanceof ApiError && e.status === 409);
  });

  it("lance un jeu et compte le temps de jeu", async () => {
    const before = (await client.game(HADES)).playtimeSeconds;
    const events = await collectUntil("game.stopped", () => client.start(HADES));
    assert.deepEqual(events.map((e) => e.type), ["game.starting", "game.started", "game.stopped"]);
    const after = await client.game(HADES);
    assert.ok(after.playtimeSeconds >= before);
    assert.ok(after.lastPlayed);
  });

  it("installe un jeu avec une progression croissante", async () => {
    const events = await collectUntil("game.installed", () => client.install(BG3));
    const progress = events.filter((e) => e.type === "install.progress").map((e) => e.data.bytesDone);
    assert.equal(progress.length, 10);
    assert.deepEqual(progress, [...progress].sort((a, b) => a - b));
    assert.equal((await client.game(BG3)).installed, true);
  });

  it("synchronise un store et refuse une deuxième synchronisation simultanée", async () => {
    const events = await collectUntil("sync.finished", async () => {
      await client.sync("steam");
      await assert.rejects(client.sync("steam"), (e: unknown) => e instanceof ApiError && e.status === 409);
    });
    assert.deepEqual(events.map((e) => e.type), ["sync.started", "store.updated", "sync.finished"]);
    const finished = events.at(-1);
    assert.equal(finished?.type === "sync.finished" && finished.data.ok, true);
  });

  it("connecte un store, une connexion à la fois", async () => {
    const events = await collectUntil("store.updated", async () => {
      await client.login("epic");
      await assert.rejects(client.login("steam"), (e: unknown) => e instanceof ApiError && e.status === 409);
    });
    const updated = events.find((e) => e.type === "store.updated");
    assert.equal(updated?.type === "store.updated" && updated.data.connected, true);
  });

  it("sert des images de remplacement et 404 si le jeu n'en a pas", async () => {
    const ok = await fetch(`${engine.url}/games/${HADES}/media/cover`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    assert.equal(ok.headers.get("content-type"), "image/svg+xml");
    const missing = await fetch(`${engine.url}/games/00000000-0000-4000-8000-000000000008/media/cover`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(missing.status, 404);
  });
});
