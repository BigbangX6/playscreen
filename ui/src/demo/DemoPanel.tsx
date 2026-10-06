// Panneau de la version démo (F2, à la souris) : provoquer les situations à concevoir.
// N'existe pas dans la vraie interface.

import { useEffect, useState, useSyncExternalStore } from "react";
import { demoClient, type DemoSettings } from "./demo-engine.ts";
import { demoSystem, type DemoSystemSettings } from "./demo-system.ts";
import { setPrefs } from "../prefs.ts";

function useDemo() {
  return useSyncExternalStore(
    (callback) => demoClient.watch(callback),
    () => `${demoClient.offline}|${demoClient.runningId}|${JSON.stringify(demoClient.settings)}`,
  );
}

function Choice<K extends keyof DemoSettings>(props: { label: string; field: K; options: [DemoSettings[K], string][] }) {
  useDemo();
  const value = demoClient.settings[props.field];
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span style={{ opacity: 0.7 }}>{props.label}</span>
      <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {props.options.map(([option, text]) => (
          <button
            key={text}
            onClick={() => demoClient.set({ [props.field]: option } as Partial<DemoSettings>)}
            style={{ ...button, background: option === value ? "#3d8bff" : "#2a3142" }}
          >
            {text}
          </button>
        ))}
      </span>
    </label>
  );
}

function useDemoSystem() {
  return useSyncExternalStore(
    (callback) => demoSystem.watch(callback),
    () => JSON.stringify(demoSystem.settings),
  );
}

function SystemChoice(props: { label: string; field: keyof DemoSystemSettings; options: [boolean, string][] }) {
  useDemoSystem();
  const value = demoSystem.settings[props.field];
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span style={{ opacity: 0.7 }}>{props.label}</span>
      <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {props.options.map(([option, text]) => (
          <button
            key={text}
            onClick={() => demoSystem.set({ [props.field]: option })}
            style={{ ...button, background: option === value ? "#3d8bff" : "#2a3142" }}
          >
            {text}
          </button>
        ))}
      </span>
    </label>
  );
}

const button = {
  border: "none",
  borderRadius: 6,
  padding: "6px 10px",
  color: "#fff",
  cursor: "pointer",
  font: "inherit",
} as const;

export function DemoPanel() {
  const [open, setOpen] = useState(false);
  useDemo();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const shell = {
    position: "fixed",
    left: 12,
    bottom: 12,
    zIndex: 10000,
    cursor: "auto",
    fontFamily: "system-ui, sans-serif",
    fontSize: 13,
    color: "#fff",
  } as const;

  if (!open) {
    return (
      <button style={{ ...shell, ...button, background: "rgba(42,49,66,0.6)" }} onClick={() => setOpen(true)}>
        Démo (F2)
      </button>
    );
  }

  return (
    <div style={{ ...shell, width: 330, maxHeight: "calc(100vh - 24px)", overflowY: "auto", background: "rgba(14,18,28,0.96)", border: "1px solid #333c50", borderRadius: 10, padding: 14, display: "grid", gap: 12 }}>
      <strong style={{ display: "flex", justifyContent: "space-between" }}>
        Version démo — faux moteur
        <button style={{ ...button, background: "transparent", padding: 0 }} onClick={() => setOpen(false)}>✕</button>
      </strong>
      <Choice label="Avant le téléchargement (le launcher attend une action)" field="installWaitSeconds" options={[[0, "0 s"], [3, "3 s"], [15, "15 s"]]} />
      <Choice label="Launcher au lancement ou à l'installation" field="launcher" options={[["ready", "déjà ouvert"], ["starting", "démarre (6 s)"], ["updating", "se met à jour (15 s)"]]} />
      <Choice label="Durée d'une installation" field="installSeconds" options={[[5, "5 s"], [20, "20 s"], [90, "90 s"]]} />
      <Choice label="Durée d'une partie" field="sessionSeconds" options={[[0, "jusqu'à l'arrêt"], [15, "15 s"], [60, "60 s"]]} />
      <Choice label="Connexion à un store" field="loginSucceeds" options={[[true, "réussit"], [false, "échoue"]]} />
      <Choice label="Bibliothèque" field="emptyLibrary" options={[[false, "37 jeux"], [true, "vide"]]} />
      <SystemChoice label="Appel Discord" field="call" options={[[true, "en cours"], [false, "aucun"]]} />
      <SystemChoice label="Musique" field="music" options={[[true, "en lecture"], [false, "rien"]]} />
      <SystemChoice label="Luminosité de l'écran" field="brightness" options={[[true, "réglable (portable)"], [false, "non (télé)"]]} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button style={{ ...button, background: "#2a3142" }} disabled={!demoClient.runningId} onClick={() => demoClient.stopGame()}>
          Arrêter la partie
        </button>
        <button style={{ ...button, background: "#2a3142" }} disabled={demoClient.offline} onClick={() => demoClient.cutEngine(5)}>
          Couper le moteur 5 s
        </button>
        <button
          style={{ ...button, background: "#2a3142" }}
          onClick={() => {
            setPrefs({ welcomed: false });
            demoClient.blankConsole();
          }}
        >
          Premier démarrage (console vierge)
        </button>
        <button style={{ ...button, background: "#5a2a33" }} onClick={() => {
            demoClient.reset();
            demoSystem.reset();
            setPrefs({ welcomed: true });
          }}>
          Tout réinitialiser
        </button>
      </div>
      <span style={{ opacity: 0.6 }}>
        Clavier : flèches, Entrée (A), Échap (B), X, Y, M (Start), Page préc./suiv. (LB/RB). Une manette marche aussi.
      </span>
    </div>
  );
}
