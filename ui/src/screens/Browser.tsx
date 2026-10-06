// Navigateur manette : un seul navigateur, quatre fenêtres (Boutique, Social, Musique,
// Internet), chacune avec ses onglets (LB / RB). Dans la fenêtre Windows de Playscreen, la
// vraie page s'affiche en plein écran (fenêtre de la coque Tauri) et la manette pilote la vraie
// souris (sentinelle) ; Select + Y revient. Ailleurs (démo, navigateur de développement) :
// page simulée.

import { useEffect, useRef, useState } from "react";
import { browserHide, browserOpen, inShell } from "../shell.ts";
import { Icon } from "../components/Icons.tsx";
import { PadGlyph, PadHints } from "../components/PadHints.tsx";
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

  // Vraie page : en plein écran, manette en souris (sentinelle). Le méta-raccourci (Select + Y)
  // ramène Playscreen au premier plan : on revient alors en arrière, page cachée mais gardée.
  const latest = useRef(onBack);
  latest.current = onBack;
  useEffect(() => {
    if (!real) return;
    if (covered) {
      void browserHide();
      return;
    }
    void browserOpen(info.userAgent ? site : info.window, info.url, info.userAgent);
    let away = false;
    const onBlur = () => (away = true);
    const onFocus = () => {
      if (!away) return;
      away = false;
      void browserHide();
      latest.current();
    };
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, [real, site, covered]);
  useEffect(() => (real ? () => void browserHide() : undefined), [real]);

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
