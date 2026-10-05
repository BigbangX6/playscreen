// psc : client en ligne de commande de l'API Playscreen.
// Fonctionne avec le faux moteur comme avec la passerelle Playnite.
//
// Connexion : PLAYSCREEN_URL + PLAYSCREEN_TOKEN, sinon engine.json (voir api/engine-info.ts).

import { ApiError, PlayscreenClient } from "../../api/client.ts";
import { engineInfoPath, readEngineInfo } from "../../api/engine-info.ts";
import { STORE_IDS, type Game, type StoreId } from "../../api/types.ts";

const USAGE = `Usage : psc <commande> [arguments]

  status                 État du moteur
  stores                 Stores et leur état
  games [--installed] [--store <id>]
                         Liste des jeux
  game <id|nom>          Détail d'un jeu
  start <id|nom>         Lance un jeu
  install <id|nom>       Installe un jeu
  uninstall <id|nom>     Désinstalle un jeu
  sync <store>           Synchronise un store (${STORE_IDS.join(", ")})
  login <store> [--alternative]
                         Ouvre la connexion d'un store (--alternative : connexion de
                         secours, par exemple Epic avec un compte lié à Google)
  events                 Affiche les événements en direct (Ctrl+C pour quitter)
`;

function connect(): PlayscreenClient;
function connect(options: { quiet: true }): PlayscreenClient | null;
function connect(options?: { quiet: true }): PlayscreenClient | null {
  if (process.env.PLAYSCREEN_URL && process.env.PLAYSCREEN_TOKEN) {
    return new PlayscreenClient(process.env.PLAYSCREEN_URL, process.env.PLAYSCREEN_TOKEN);
  }
  try {
    const info = readEngineInfo();
    return new PlayscreenClient(`http://127.0.0.1:${info.port}/api/v0`, info.token);
  } catch {
    if (options?.quiet) return null;
    fail(`Moteur introuvable : ${engineInfoPath()} est absent. Le moteur est-il démarré ?`);
  }
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function storeArg(value: string | undefined): StoreId {
  if (!value || !(STORE_IDS as readonly string[]).includes(value)) {
    fail(`Store attendu : ${STORE_IDS.join(", ")}`);
  }
  return value as StoreId;
}

/** Accepte un identifiant exact ou un morceau du nom (insensible à la casse). */
async function resolveGame(client: PlayscreenClient, query: string | undefined): Promise<Game> {
  if (!query) fail("Jeu attendu (identifiant ou nom).");
  const games = await client.games();
  const exact = games.find((g) => g.id === query);
  if (exact) return exact;
  const matches = games.filter((g) => g.name.toLowerCase().includes(query.toLowerCase()));
  if (matches.length === 1) return matches[0]!;
  if (matches.length === 0) fail(`Aucun jeu ne correspond à « ${query} ».`);
  fail(`Plusieurs jeux correspondent :\n${matches.map(formatGame).join("\n")}`);
}

function formatGame(game: Game): string {
  const state = game.installed ? "installé " : "         ";
  const hours = (game.playtimeSeconds / 3600).toFixed(1).padStart(6);
  return `${game.id}  ${game.store.padEnd(9)} ${state} ${hours} h  ${game.name}`;
}

/**
 * Affiche les événements et se reconnecte si le moteur redémarre (Playnite qui passe en
 * plein écran, par exemple). Le jeton change à chaque démarrage : on relit engine.json.
 */
async function watchEvents(client: PlayscreenClient): Promise<never> {
  console.log("Écoute des événements… (Ctrl+C pour quitter)");
  for (;;) {
    try {
      for await (const event of client.events()) {
        console.log(new Date().toLocaleTimeString(), event.type, JSON.stringify(event.data));
      }
      console.log(new Date().toLocaleTimeString(), "Moteur déconnecté, reconnexion…");
    } catch {
      // Moteur arrêté ou en cours de redémarrage : on réessaie.
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
    client = connect({ quiet: true }) ?? client;
  }
}

async function main(argv: string[]) {
  const [command, ...args] = argv;
  if (!command || command === "help" || command === "--help") {
    console.log(USAGE);
    return;
  }
  const client = connect();

  switch (command) {
    case "status":
      console.log(await client.status());
      break;
    case "stores":
      console.table(await client.stores());
      break;
    case "games": {
      const storeIndex = args.indexOf("--store");
      const games = await client.games({
        installed: args.includes("--installed") ? true : undefined,
        store: storeIndex >= 0 ? storeArg(args[storeIndex + 1]) : undefined,
      });
      for (const game of games) console.log(formatGame(game));
      console.log(`${games.length} jeu(x)`);
      break;
    }
    case "game":
      console.log(await resolveGame(client, args[0]));
      break;
    case "start":
    case "install":
    case "uninstall": {
      const game = await resolveGame(client, args.join(" "));
      await client[command](game.id);
      console.log(`${command} demandé : ${game.name}`);
      break;
    }
    case "sync":
      await client.sync(storeArg(args[0]));
      console.log("Synchronisation lancée (suivre avec : psc events)");
      break;
    case "login": {
      const storeId = storeArg(args[0]);
      // On écoute avant de demander la connexion pour ne pas rater la fin.
      const controller = new AbortController();
      const stream = client.events(controller.signal);
      const first = stream.next();
      await client.login(storeId, { alternative: args.includes("--alternative") });
      console.log("Fenêtre de connexion ouverte. Connectez-vous, puis fermez-la si besoin…");
      for (let result = await first; !result.done; result = await stream.next()) {
        const event = result.value;
        if (event.type === "store.updated" && event.data.id === storeId) {
          console.log(event.data.connected ? "Connecté." : `Non connecté (connected: ${event.data.connected}).`);
          break;
        }
      }
      controller.abort();
      break;
    }
    case "events":
      await watchEvents(client);
      break;
    default:
      fail(`Commande inconnue : ${command}\n\n${USAGE}`);
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  if (error instanceof ApiError) fail(error.message);
  if (error instanceof TypeError && String(error.cause ?? "").includes("ECONNREFUSED")) {
    fail("Connexion refusée : le moteur ne répond pas.");
  }
  throw error;
});
