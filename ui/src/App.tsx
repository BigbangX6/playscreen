// Racine de l'interface : connexion au moteur, puis l'écran courant.
// Maquette technique : les écrans définitifs viennent du design (docs/interface.md).

import { useState } from "react";
import type { EngineEvent } from "../../api/types.ts";
import { useEngine } from "./engine.ts";
import { Library } from "./screens/Library.tsx";

export function App() {
  const [lastEvent, setLastEvent] = useState<EngineEvent | null>(null);
  const engine = useEngine(setLastEvent);

  if (engine.status !== "ready") {
    return (
      <main style={{ padding: "calc(var(--unit) * 4)" }}>
        <h1>Playscreen</h1>
        <p style={{ color: "var(--text-muted)" }}>
          {engine.status === "connecting" ? "Connexion au moteur…" : "Le moteur ne répond pas, nouvel essai…"}
        </p>
      </main>
    );
  }
  return <Library client={engine.client} lastEvent={lastEvent} />;
}
