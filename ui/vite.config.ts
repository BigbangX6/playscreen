// Vite : sert l'interface en développement (http://localhost:5173) et la construit pour Tauri.

import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
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

/**
 * Version démo : tout dans un seul index.html (scripts et styles en ligne), pour la publier
 * comme une page et la tester dans n'importe quel navigateur, sans serveur.
 */
function singleFile(): Plugin {
  let outDir = "";
  return {
    name: "playscreen-single-file",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    // Une fois tout écrit sur le disque : Vite a fini de transformer le code.
    closeBundle() {
      const htmlPath = join(outDir, "index.html");
      let page = readFileSync(htmlPath, "utf8");
      page = page.replace(/<script[^>]*src="\.?\/?([^"]+\.js)"[^>]*><\/script>/g, (_tag, file: string) => {
        // « <script », « </script » ou « <!-- » dans le code (il y en a dans React) changent
        // la façon dont le navigateur lit la balise : on écrit leur « < » \x3C, qui donne
        // le même caractère dans une chaîne comme dans une expression régulière.
        const code = readFileSync(join(outDir, file), "utf8").replace(/<(?=!--|\/?script)/gi, "\\x3C");
        return `<script type="module">${code}</script>`;
      });
      page = page.replace(/<link[^>]*href="\.?\/?([^"]+\.css)"[^>]*>/g, (_tag, file: string) =>
        `<style>${readFileSync(join(outDir, file), "utf8")}</style>`,
      );
      writeFileSync(htmlPath, page);
      // artifact.html : la même page sans son enveloppe (doctype, html, head, body), que
      // la publication en page Claude (« artifact ») ajoute elle-même.
      const bare = page
        .replace(/<!doctype[^>]*>/i, "")
        .replace(/<\/?(html|head|body)[^>]*>/gi, "")
        .replace(/<meta[^>]*>/gi, "");
      writeFileSync(join(outDir, "artifact.html"), bare.trim() + "\n");
      rmSync(join(outDir, "assets"), { recursive: true, force: true });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), engineInfo(), ...(mode === "demo" ? [singleFile()] : [])],
  // Le port 5173 fait partie des origines autorisées par l'API (ALLOWED_ORIGINS).
  server: { port: 5173, strictPort: true, fs: { allow: [".."] } },
  // Tauri ne change pas d'origine entre le développement et la version construite.
  clearScreen: false,
  build:
    mode === "demo"
      ? // Un seul fichier JavaScript (pas de morceaux chargés à part) pour tout mettre en ligne.
        { outDir: "dist-demo", target: "es2022", assetsInlineLimit: Infinity, rollupOptions: { output: { inlineDynamicImports: true } } }
      : { outDir: "dist", target: "es2022" },
}));
