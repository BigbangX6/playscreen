// Navigateur manette : un seul navigateur, quatre fenêtres (Boutique, Social, Musique,
// Internet), chacune avec ses onglets (LB / RB). Dans la fenêtre Windows de Playscreen, la
// vraie page s'affiche sous la barre (vue web de la coque Tauri, manette gérée dans la page
// par browser-pad.js). Ailleurs (démo, navigateur de développement) : page simulée.

import { useEffect, useRef, useState } from "react";
import { browserHide, browserOpen, inShell, onBrowserCommand } from "../shell.ts";
import { Icon } from "../components/Icons.tsx";
import { PadGlyph, PadHints } from "../components/PadHints.tsx";
import { NAV_EVENT } from "../input/gamepad.ts";
import { useNavAction } from "../input/navigation.ts";
import { SITES, type SiteId } from "./spaces.ts";
import "./console-pages.css";

interface Props {
  site: SiteId;
  /** Onglets de la fenêtre (LB / RB). */
  tabs: SiteId[];
  /** Une fenêtre de l'interface est par-dessus (centre rapide…) : la vraie page se cache. */
  covered?: boolean;
  onSite(site: SiteId): void;
  onBack(): void;
}

/** Blocs de la page simulée : 0 = bandeau, 1 à 3 = rangée du dessous. */
const BLOCKS = 4;

function useClock(): string {
  const format = () => new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const [time, setTime] = useState(format);
  useEffect(() => {
    const timer = setInterval(() => setTime(format()), 10_000);
    return () => clearInterval(timer);
  }, []);
  return time;
}

export function Browser({ site, tabs, covered = false, onSite, onBack }: Props) {
  const info = SITES[site];
  const time = useClock();
  const [block, setBlock] = useState(2);
  const chrome = useRef<HTMLDivElement>(null);
  const real = inShell();

  useEffect(() => setBlock(2), [site]);

  const switchTab = (step: number) => {
    if (tabs.length < 2) return;
    const index = tabs.indexOf(site);
    onSite(tabs[(index + step + tabs.length) % tabs.length]!);
  };

  // Vraie page : ouverte sous la barre, cachée quand on quitte le navigateur ou qu'une
  // fenêtre de l'interface passe par-dessus.
  useEffect(() => {
    if (!real) return;
    if (covered) {
      void browserHide();
      return;
    }
    const top = chrome.current?.getBoundingClientRect().height ?? 0;
    void browserOpen(info.window, info.url, top);
  }, [real, site, covered]);
  useEffect(() => (real ? () => void browserHide() : undefined), [real]);

  // Boutons gérés par la page elle-même mais décidés ici.
  const latest = useRef({ onBack, switchTab });
  latest.current = { onBack, switchTab };
  useEffect(() => {
    if (!real) return;
    // L'abonnement arrive après coup : s'il est déjà annulé, on le coupe dès son arrivée.
    let cancelled = false;
    let stop = () => undefined as void;
    void onBrowserCommand((command) => {
      if (command === "back") latest.current.onBack();
      else if (command === "tab/next") latest.current.switchTab(1);
      else if (command === "tab/previous") latest.current.switchTab(-1);
      // Start : le centre rapide, comme partout.
      else if (command === "menu") window.dispatchEvent(new CustomEvent(NAV_EVENT, { detail: "menu" }));
    }).then((unlisten) => {
      if (cancelled) unlisten();
      else stop = unlisten;
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [real]);

  useNavAction((action) => {
    switch (action) {
      case "menu":
        return false;
      case "back":
        onBack();
        break;
      case "up":
        setBlock(0);
        break;
      case "down":
        if (block === 0) setBlock(2);
        break;
      case "left":
        if (block > 1) setBlock(block - 1);
        break;
      case "right":
        if (block > 0 && block < BLOCKS - 1) setBlock(block + 1);
        break;
      case "previousTab":
      case "nextTab":
        switchTab(action === "nextTab" ? 1 : -1);
        break;
    }
    return true;
  });

  return (
    <div className="browser" role="dialog" aria-modal="true">
      <div className="chrome" ref={chrome}>
        <PadGlyph pad="B" />
        <span className="chrome-site">
          <span className="chrome-ico">
            <Icon name="globe" />
          </span>
          {info.name}
          <small>{info.domain}</small>
        </span>
        {tabs.length > 1 && <span className="chrome-tabs">LB / RB : onglets</span>}
        <span className="chrome-clock">{time}</span>
      </div>
      {!real && <div className="web" key={site}>
        <div className={`web-hero ${block === 0 ? "web-hl" : ""}`} style={{ background: `linear-gradient(110deg, ${info.hero[0]}, ${info.hero[1]})` }}>
          {block === 0 && <div className="cursor" />}
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className={`web-it ${block === i ? "web-hl" : ""}`}>
            {block === i && <div className="cursor" />}
          </div>
        ))}
      </div>}
      <PadHints
        className="web-hints"
        items={[
          ["L", "Curseur"],
          ["R", "Défiler"],
          ["A", "Cliquer"],
          ["Y", "Clavier"],
          ["LT RT", "Zoom"],
        ]}
      />
    </div>
  );
}
