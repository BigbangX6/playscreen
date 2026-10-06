// Navigateur Playscreen : injecté dans chaque page des fenêtres web. Ne touche pas au site :
// la manette pilote la vraie souris de Windows (mode souris de la sentinelle), ce script
// affiche seulement un gros curseur, visible à la télé, qui suit la souris.
(() => {
  if (window.top !== window || window.__playscreenCursor) return;
  window.__playscreenCursor = true;

  let cursor;
  const ensure = () => {
    if (cursor && cursor.isConnected) return cursor;
    cursor = document.createElement("div");
    cursor.setAttribute("aria-hidden", "true");
    cursor.style.cssText =
      "position:fixed;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;" +
      "border:3px solid #fff;background:rgba(80,140,255,.3);box-shadow:0 0 0 2px rgba(0,0,0,.45),0 4px 14px rgba(0,0,0,.4);" +
      "pointer-events:none;z-index:2147483647;display:none;";
    (document.body || document.documentElement).appendChild(cursor);
    return cursor;
  };

  document.addEventListener(
    "mousemove",
    (event) => {
      const c = ensure();
      c.style.display = "block";
      c.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
    },
    { capture: true, passive: true },
  );
})();
