// Ce que l'interface sait du PC en dehors des jeux : sortie audio, luminosité, manette, réseau,
// Discord, musique, disques, trophées, alimentation. Le moteur ne fournit rien de tout cela
// pour l'instant (voir « Pas encore possible » dans ui/README.md) : la version démo le simule
// (src/demo/demo-system.ts) ; ailleurs, tout est « indisponible » et les écrans le cachent.

import { useSyncExternalStore } from "react";
import type { EngineClient } from "../../api/client.ts";
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
  disks: Disk[] | null;
  trophiesUnlocked: number | null;
  lastTrophy: { name: string; game: string; when: string } | null;
  /** Fenêtres web ouvertes (gardées en arrière-plan) : « social », « musique »… */
  openWindows: string[];
}

export type PowerAction = "sleep" | "shutdown" | "restart" | "desktop";

/** Un trophée (succès) d'un jeu. */
export interface TrophyDetail {
  id: string;
  name: string;
  description: string;
  /** Date d'obtention, null s'il reste à obtenir. */
  unlockedAt: string | null;
  /** Part des joueurs qui l'ont (0 à 100), si le launcher la donne. */
  rarity: number | null;
  /** Trophée secret : description cachée tant qu'il n'est pas obtenu. */
  secret: boolean;
}

/** Réglages d'un jeu dans Playscreen (Playnite les garde). */
export interface GameOptions {
  favorite: boolean;
  /** Caché de l'accueil et de la bibliothèque. */
  hidden: boolean;
}

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
  /** Liste des trophées d'un jeu ; null si le moteur ne la donne pas. */
  trophyDetails(gameId: string): Promise<TrophyDetail[] | null>;
  /** Favori, caché ; null si indisponible. */
  gameOptions(gameId: string): GameOptions | null;
  setGameOption(gameId: string, option: keyof GameOptions, value: boolean): void;
  /** Vérifier / réparer les fichiers du jeu dans son launcher ; faux si impossible ici. */
  verifyGame(gameId: string): boolean;
  /** Une fenêtre web (Discord, musique…) vient d'être ouverte ou fermée. */
  windowChanged(window: string, open: boolean): void;
  /** Retour d'un relais (démo : un launcher « installé » le devient vraiment). */
  relayEnded(target: string): void;
}

const UNAVAILABLE: SystemSnapshot = {
  brightness: null,
  audioOutput: null,
  controllerBattery: null,
  network: null,
  discord: null,
  music: null,
  disks: null,
  trophiesUnlocked: null,
  lastTrophy: null,
  openWindows: [],
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
  trophyDetails: async () => null,
  gameOptions: () => null,
  setGameOption: noop,
  verifyGame: () => false,
  windowChanged: noop,
  relayEnded: noop,
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

/** Vrai moteur : le PC est lu par l'API dès que le moteur répond (null : déconnecté). */
export function connectSystem(client: EngineClient | null) {
  if (DEMO) return;
  if (!client) {
    use(NO_SYSTEM);
    return;
  }
  void import("./engine-system.ts").then((m) => use(m.createEngineSystem(client)));
}

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
  trophyDetails: (id) => bridge.trophyDetails(id),
  gameOptions: (id) => bridge.gameOptions(id),
  setGameOption: (id, option, value) => bridge.setGameOption(id, option, value),
  verifyGame: (id) => bridge.verifyGame(id),
  windowChanged: (window, open) => bridge.windowChanged(window, open),
  relayEnded: (target) => bridge.relayEnded(target),
};

/** État du système, redessiné à chaque changement. */
export function useSystem(): SystemSnapshot {
  return useSyncExternalStore(system.watch, system.snapshot);
}
