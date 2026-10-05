// Connexion au moteur (faux moteur ou passerelle Playnite) et état partagé par les écrans.

import { useEffect, useRef, useState } from "react";
import { PlayscreenClient, type EngineClient } from "../../api/client.ts";
import type { EngineEvent, EngineInfo } from "../../api/types.ts";

/**
 * Version démo (`npm run dev:demo`, `npm run build:demo`) : faux moteur dans la page,
 * sans serveur (voir src/demo/). Sinon : le vrai moteur (passerelle ou faux moteur Node).
 */
export const DEMO = import.meta.env.MODE === "demo";

async function connect(): Promise<EngineClient> {
  if (DEMO) {
    const { demoClient } = await import("./demo/demo-engine.ts");
    return demoClient;
  }
  const info = await loadEngineInfo();
  return new PlayscreenClient(`http://127.0.0.1:${info.port}/api/v0`, info.token);
}

/** Dans Tauri : commande engine_info (Rust lit engine.json). Dans un navigateur : Vite sert /engine.json. */
async function loadEngineInfo(): Promise<EngineInfo> {
  if ("__TAURI_INTERNALS__" in window) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<EngineInfo>("engine_info");
  }
  const response = await fetch("/engine.json");
  if (!response.ok) throw new Error("moteur introuvable");
  return (await response.json()) as EngineInfo;
}

export type EngineState =
  | { status: "connecting" }
  | { status: "ready"; client: EngineClient }
  | { status: "offline"; error: string };

/**
 * Se connecte au moteur et se reconnecte s'il redémarre (son jeton change à chaque
 * démarrage : on relit engine.json). `onEvent` reçoit les événements en direct.
 */
export function useEngine(onEvent?: (event: EngineEvent) => void): EngineState {
  const [state, setState] = useState<EngineState>({ status: "connecting" });
  // Toujours le gestionnaire le plus récent, sans relancer la connexion.
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    let stopped = false;
    const controller = new AbortController();

    async function run() {
      while (!stopped) {
        try {
          const client = await connect();
          await client.status();
          setState({ status: "ready", client });
          for await (const event of client.events(controller.signal)) handler.current?.(event);
        } catch (error) {
          if (stopped) return;
          setState({ status: "offline", error: String(error) });
        }
        await new Promise((resolve) => setTimeout(resolve, DEMO ? 1000 : 2000));
      }
    }

    void run();
    return () => {
      stopped = true;
      controller.abort();
    };
  }, []);

  return state;
}
