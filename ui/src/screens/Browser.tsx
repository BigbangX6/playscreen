// Navigateur manette : un seul navigateur, quatre fenêtres (Boutique, Social, Musique,
// Internet), chacune avec ses onglets (LB / RB). La démo ne peut pas afficher les vrais
// sites : la page est simulée, le curseur aimanté passe d'un bloc à l'autre.

import { useEffect, useState } from "react";
import { Icon } from "../components/Icons.tsx";
import { PadGlyph, PadHints } from "../components/PadHints.tsx";
import { useNavAction } from "../input/navigation.ts";
import { SITES, type SiteId } from "./spaces.ts";
import "./console-pages.css";

interface Props {
  site: SiteId;
  /** Onglets de la fenêtre (LB / RB). */
  tabs: SiteId[];
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

export function Browser({ site, tabs, onSite, onBack }: Props) {
  const info = SITES[site];
  const time = useClock();
  const [block, setBlock] = useState(2);

  useEffect(() => setBlock(2), [site]);

  useNavAction((action) => {
    switch (action) {
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
      case "nextTab": {
        if (tabs.length < 2) break;
        const index = tabs.indexOf(site);
        onSite(tabs[(index + (action === "nextTab" ? 1 : -1) + tabs.length) % tabs.length]!);
        break;
      }
    }
    return true;
  });

  return (
    <div className="browser" role="dialog" aria-modal="true">
      <div className="chrome">
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
      <div className="web" key={site}>
        <div className={`web-hero ${block === 0 ? "web-hl" : ""}`} style={{ background: `linear-gradient(110deg, ${info.hero[0]}, ${info.hero[1]})` }}>
          {block === 0 && <div className="cursor" />}
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className={`web-it ${block === i ? "web-hl" : ""}`}>
            {block === i && <div className="cursor" />}
          </div>
        ))}
      </div>
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
