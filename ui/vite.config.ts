// Vite : sert l'interface en développement (http://localhost:5173) et la construit pour Tauri.

import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { engineInfoPath } from "../api/engine-info.ts";

/**
 * En développement dans un navigateur, l'interface lit /engine.json (port + jeton du
 * moteur démarré : faux moteur ou passerelle). Dans Tauri, c'est la commande engine_info.
 */
function engineInfo(): Plugin {
  return {
    name: "playscreen-engine-info",
    configureServer(server) {
      server.middlewares.use("/engine.json", (_req, res) => {
        try {
          res.setHeader("Content-Type", "application/json");
          res.end(readFileSync(engineInfoPath(), "utf8"));
        } catch {
          res.statusCode = 503;
          res.end(JSON.stringify({ error: "moteur introuvable : lancer npm run mock" }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), engineInfo()],
  // Le port 5173 fait partie des origines autorisées par l'API (ALLOWED_ORIGINS).
  server: { port: 5173, strictPort: true, fs: { allow: [".."] } },
  // Tauri ne change pas d'origine entre le développement et la version construite.
  clearScreen: false,
  build: { outDir: "dist", target: "es2022" },
});
