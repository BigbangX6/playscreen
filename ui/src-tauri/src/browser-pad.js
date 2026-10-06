// Navigateur manette de Playscreen : injecté dans chaque page des fenêtres web (Boutique,
// Social, Musique, Internet). Lit la manette (API Gamepad de la page, qui a le focus) et la
// traduit en curseur aimanté, clic, défilement, zoom. Ce que la page ne peut pas faire seule
// (revenir à Playscreen, onglets, clavier, zoom) passe par une fausse navigation
// « playscreen://… », interceptée et annulée par Playscreen (browser.rs).
(() => {
  if (window.top !== window || window.__playscreenPad) return;
  window.__playscreenPad = true;

  const DEADZONE = 0.2;
  const SPEED = 1500; // pixels CSS par seconde, stick au bord
  const SCROLL = 1600;
  const MAGNET = 70; // distance d'aimantation au relâchement du stick
  const CLICKABLE = 'a[href], button, input, textarea, select, summary, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"], [role="checkbox"], [onclick], [tabindex]:not([tabindex="-1"]), [contenteditable="true"], label';

  const send = (command) => {
    // Navigation annulée par Playscreen : rien ne change dans la page.
    window.location.href = `playscreen://${command}`;
  };

  let cursor;
  let x = window.innerWidth / 2;
  let y = window.innerHeight / 2;
  const ensureCursor = () => {
    if (cursor && cursor.isConnected) return cursor;
    cursor = document.createElement("div");
    cursor.setAttribute("aria-hidden", "true");
    cursor.style.cssText =
      "position:fixed;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;" +
      "border:3px solid #fff;background:rgba(80,140,255,.35);box-shadow:0 0 0 2px rgba(0,0,0,.45),0 4px 14px rgba(0,0,0,.4);" +
      "pointer-events:none;z-index:2147483647;transition:width .12s,height .12s,margin .12s;";
    (document.body || document.documentElement).appendChild(cursor);
    return cursor;
  };
  const draw = (over) => {
    const c = ensureCursor();
    c.style.transform = `translate(${x}px, ${y}px)`;
    const size = over ? 46 : 34;
    c.style.width = c.style.height = `${size}px`;
    c.style.margin = `${-size / 2}px 0 0 ${-size / 2}px`;
  };

  const clickableAt = (px, py) => {
    const element = document.elementFromPoint(px, py);
    return element ? element.closest(CLICKABLE) : null;
  };

  const visibleClickables = () =>
    [...document.querySelectorAll(CLICKABLE)].filter((element) => {
      const r = element.getBoundingClientRect();
      return r.width > 4 && r.height > 4 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
    });

  const center = (element) => {
    const r = element.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  /** Croix directionnelle : saute au bloc cliquable suivant dans cette direction. */
  const jump = (dx, dy) => {
    let best = null;
    let bestScore = Infinity;
    for (const element of visibleClickables()) {
      const c = center(element);
      const ahead = (c.x - x) * dx + (c.y - y) * dy;
      if (ahead <= 8) continue;
      const side = Math.abs((c.x - x) * dy) + Math.abs((c.y - y) * dx);
      const score = ahead + side * 2.5;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best) {
      x = best.x;
      y = best.y;
    } else {
      // Rien de visible dans cette direction : on fait défiler la page.
      if (dy) scrollAt(0, dy * innerHeight * 0.6);
    }
  };

  /** Aimant : au relâchement, le curseur se pose sur le bloc cliquable le plus proche. */
  const magnet = () => {
    let best = null;
    let bestDistance = MAGNET;
    for (const element of visibleClickables()) {
      const r = element.getBoundingClientRect();
      const nx = Math.max(r.left, Math.min(x, r.right));
      const ny = Math.max(r.top, Math.min(y, r.bottom));
      const distance = Math.hypot(nx - x, ny - y);
      if (distance === 0) return;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = element;
      }
    }
    if (best) {
      const c = center(best);
      x = c.x;
      y = c.y;
    }
  };

  /** Fait défiler l'élément sous le curseur s'il défile, sinon la page. */
  const scrollAt = (dx, dy) => {
    let element = document.elementFromPoint(x, y);
    while (element && element !== document.body && element !== document.documentElement) {
      const style = getComputedStyle(element);
      const canY = /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight;
      const canX = /(auto|scroll)/.test(style.overflowX) && element.scrollWidth > element.clientWidth;
      if ((dy && canY) || (dx && canX)) {
        element.scrollBy(dx, dy);
        return;
      }
      element = element.parentElement;
    }
    window.scrollBy(dx, dy);
  };

  const isTextField = (element) =>
    element &&
    ((element.tagName === "INPUT" && !["button", "checkbox", "radio", "submit", "reset", "range", "file", "image"].includes(element.type)) ||
      element.tagName === "TEXTAREA" ||
      element.isContentEditable);

  const click = () => {
    const target = document.elementFromPoint(x, y);
    if (!target) return;
    const options = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 };
    for (const type of ["pointerover", "pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      const Event = type.startsWith("pointer") ? PointerEvent : MouseEvent;
      target.dispatchEvent(new Event(type, { ...options, pointerType: "mouse", isPrimary: true }));
    }
    const field = target.closest("input, textarea, [contenteditable='true']") || target;
    if (isTextField(field)) {
      field.focus();
      send("keyboard/show");
    } else if (typeof target.focus === "function") {
      target.focus({ preventScroll: true });
    }
  };

  // Boutons au format « standard » de l'API Gamepad.
  const A = 0, B = 1, X = 2, Y = 3, LB = 4, RB = 5, LT = 6, RT = 7, START = 9;
  const UP = 12, DOWN = 13, LEFT = 14, RIGHT = 15;
  let previous = [];
  let last = performance.now();
  let moving = false;
  let zoomHeld = 0;

  const axis = (v) => {
    const m = Math.abs(v);
    return m < DEADZONE ? 0 : Math.sign(v) * Math.pow((m - DEADZONE) / (1 - DEADZONE), 2);
  };

  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const pad = [...navigator.getGamepads()].find(Boolean);
    if (pad && document.hasFocus()) {
      const pressed = pad.buttons.map((b) => b.pressed);
      const down = (i) => pressed[i] && !previous[i];

      const sx = axis(pad.axes[0] || 0);
      const sy = axis(pad.axes[1] || 0);
      if (sx || sy) {
        // Ralentit au-dessus d'un bloc cliquable : plus facile de s'y arrêter.
        const slow = clickableAt(x, y) ? 0.7 : 1;
        x = Math.max(0, Math.min(innerWidth - 1, x + sx * SPEED * slow * dt));
        y = Math.max(0, Math.min(innerHeight - 1, y + sy * SPEED * slow * dt));
        moving = true;
      } else if (moving) {
        moving = false;
        magnet();
      }

      const rx = axis(pad.axes[2] || 0);
      const ry = axis(pad.axes[3] || 0);
      if (rx || ry) scrollAt(rx * SCROLL * dt, ry * SCROLL * dt);

      if (down(UP)) jump(0, -1);
      if (down(DOWN)) jump(0, 1);
      if (down(LEFT)) jump(-1, 0);
      if (down(RIGHT)) jump(1, 0);
      if (down(A)) click();
      if (down(B)) send("back");
      if (down(Y)) send("keyboard/toggle");
      if (down(X)) history.back();
      if (down(LB)) send("tab/previous");
      if (down(RB)) send("tab/next");
      if (down(START)) send("menu");
      // Gâchettes : zoom, par crans (maintenir pour continuer).
      const zoom = (pad.buttons[RT]?.value > 0.5 ? 1 : 0) - (pad.buttons[LT]?.value > 0.5 ? 1 : 0);
      if (zoom && now - zoomHeld > 250) {
        zoomHeld = now;
        send(zoom > 0 ? "zoom/in" : "zoom/out");
      }
      if (!zoom) zoomHeld = 0;

      previous = pressed;
      draw(Boolean(clickableAt(x, y)));
    }
    requestAnimationFrame(loop);
  };

  const start = () => {
    draw(false);
    requestAnimationFrame(loop);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
