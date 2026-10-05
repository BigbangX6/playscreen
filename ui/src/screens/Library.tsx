// Bibliothèque — MAQUETTE TECHNIQUE : prouve la chaîne complète (moteur, images, manette,
// lancement, installation, événements). À remplacer par l'écran du design.

import { useEffect, useState } from "react";
import type { PlayscreenClient } from "../../../api/client.ts";
import type { EngineEvent, Game } from "../../../api/types.ts";

interface Props {
  client: PlayscreenClient;
  lastEvent: EngineEvent | null;
}

export function Library({ client, lastEvent }: Props) {
  const [games, setGames] = useState<Game[]>([]);

  // Charge la liste au démarrage, puis la recharge quand la bibliothèque change.
  useEffect(() => {
    void client.games().then(setGames);
  }, [client]);
  useEffect(() => {
    if (lastEvent && ["library.updated", "game.installed", "game.uninstalled"].includes(lastEvent.type)) {
      void client.games().then(setGames);
    }
  }, [client, lastEvent]);

  // Le focus part de la première tuile.
  useEffect(() => {
    if (!document.activeElement || document.activeElement === document.body) {
      document.querySelector<HTMLElement>("[data-focusable]")?.focus();
    }
  }, [games]);

  const onSelect = (game: Game) => {
    void (game.installed ? client.start(game.id) : client.install(game.id));
  };

  return (
    <main style={{ padding: "calc(var(--unit) * 4)", height: "100%", display: "flex", flexDirection: "column" }}>
      <h1 style={{ margin: 0 }}>Bibliothèque</h1>
      <p style={{ color: "var(--text-muted)" }}>
        {games.length} jeux · A : lancer ou installer · maquette technique
      </p>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(calc(var(--unit) * 20), 1fr))",
          gridAutoRows: "max-content",
          gap: "calc(var(--unit) * 2)",
          padding: "calc(var(--unit) * 1)",
          alignContent: "start",
        }}
      >
        {games.map((game) => (
          <button
            key={game.id}
            data-focusable
            onClick={() => onSelect(game)}
            style={{
              background: "var(--surface)",
              color: "var(--text)",
              border: "none",
              borderRadius: "var(--radius)",
              padding: 0,
              textAlign: "left",
              overflow: "hidden",
              opacity: game.installed ? 1 : 0.6,
            }}
          >
            <div style={{ position: "relative", width: "100%", aspectRatio: "2 / 3", display: "grid", placeItems: "center", padding: "var(--unit)" }}>
              {game.media?.cover ? (
                <img src={client.mediaUrl(game.id, "cover")} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                game.name
              )}
            </div>
            <div style={{ padding: "var(--unit)", fontSize: "calc(var(--unit) * 1.6)" }}>
              {game.name}
              <div style={{ color: "var(--text-muted)" }}>{game.store}{game.installed ? "" : " · non installé"}</div>
            </div>
          </button>
        ))}
      </div>
      <footer style={{ color: "var(--text-muted)", minHeight: "calc(var(--unit) * 3)" }}>
        {lastEvent ? `${lastEvent.type} ${JSON.stringify(lastEvent.data)}` : "En attente d'événements…"}
      </footer>
    </main>
  );
}
