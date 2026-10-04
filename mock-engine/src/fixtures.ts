// Fausse bibliothèque : cas réalistes et cas limites (titres longs, médias absents, etc.).

import type { Game, Store } from "../../api/types.ts";

export function fixtureStores(): Store[] {
  return [
    { id: "steam", name: "Steam", pluginInstalled: true, launcherInstalled: true, connected: true, gameCount: 0 },
    { id: "epic", name: "Epic Games", pluginInstalled: true, launcherInstalled: true, connected: false, gameCount: 0 },
    { id: "xbox", name: "Xbox / Game Pass", pluginInstalled: true, launcherInstalled: true, connected: null, gameCount: 0 },
    { id: "battlenet", name: "Battle.net", pluginInstalled: true, launcherInstalled: false, connected: false, gameCount: 0 },
  ];
}

const GB = 1024 ** 3;

export function fixtureGames(): Game[] {
  const games: Game[] = [
    game("00000000-0000-4000-8000-000000000001", "Hades II", "steam", "1145350", true, 12 * GB, 41 * 3600),
    game("00000000-0000-4000-8000-000000000002", "Baldur's Gate 3", "steam", "1086940", false, 150 * GB, 112 * 3600),
    game("00000000-0000-4000-8000-000000000003", "Celeste", "steam", "504230", true, 1 * GB, 9 * 3600),
    game("00000000-0000-4000-8000-000000000004", "Alan Wake 2", "epic", "dc9d2e595d0e4650b35d659f90d41059", false, 90 * GB, 0),
    game("00000000-0000-4000-8000-000000000005", "Fortnite", "epic", "Fortnite", true, 30 * GB, 3 * 3600),
    game("00000000-0000-4000-8000-000000000006", "Forza Horizon 5", "xbox", "Microsoft.624F8B84B80_8wekyb3d8bbwe", true, 110 * GB, 20 * 3600),
    game("00000000-0000-4000-8000-000000000007", "Diablo IV", "battlenet", "Fen", false, 90 * GB, 0),
    game(
      "00000000-0000-4000-8000-000000000008",
      "Un jeu au titre volontairement très très long pour tester la mise en page : Édition Définitive",
      "steam",
      "999999",
      false,
      null,
      0,
    ),
  ];
  // Un jeu sans aucun média, pour tester les images de remplacement.
  games[7]!.media = { cover: false, background: false, icon: false };
  return games;
}

function game(
  id: string,
  name: string,
  store: Game["store"],
  storeGameId: string,
  installed: boolean,
  installSizeBytes: number | null,
  playtimeSeconds: number,
): Game {
  return {
    id,
    name,
    store,
    storeGameId,
    installed,
    installDirectory: installed ? `C:\\Games\\${name.replace(/[^\w ]/g, "")}` : null,
    installSizeBytes,
    playtimeSeconds,
    lastPlayed: playtimeSeconds > 0 ? "2026-09-30T20:15:00Z" : null,
    added: "2026-09-01T10:00:00Z",
    media: { cover: true, background: true, icon: true },
  };
}
