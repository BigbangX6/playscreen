// Lecture de la manette (API Gamepad du navigateur, D4) et du clavier (développement),
// traduits en actions de navigation Playscreen.

/** Actions de navigation : les écrans ne voient jamais les boutons bruts. */
export type NavAction =
  | "up"
  | "down"
  | "left"
  | "right"
  | "confirm" // A (Xbox) / Croix (PlayStation)
  | "back" // B / Rond
  | "options" // X / Carré : actions secondaires sur l'élément (détails, désinstaller…)
  | "search" // Y / Triangle
  | "menu" // Start / Options
  | "previousTab" // LB / L1
  | "nextTab"; // RB / R1

/** Disposition « standard » de l'API Gamepad (Xbox, DualSense, Switch Pro via le navigateur). */
const BUTTONS: Partial<Record<number, NavAction>> = {
  0: "confirm",
  1: "back",
  2: "options",
  3: "search",
  4: "previousTab",
  5: "nextTab",
  9: "menu",
  12: "up",
  13: "down",
  14: "left",
  15: "right",
};

const KEYS: Record<string, NavAction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Enter: "confirm",
  Escape: "back",
  Backspace: "back",
  KeyX: "options",
  KeyY: "search",
  KeyM: "menu",
  PageUp: "previousTab",
  PageDown: "nextTab",
};

const KEYS_BY_NAME: Record<string, NavAction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Enter: "confirm",
  Escape: "back",
  Backspace: "back",
  x: "options",
  y: "search",
  m: "menu",
  PageUp: "previousTab",
  PageDown: "nextTab",
};

const DIRECTIONS = new Set<NavAction>(["up", "down", "left", "right"]);
const STICK_THRESHOLD = 0.5;
/** Maintenir une direction : premier pas, puis répétition (défilement d'une liste). */
const REPEAT_DELAY_MS = 400;
const REPEAT_INTERVAL_MS = 120;

export const NAV_EVENT = "playscreen:nav";

function emit(action: NavAction) {
  window.dispatchEvent(new CustomEvent<NavAction>(NAV_EVENT, { detail: action }));
}

/** Démarre la lecture ; renvoie la fonction d'arrêt. */
export function startInput(): () => void {
  const held = new Map<NavAction, { since: number; last: number }>();
  let frame = 0;

  const poll = (now: number) => {
    const pressed = new Set<NavAction>();
    for (const pad of navigator.getGamepads()) {
      if (!pad) continue;
      pad.buttons.forEach((button, index) => {
        const action = BUTTONS[index];
        if (action && button.pressed) pressed.add(action);
      });
      const [x = 0, y = 0] = pad.axes;
      if (x < -STICK_THRESHOLD) pressed.add("left");
      if (x > STICK_THRESHOLD) pressed.add("right");
      if (y < -STICK_THRESHOLD) pressed.add("up");
      if (y > STICK_THRESHOLD) pressed.add("down");
    }

    for (const action of pressed) {
      const state = held.get(action);
      if (!state) {
        held.set(action, { since: now, last: now });
        emit(action);
      } else if (DIRECTIONS.has(action) && now - state.since > REPEAT_DELAY_MS && now - state.last > REPEAT_INTERVAL_MS) {
        state.last = now;
        emit(action);
      }
    }
    for (const action of held.keys()) if (!pressed.has(action)) held.delete(action);
    frame = requestAnimationFrame(poll);
  };

  const onKey = (event: KeyboardEvent) => {
    // Par position (event.code), sinon par nom (event.key) : les touches simulées par un
    // autre logiciel (tests, claviers virtuels) n'ont pas toujours de position.
    const action = KEYS[event.code] ?? KEYS_BY_NAME[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (!action) return;
    event.preventDefault();
    emit(action);
  };

  frame = requestAnimationFrame(poll);
  window.addEventListener("keydown", onKey);
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("keydown", onKey);
  };
}
