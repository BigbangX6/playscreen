// Barre du haut : titre de l'écran, jeu en cours, heure et batterie (consoles portables).

import { useEffect, useState } from "react";

interface Battery {
  level: number;
  charging: boolean;
}

/** Batterie via l'API du navigateur (WebView2 / Chromium) ; null sur un PC sans batterie. */
export function useBattery(): Battery | null {
  const [battery, setBattery] = useState<Battery | null>(null);
  useEffect(() => {
    type Manager = EventTarget & { level: number; charging: boolean };
    const getBattery = (navigator as Navigator & { getBattery?: () => Promise<Manager> }).getBattery;
    if (!getBattery) return;
    let manager: Manager | null = null;
    const update = () => {
      if (!manager) return;
      // Un PC de bureau répond « 100 %, en charge » : on n'affiche rien dans ce cas.
      setBattery(manager.charging && manager.level >= 1 ? null : { level: manager.level, charging: manager.charging });
    };
    void getBattery.call(navigator).then((m) => {
      manager = m;
      update();
      m.addEventListener("levelchange", update);
      m.addEventListener("chargingchange", update);
    });
    return () => {
      manager?.removeEventListener("levelchange", update);
      manager?.removeEventListener("chargingchange", update);
    };
  }, []);
  return battery;
}

function useClock(): string {
  const format = () => new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const [time, setTime] = useState(format);
  useEffect(() => {
    const timer = setInterval(() => setTime(format()), 10_000);
    return () => clearInterval(timer);
  }, []);
  return time;
}

export function BatteryIndicator({ battery }: { battery: Battery }) {
  const percent = Math.round(battery.level * 100);
  return (
    <span className={`battery ${percent <= 15 && !battery.charging ? "battery-low" : ""}`}>
      <span className="battery-shell">
        <span className="battery-level" style={{ width: `${percent}%` }} />
      </span>
      {percent} %{battery.charging ? " ⚡" : ""}
    </span>
  );
}

interface Props {
  title: string;
  /** Nom du jeu en cours, s'il y en a un. */
  running?: string | null;
}

export function TopBar({ title, running }: Props) {
  const time = useClock();
  const battery = useBattery();
  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="brand">
          <span className="brand-mark">▶</span>Playscreen
        </span>
        <span className="topbar-title">{title}</span>
      </div>
      <div className="topbar-right">
        {running && <span className="running-pill">● En cours : {running}</span>}
        {battery && <BatteryIndicator battery={battery} />}
        <span className="clock">{time}</span>
      </div>
    </header>
  );
}
