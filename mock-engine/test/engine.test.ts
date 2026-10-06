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
  engine = await startMockEngine({ token: TOKEN, tickMs: 5, sessionMs: 300 });
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
    assert.deepEqual(events.map((e) => e.type), ["game.starting", "launcher.state", "launcher.state", "game.started", "game.stopped"]);
    // Premier lancement : le launcher démarre, puis il est prêt avant le jeu.
    const states = events.flatMap((e) => (e.type === "launcher.state" ? [e.data.state] : []));
    assert.deepEqual(states, ["starting", "ready"]);
    // La durée de la partie est retenue sur le jeu.
    assert.ok(((await client.game(HADES)).lastSessionSeconds ?? 0) > 0);
    const after = await client.game(HADES);
    assert.ok(after.playtimeSeconds >= before);
    assert.ok(after.lastPlayed);
  });

  it("donne la partie en cours et la quitte sur demande", async () => {
    const events = await collectUntil("game.started", () => client.start(HADES));
    assert.equal(events.at(-1)?.type, "game.started");
    const session = await client.session();
    assert.equal(session?.gameId, HADES);
    assert.equal(session?.phase, "running");
    await collectUntil("game.stopped", () => client.stop(HADES));
    assert.equal(await client.session(), null);
    await assert.rejects(client.stop(HADES), (e: unknown) => e instanceof ApiError && e.status === 409);
  });

  it("règle le volume", async () => {
    const changed = await client.setVolume({ level: 35, muted: true });
    assert.deepEqual(changed, { level: 35, muted: true });
    assert.deepEqual(await client.volume(), { level: 35, muted: true });
    assert.equal((await client.setVolume({ level: 250 })).level, 100);
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
  it("décrit le PC et règle luminosité, sortie audio et musique", async () => {
    const info = await client.system();
    assert.equal(info.network?.kind, "wifi");
    assert.equal(await client.setBrightness(150), 100);
    const first = info.audioOutput;
    assert.notEqual(await client.nextAudioOutput(), first);
    await client.media("toggle");
    assert.equal((await client.system()).media?.playing, !info.media?.playing);
    await client.power("sleep");
    await assert.rejects(() => client.power("explode" as never), (e) => e instanceof ApiError && e.status === 400);
  });
  it("donne les trophées et les récupère à nouveau", async () => {
    const summary = await client.trophies();
    assert.equal(summary.unlocked, 12);
    assert.equal(Object.values(summary.games)[0]?.total, 40);
    const events = await collectUntil("trophies.updated", () => client.refreshTrophies());
    assert.equal(events.at(-1)?.type, "trophies.updated");
  });
  it("détaille les trophées d'un jeu, null sans trophées", async () => {
    const [first, second] = await client.games();
    const list = await client.trophyDetails(first!.id);
    assert.equal(list?.length, 2);
    assert.equal(list?.[1]?.unlockedAt, null);
    assert.equal(list?.[1]?.secret, true);
    assert.equal(await client.trophyDetails(second!.id), null);
  });
  it("met un jeu en favori et le cache", async () => {
    const [game] = await client.games();
    const events = await collectUntil("game.updated", async () => {
      const updated = await client.setGameOptions(game!.id, { favorite: true, hidden: true });
      assert.equal(updated.favorite, true);
      assert.equal(updated.hidden, true);
    });
    assert.equal(events.at(-1)?.type, "game.updated");
  });
  it("règle un launcher seulement s'il est fermé", async () => {
    await assert.rejects(() => client.applyLauncherSetting("steam.bigPictureOverlay"), (e) => e instanceof ApiError && e.status === 409);
    await client.applyLauncherSetting("battlenet.gameLaunch");
    const settings = await client.launcherSettings();
    assert.equal(settings.find((s) => s.id === "battlenet.gameLaunch")?.applied, true);
  });
});
