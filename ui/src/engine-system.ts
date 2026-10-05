// SystemBridge du vrai moteur : lit GET /system régulièrement (réseau, manette, luminosité,
// sortie audio, disques, musique) et envoie les actions à l'API. Ce que le moteur ne sait pas
// encore faire reste null : les écrans le cachent.

import type { EngineClient } from "../../api/client.ts";
import type { SystemInfo } from "../../api/types.ts";
import { hideToDesktop } from "./shell.ts";
import type { PowerAction, SystemBridge, SystemSnapshot } from "./system.ts";

/** Assez souvent pour suivre la musique, sans charger le moteur. */
const POLL_MS = 3000;

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

export function createEngineSystem(client: EngineClient): SystemBridge {
  let state = EMPTY;
  const watchers = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const changed = () => watchers.forEach((callback) => callback());

  const refresh = async () => {
    try {
      const next = toSnapshot(await client.system(), state);
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
    trophies: () => null,
    lastSession: () => null,
    power(action: PowerAction) {
      if (action === "desktop") void hideToDesktop();
      else act(() => client.power(action));
    },
  };
}
