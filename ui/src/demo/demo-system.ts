// Système simulé de la version démo : sortie audio, luminosité, Discord, musique, disques, trophées.
// Réglable depuis le panneau F2 (appel en cours, musique, luminosité disponible).

import { musicService } from "../screens/spaces.ts";
import type { Disk, GameOptions, PowerAction, SystemBridge, SystemSnapshot, Trophies, TrophyDetail } from "../system.ts";
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
      music: this.settings.music ? { service: musicService().name, title: TRACKS[0]![0], artist: TRACKS[0]![1], playing: true } : null,
      disks,
      trophiesUnlocked: 412,
      lastTrophy: { name: "Sans une égratignure", game: "Hades II", when: "hier" },
      openWindows: [...(this.settings.call ? ["social"] : []), ...(this.settings.music ? ["musique"] : [])],
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
        ? (this.state.music ?? { service: musicService().name, title: TRACKS[this.track]![0], artist: TRACKS[this.track]![1], playing: true })
        : null,
      openWindows: this.withWindow(this.withWindow(this.state.openWindows, "social", this.settings.call || this.state.openWindows.includes("social")), "musique", this.settings.music),
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

  private options = new Map<string, GameOptions>();

  private withWindow(list: string[], window: string, open: boolean): string[] {
    const others = list.filter((w) => w !== window);
    return open ? [...others, window] : others;
  }

  windowChanged(window: string, open: boolean) {
    const openWindows = this.withWindow(this.state.openWindows, window, open);
    if (window === "social" && !open) {
      this.settings = { ...this.settings, call: false };
      this.update({ openWindows, discord: { ...this.state.discord!, call: null } });
    } else if (window === "musique") {
      this.settings = { ...this.settings, music: open };
      const [title, artist] = TRACKS[this.track]!;
      this.update({ openWindows, music: open ? { service: musicService().name, title, artist, playing: true } : null });
    } else this.update({ openWindows });
  }

  async trophyDetails(gameId: string): Promise<TrophyDetail[] | null> {
    const summary = this.trophies(gameId);
    const game = demoClient.peek(gameId);
    if (!summary || !game) return null;
    const names = [
      ["Premiers pas", "Termine le tutoriel."],
      ["Sans une égratignure", "Termine un niveau sans subir de dégâts."],
      ["Collectionneur", "Récupère 100 objets."],
      ["Increvable", "Survis 30 minutes d'affilée."],
      ["Explorateur", "Découvre toutes les zones."],
      ["Perfectionniste", "Obtiens tous les autres trophées."],
      ["Fine équipe", "Joue une partie avec un ami."],
      ["Marathon", "Joue 50 heures."],
      ["Chasseur de secrets", "Trouve la salle cachée."],
      ["Champion", "Gagne 10 parties d'affilée."],
    ];
    const seed = hash(game.name);
    return Array.from({ length: summary.total }, (_, i) => {
      const [name, description] = names[i % names.length]!;
      const unlocked = i < summary.unlocked;
      return {
        id: `${gameId}-${i}`,
        name: i < names.length ? name : `${name} ${Math.floor(i / names.length) + 1}`,
        description,
        unlockedAt: unlocked ? new Date(Date.now() - ((seed + i * 7) % 300) * 86_400_000).toISOString() : null,
        rarity: Math.max(0.4, Math.round(((seed >> (i % 8)) % 900) / 10 / (1 + i / 6)) / 1),
        secret: !unlocked && i % 7 === 6,
      };
    });
  }

  gameOptions(gameId: string): GameOptions | null {
    if (!demoClient.peek(gameId)) return null;
    return this.options.get(gameId) ?? { favorite: false, hidden: false };
  }

  setGameOption(gameId: string, option: keyof GameOptions, value: boolean) {
    this.options.set(gameId, { ...(this.gameOptions(gameId) ?? { favorite: false, hidden: false }), [option]: value });
    this.changed();
  }

  verifyGame(gameId: string): boolean {
    return Boolean(demoClient.peek(gameId)?.installed);
  }

  relayEnded(target: string) {
    const store = target.startsWith("install-") ? target.slice("install-".length) : null;
    if (store === "steam" || store === "epic" || store === "xbox" || store === "battlenet") demoClient.launcherInstalled(store);
  }

  power(_action: PowerAction) {
    // La démo affiche seulement une notification (voir App).
  }
}

function demoGame(id: string) {
  return demoClient.peek(id);
}

export const demoSystem = new DemoSystem();
