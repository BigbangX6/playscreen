// Actions de la fenêtre Windows de Playscreen (coque Tauri). Dans un navigateur ou dans la
// démo, elles ne font rien et renvoient faux : l'interface doit le supporter.

import type { Game } from "../../api/types.ts";

const IN_TAURI = "__TAURI_INTERNALS__" in window;

/** Dans la fenêtre Windows de Playscreen (sinon : navigateur de développement ou démo). */
export const inShell = (): boolean => IN_TAURI;

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

/** « Bureau Windows » : ferme Playscreen. Faux hors de Tauri. */
export async function quitApp(): Promise<boolean> {
  if (!IN_TAURI) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("quit_app");
  return true;
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
export async function startRelay(target: string): Promise<boolean> {
  if (!IN_TAURI) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("start_relay", { target });
}

/** Fin du relais : manette normale, et ménage (Paramètres fermés, launcher réduit). */
export async function endRelay(target: string): Promise<boolean> {
  if (!IN_TAURI) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("end_relay", { target });
}

/**
 * Navigateur : ouvre la vraie page dans une fenêtre plein écran (`window` : Boutique,
 * Social…, une page gardée par fenêtre) et passe la manette en souris (sentinelle).
 * `userAgent` : identité donnée au site (YouTube TV se croit sur une télé).
 */
export async function browserOpen(window: string, url: string, userAgent?: string): Promise<void> {
  if (!IN_TAURI) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("browser_open", { window, url, userAgent: userAgent ?? null });
}

export async function browserHide(): Promise<void> {
  if (!IN_TAURI) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("browser_hide");
}

/** La sentinelle tourne : c'est elle qui lit la manette (toutes les manettes) pour l'interface. */
export async function sentinelRunning(): Promise<boolean> {
  if (!IN_TAURI) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("sentinel_running");
}

/**
 * Ferme une fenêtre web gardée en arrière-plan (Discord, musique) pour libérer la mémoire.
 * Commande Tauri `browser_close` à ajouter (docs/interface-moteur.md) ; sans elle, la
 * fenêtre est seulement cachée.
 */
export async function browserClose(window: string): Promise<void> {
  if (!IN_TAURI) return;
  const { invoke } = await import("@tauri-apps/api/core");
  try {
    await invoke("browser_close", { window });
  } catch {
    await invoke("browser_hide");
  }
}

/** Au-delà, on ne suit plus l'installation (le launcher n'a rien montré ou tout est fini). */
const AWAY_WAIT_MS = 10 * 60_000;

/**
 * Installation, désinstallation : le launcher ouvre des fenêtres (démarrage, confirmation,
 * dossier, place sur le disque). Chaque fois que Playscreen perd le premier plan, la manette
 * devient une souris pour y cliquer ; chaque fois qu'il le reprend, elle redevient une
 * manette et `onBack` est appelé. Le launcher peut passer devant plusieurs fois (Steam :
 * écran de démarrage, puis la fenêtre « Installer »). Renvoie la fonction qui arrête le
 * suivi (téléchargement commencé, installation annulée…).
 */
export function mouseWhileAway(onBack?: () => void): () => void {
  if (!IN_TAURI) return () => undefined;
  let away = false;
  const setMouse = async (on: boolean) => {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("set_mouse_mode", { on });
  };
  const onBlur = () => {
    if (away) return;
    away = true;
    void setMouse(true);
  };
  const onFocus = () => {
    if (!away) return;
    away = false;
    void setMouse(false);
    onBack?.();
  };
  const disarm = () => {
    clearTimeout(timer);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("focus", onFocus);
  };
  const timer = setTimeout(disarm, AWAY_WAIT_MS);
  window.addEventListener("blur", onBlur);
  window.addEventListener("focus", onFocus);
  return disarm;
}
