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

/** Clavier manette de Windows (clavier tactile, disposition « manette »). Rien hors de Tauri. */
export async function showKeyboard(): Promise<boolean> {
  if (!IN_TAURI) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("show_keyboard");
}

export async function hideKeyboard(): Promise<boolean> {
  if (!IN_TAURI) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("hide_keyboard");
}

function isTextField(target: EventTarget | null): target is HTMLInputElement | HTMLTextAreaElement {
  return (target instanceof HTMLInputElement && !["button", "checkbox", "radio", "range"].includes(target.type)) || target instanceof HTMLTextAreaElement;
}

/**
 * Tout champ de texte ouvre le clavier manette quand il prend le focus, et le referme quand
 * il le perd (recherche, navigateur, connexions). Renvoie la fonction d'arrêt.
 */
export function startTextFieldKeyboard(): () => void {
  const onFocusIn = (event: FocusEvent) => {
    if (isTextField(event.target)) void showKeyboard();
  };
  const onFocusOut = (event: FocusEvent) => {
    if (isTextField(event.target) && !isTextField(event.relatedTarget)) void hideKeyboard();
  };
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", onFocusOut);
  return () => {
    document.removeEventListener("focusin", onFocusIn);
    document.removeEventListener("focusout", onFocusOut);
  };
}

/**
 * Relais : ouvre les Paramètres Windows (ou l'activation d'une clé Steam) et passe la manette
 * en souris (sentinelle). Faux hors de Tauri ou sans sentinelle.
 */
export async function startRelay(target: "windows-settings" | "activate-key"): Promise<boolean> {
  if (!IN_TAURI) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("start_relay", { target });
}

export async function stopMouseMode(): Promise<boolean> {
  if (!IN_TAURI) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("stop_mouse_mode");
}
