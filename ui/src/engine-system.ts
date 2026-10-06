// SystemBridge du vrai moteur : lit GET /system régulièrement (réseau, manette, luminosité,
// sortie audio, disques, musique) et envoie les actions à l'API. Ce que le moteur ne sait pas
// encore faire reste null : les écrans le cachent.

import type { EngineClient } from "../../api/client.ts";
import type { SystemInfo, TrophySummary } from "../../api/types.ts";
import { formatRelativeDate } from "./format.ts";
import { quitApp } from "./shell.ts";
import type { PowerAction, SystemBridge, SystemSnapshot } from "./system.ts";

/** Assez souvent pour suivre la musique, sans charger le moteur. */
const POLL_MS = 3000;
/** Les trophées changent rarement (après une partie). */
const TROPHIES_POLL_MS = 60_000;

const EMPTY: SystemSnapshot = {
  brightness: null,
  audioOutput: null,
  controllerBattery: null,
  network: null,
  discord: null,
  music: null,
  musicServices: ["Spotify", "YouTube Music", "Deezer"],
  disks: null,
  trophiesUnlocked: null,
  lastTrophy: null,
};

/** Traduit la réponse du moteur dans le format des écrans (system.ts). */
export function toSnapshot(info: SystemInfo, previous: SystemSnapshot = EMPTY): SystemSnapshot {
  const network = info.network;
  return {
    ...previous,
    brightness: info.brightness,
    audioOutput: info.audioOutput,
    controllerBattery: info.controllerBattery,
    network: !network || network.kind === "none" ? null : network.kind === "ethernet" ? "Câble" : network.name ?? "Wi-Fi",
    music: info.media
      ? { service: info.media.app ?? "Musique", title: info.media.title, artist: info.media.artist ?? "", playing: info.media.playing }
      : null,
    disks: info.disks?.map((d) => ({ ...d, letter: `${d.letter}:` })) ?? null,
  };
}

/** Total et dernier trophée dans le format des écrans. */
export function withTrophies(state: SystemSnapshot, summary: TrophySummary): SystemSnapshot {
  const hasAny = Object.keys(summary.games).length > 0;
  return {
    ...state,
    trophiesUnlocked: hasAny ? summary.unlocked : null,
    lastTrophy: summary.last
      ? { name: summary.last.name, game: summary.last.gameName, when: formatRelativeDate(summary.last.unlockedAt).toLowerCase() }
      : null,
  };
}

export function createEngineSystem(client: EngineClient): SystemBridge {
  let state = EMPTY;
  let trophies: TrophySummary | null = null;
  let trophiesReadAt = 0;
  const watchers = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const changed = () => watchers.forEach((callback) => callback());

  const refresh = async () => {
    try {
      if (Date.now() - trophiesReadAt > TROPHIES_POLL_MS) {
        trophiesReadAt = Date.now();
        trophies = await client.trophies().catch(() => trophies);
      }
      let next = toSnapshot(await client.system(), state);
      if (trophies) next = withTrophies(next, trophies);
      if (JSON.stringify(next) !== JSON.stringify(state)) {
        state = next;
        changed();
      }
    } catch {
      // Moteur absent ou en redémarrage : on garde les dernières valeurs.
    }
  };

  const loop = async () => {
    if (stopped) return;
    // Fenêtre cachée (bureau Windows, jeu au premier plan) : inutile de lire le PC.
    if (document.visibilityState === "visible") await refresh();
    if (!stopped) timer = setTimeout(loop, POLL_MS);
  };

  /** Lance une action, puis relit l'état pour l'afficher tout de suite. */
  const act = (run: () => Promise<unknown>) => {
    run().then(refresh, () => undefined);
  };

  return {
    snapshot: () => state,
    watch(callback) {
      watchers.add(callback);
      if (watchers.size === 1) {
        stopped = false;
        void loop();
      }
      return () => {
        watchers.delete(callback);
        if (watchers.size === 0) {
          stopped = true;
          if (timer) clearTimeout(timer);
        }
      };
    },
    setBrightness(value) {
      // Affichage immédiat : le curseur suit le stick sans attendre le moteur.
      state = { ...state, brightness: Math.max(0, Math.min(100, Math.round(value))) };
      changed();
      act(() => client.setBrightness(value));
    },
    nextAudioOutput: () => act(() => client.nextAudioOutput()),
    toggleMicrophone: () => undefined,
    leaveCall: () => undefined,
    musicPrevious: () => act(() => client.media("previous")),
    musicToggle: () => act(() => client.media("toggle")),
    musicNext: () => act(() => client.media("next")),
    trophies: (gameId) => trophies?.games[gameId] ?? null,
    lastSession: () => null,
    power(action: PowerAction) {
      // « Bureau Windows » : moteur arrêté, Playscreen fermé ; seule la sentinelle reste et le
      // méta-raccourci relance tout.
      if (action === "desktop") void client.quit().finally(() => void quitApp());
      else act(() => client.power(action));
    },
  };
}
