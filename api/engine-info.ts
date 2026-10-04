// Emplacement et lecture/écriture de engine.json (port + jeton du moteur).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { EngineInfo } from "./types.ts";

export const DEFAULT_PORT = 47800;

export function engineInfoPath(): string {
  if (process.env.PLAYSCREEN_ENGINE_FILE) return process.env.PLAYSCREEN_ENGINE_FILE;
  const base =
    process.platform === "win32"
      ? (process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"))
      : join(homedir(), ".local", "share");
  return join(base, process.platform === "win32" ? "Playscreen" : "playscreen", "engine.json");
}

export function readEngineInfo(path = engineInfoPath()): EngineInfo {
  return JSON.parse(readFileSync(path, "utf8")) as EngineInfo;
}

export function writeEngineInfo(info: EngineInfo, path = engineInfoPath()): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(info, null, 2));
}
