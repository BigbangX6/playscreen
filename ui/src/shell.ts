// Actions de la fenêtre Windows de Playscreen (coque Tauri). Dans un navigateur ou dans la
// démo, elles ne font rien et renvoient faux : l'interface doit le supporter.

import type { Game } from "../../api/types.ts";

const IN_TAURI = "__TAURI_INTERNALS__" in window;

/**
 * « Reprendre » : remet la fenêtre du jeu au premier plan (D10). Faux si impossible (pas
 * dans Tauri, jeu sans dossier d'installation, fenêtre introuvable).
 */
/** Met au premier plan une fenêtre de launcher signalée par le moteur (launcher.prompt). */
export async function focusLauncherWindow(handle: number): Promise<boolean> {
  if (!IN_TAURI || !handle) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("focus_window", { handle });
}

export async function resumeGame(game: Game): Promise<boolean> {
  if (!IN_TAURI || !game.installDirectory) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("focus_game", { installDirectory: game.installDirectory });
}

/**
 * « Bureau Windows » : réduit Playscreen (il reste en mémoire). Select + Start le ramène :
 * la sentinelle restaure une fenêtre réduite. Faux hors de Tauri.
 */
export async function hideToDesktop(): Promise<boolean> {
  if (!IN_TAURI) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("hide_to_desktop");
}
