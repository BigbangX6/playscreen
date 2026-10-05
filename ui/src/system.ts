// Ce que l'interface sait du PC en dehors des jeux : sortie audio, luminosité, manette, réseau,
// Discord, musique, disques, trophées, alimentation. Le moteur ne fournit rien de tout cela
// pour l'instant (voir « Pas encore possible » dans ui/README.md) : la version démo le simule
// (src/demo/demo-system.ts) ; ailleurs, tout est « indisponible » et les écrans le cachent.

import { useSyncExternalStore } from "react";
import { DEMO } from "./engine.ts";

export interface DiscordState {
  /** Appel vocal en cours, sinon null. */
  call: { channel: string; people: number; muted: boolean } | null;
  unread: number;
  online: number;
}

export interface MusicState {
  service: string;
  title: string;
  artist: string;
  playing: boolean;
}

export interface Disk {
  letter: string;
  label: string;
  totalBytes: number;
  freeBytes: number;
  gamesBytes: number;
}

export interface Trophies {
  unlocked: number;
  total: number;
}

export interface SystemSnapshot {
  /** 0 à 100 ; null = l'écran ne se règle pas (télé, la plupart des écrans externes). */
  brightness: number | null;
  audioOutput: string | null;
  /** Batterie de la manette, 0 à 100. */
  controllerBattery: number | null;
  /** Nom du réseau Wi-Fi, ou « Câble ». */
  network: string | null;
  discord: DiscordState | null;
  music: MusicState | null;
  /** Services de musique proposés (le premier est celui choisi). */
  musicServices: string[];
  disks: Disk[] | null;
  trophiesUnlocked: number | null;
  lastTrophy: { name: string; game: string; when: string } | null;
}

export type PowerAction = "sleep" | "shutdown" | "restart" | "desktop";

export interface SystemBridge {
  snapshot(): SystemSnapshot;
  watch(callback: () => void): () => void;
  setBrightness(value: number): void;
  nextAudioOutput(): void;
  toggleMicrophone(): void;
  leaveCall(): void;
  musicPrevious(): void;
  musicToggle(): void;
  musicNext(): void;
  trophies(gameId: string): Trophies | null;
  /** Durée de la dernière partie (secondes), si connue. */
  lastSession(gameId: string): number | null;
  power(action: PowerAction): void;
}

const UNAVAILABLE: SystemSnapshot = {
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

const noop = () => undefined;

/** Vrai moteur : rien de tout cela n'existe encore. */
const NO_SYSTEM: SystemBridge = {
  snapshot: () => UNAVAILABLE,
  watch: () => noop,
  setBrightness: noop,
  nextAudioOutput: noop,
  toggleMicrophone: noop,
  leaveCall: noop,
  musicPrevious: noop,
  musicToggle: noop,
  musicNext: noop,
  trophies: () => null,
  lastSession: () => null,
  power: noop,
};

let bridge: SystemBridge = NO_SYSTEM;
const subscribers = new Set<() => void>();
let unwatch: () => void = noop;

function use(next: SystemBridge) {
  unwatch();
  bridge = next;
  unwatch = bridge.watch(() => subscribers.forEach((callback) => callback()));
  subscribers.forEach((callback) => callback());
}

if (DEMO) void import("./demo/demo-system.ts").then((m) => use(m.demoSystem));

export const system: SystemBridge = {
  snapshot: () => bridge.snapshot(),
  watch: (callback) => {
    subscribers.add(callback);
    return () => subscribers.delete(callback);
  },
  setBrightness: (v) => bridge.setBrightness(v),
  nextAudioOutput: () => bridge.nextAudioOutput(),
  toggleMicrophone: () => bridge.toggleMicrophone(),
  leaveCall: () => bridge.leaveCall(),
  musicPrevious: () => bridge.musicPrevious(),
  musicToggle: () => bridge.musicToggle(),
  musicNext: () => bridge.musicNext(),
  trophies: (id) => bridge.trophies(id),
  lastSession: (id) => bridge.lastSession(id),
  power: (action) => bridge.power(action),
};

/** État du système, redessiné à chaque changement. */
export function useSystem(): SystemSnapshot {
  return useSyncExternalStore(system.watch, system.snapshot);
}
