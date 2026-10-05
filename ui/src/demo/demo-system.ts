// Système simulé de la version démo : sortie audio, luminosité, Discord, musique, disques, trophées.
// Réglable depuis le panneau F2 (appel en cours, musique, luminosité disponible).

import type { Disk, PowerAction, SystemBridge, SystemSnapshot, Trophies } from "../system.ts";
import { demoClient } from "./demo-engine.ts";

const GB = 1024 ** 3;
const OUTPUTS = ["Télé (HDMI)", "Casque", "Haut-parleurs"];
const TRACKS: [title: string, artist: string][] = [
  ["Veridis Quo", "Daft Punk"],
  ["Midnight City", "M83"],
  ["Nightcall", "Kavinsky"],
  ["Intro", "The xx"],
];

export interface DemoSystemSettings {
  call: boolean;
  music: boolean;
  brightness: boolean;
}

function hash(text: string): number {
  return [...text].reduce((sum, c) => (sum * 31 + c.charCodeAt(0)) >>> 0, 7);
}

class DemoSystem implements SystemBridge {
  settings: DemoSystemSettings = { call: true, music: true, brightness: true };
  private state: SystemSnapshot;
  private track = 0;
  private output = 0;
  private watchers = new Set<() => void>();

  constructor() {
    this.state = this.initial();
  }

  private initial(): SystemSnapshot {
    const disks: Disk[] = [
      { letter: "C:", label: "Système", totalBytes: 931 * GB, freeBytes: 214 * GB, gamesBytes: 410 * GB },
    ];
    return {
      brightness: this.settings.brightness ? 70 : null,
      audioOutput: OUTPUTS[this.output]!,
      controllerBattery: 64,
      network: "Maison",
      discord: { call: this.settings.call ? { channel: "Les copains", people: 3, muted: false } : null, unread: 2, online: 3 },
      music: this.settings.music ? { service: "Spotify", title: TRACKS[0]![0], artist: TRACKS[0]![1], playing: true } : null,
      musicServices: ["Spotify", "YouTube Music", "Deezer"],
      disks,
      trophiesUnlocked: 412,
      lastTrophy: { name: "Sans une égratignure", game: "Hades II", when: "hier" },
    };
  }

  /** Panneau F2 : situations à voir. */
  set(patch: Partial<DemoSystemSettings>) {
    this.settings = { ...this.settings, ...patch };
    const discord = this.state.discord!;
    this.update({
      brightness: this.settings.brightness ? (this.state.brightness ?? 70) : null,
      discord: { ...discord, call: this.settings.call ? (discord.call ?? { channel: "Les copains", people: 3, muted: false }) : null },
      music: this.settings.music
        ? (this.state.music ?? { service: "Spotify", title: TRACKS[this.track]![0], artist: TRACKS[this.track]![1], playing: true })
        : null,
    });
  }

  reset() {
    this.settings = { call: true, music: true, brightness: true };
    this.track = 0;
    this.output = 0;
    this.state = this.initial();
    this.changed();
  }

  private update(patch: Partial<SystemSnapshot>) {
    this.state = { ...this.state, ...patch };
    this.changed();
  }

  private changed() {
    for (const callback of this.watchers) callback();
  }

  // --- SystemBridge ------------------------------------------------------------------

  snapshot() {
    return this.state;
  }

  watch(callback: () => void) {
    this.watchers.add(callback);
    return () => this.watchers.delete(callback);
  }

  setBrightness(value: number) {
    if (this.state.brightness === null) return;
    this.update({ brightness: Math.max(0, Math.min(100, Math.round(value))) });
  }

  nextAudioOutput() {
    this.output = (this.output + 1) % OUTPUTS.length;
    this.update({ audioOutput: OUTPUTS[this.output]! });
  }

  toggleMicrophone() {
    const discord = this.state.discord;
    if (!discord?.call) return;
    this.update({ discord: { ...discord, call: { ...discord.call, muted: !discord.call.muted } } });
  }

  leaveCall() {
    const discord = this.state.discord;
    if (!discord?.call) return;
    this.settings = { ...this.settings, call: false };
    this.update({ discord: { ...discord, call: null } });
  }

  private playTrack(step: number) {
    const music = this.state.music;
    if (!music) return;
    this.track = (this.track + step + TRACKS.length) % TRACKS.length;
    const [title, artist] = TRACKS[this.track]!;
    this.update({ music: { ...music, title, artist, playing: true } });
  }

  musicPrevious() {
    this.playTrack(-1);
  }

  musicNext() {
    this.playTrack(1);
  }

  musicToggle() {
    const music = this.state.music;
    if (music) this.update({ music: { ...music, playing: !music.playing } });
  }

  trophies(gameId: string): Trophies | null {
    const game = demoGame(gameId);
    if (!game || game.store === "other" || game.playtimeSeconds === 0) return null;
    if (game.name === "Hades II") return { unlocked: 23, total: 49 };
    const total = 20 + (hash(game.name) % 40);
    const hours = game.playtimeSeconds / 3600;
    return { unlocked: Math.min(total, Math.round(total * Math.min(1, hours / 80) + 2)), total };
  }

  lastSession(gameId: string): number | null {
    const game = demoGame(gameId);
    if (!game?.lastPlayed) return null;
    if (game.name === "Hades II") return 72 * 60;
    return (20 + (hash(game.name) % 100)) * 60;
  }

  power(_action: PowerAction) {
    // La démo affiche seulement une notification (voir App).
  }
}

function demoGame(id: string) {
  return demoClient.peek(id);
}

export const demoSystem = new DemoSystem();
