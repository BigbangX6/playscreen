// Bibliothèque de démonstration : une quarantaine de jeux répartis sur les 4 stores, avec
// des cas limites (pas d'image, titre très long, jamais joué, énorme, minuscule).

import type { Game, Store } from "../../../api/types.ts";

type Row = [
  name: string,
  store: Game["store"],
  installed: boolean,
  sizeGb: number | null,
  playtimeHours: number,
  lastPlayedDaysAgo: number | null,
  media: "all" | "cover" | "none",
];

const ROWS: Row[] = [
  ["Hades II", "steam", true, 12, 41, 1, "all"],
  ["Baldur's Gate 3", "steam", false, 150, 112, 40, "all"],
  ["Celeste", "steam", true, 1.2, 9, 3, "all"],
  ["Stardew Valley", "steam", true, 0.5, 210, 2, "all"],
  ["Elden Ring", "steam", false, 60, 87, 120, "all"],
  ["Hollow Knight", "steam", true, 9, 33, 15, "all"],
  ["Cyberpunk 2077", "steam", false, 70, 54, 200, "all"],
  ["Portal 2", "steam", true, 12, 15, 400, "all"],
  ["Among Us", "steam", true, 1.1, 292, 6, "all"],
  ["Garry's Mod", "steam", false, 7.3, 4.3, null, "all"],
  ["Counter-Strike 2", "steam", true, 35, 130, 0, "all"],
  ["Dave the Diver", "steam", false, 11, 0, null, "cover"],
  ["Balatro", "steam", true, 0.2, 61, 0, "all"],
  ["Vampire Survivors", "steam", true, 0.6, 22, 30, "all"],
  ["Sea of Stars", "steam", false, 5, 0, null, "none"],
  ["Lethal Company", "steam", false, 1, 7, 90, "cover"],
  ["Deep Rock Galactic", "steam", true, 3.5, 48, 12, "all"],
  ["It Takes Two", "steam", false, 50, 18, 300, "all"],
  ["Un jeu au titre volontairement très très long pour tester la mise en page : Édition Définitive", "steam", false, null, 0, null, "none"],
  ["Fortnite", "epic", true, 30, 3, 5, "all"],
  ["Rocket League", "epic", false, 25, 14.6, 60, "all"],
  ["Fall Guys", "epic", true, 7.4, 52.7, 8, "all"],
  ["Alan Wake 2", "epic", false, 90, 0, null, "all"],
  ["Hogwarts Legacy", "epic", false, 85, 0, null, "cover"],
  ["Unrailed", "epic", true, 0.9, 0, null, "none"],
  ["Death Stranding", "epic", false, 80, 26, 500, "all"],
  ["Forza Horizon 5", "xbox", true, 110, 20, 25, "all"],
  ["Halo Infinite", "xbox", false, 48, 9, 150, "all"],
  ["Microsoft Solitaire Collection", "xbox", true, 0.4, 0.1, 700, "cover"],
  ["Sea of Thieves", "xbox", false, 80, 31, 45, "all"],
  ["Starfield", "xbox", false, 125, 0, null, "all"],
  ["Diablo IV", "battlenet", false, 90, 0, null, "all"],
  ["Overwatch 2", "battlenet", true, 45, 66, 4, "all"],
  ["Warcraft Rumble", "battlenet", true, 6.3, 0, null, "cover"],
  ["World of Warcraft", "battlenet", false, 100, 380, 900, "all"],
  ["Hearthstone", "battlenet", false, 6, 120, 1000, "none"],
  ["Notepad", "other", true, null, 0, null, "none"],
];

const GB = 1024 ** 3;
const DAY = 86_400_000;

function id(index: number): string {
  return `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}

export function demoGames(now = Date.now()): Game[] {
  return ROWS.map(([name, store, installed, sizeGb, hours, days, media], index) => ({
    id: id(index),
    name,
    sortingName: name.replace(/^(The|Les?|La) /i, ""),
    store,
    storeGameId: `${store}-${index}`,
    installed,
    installDirectory: installed ? `C:\\Games\\${name.replace(/[^\w ]/g, "")}` : null,
    installSizeBytes: sizeGb === null ? null : Math.round(sizeGb * GB),
    playtimeSeconds: Math.round(hours * 3600),
    lastPlayed: days === null ? null : new Date(now - days * DAY).toISOString(),
    added: new Date(now - (index * 7 + 3) * DAY).toISOString(),
    media: { cover: media !== "none", background: media === "all", icon: media === "all" },
  }));
}

export function demoStores(): Store[] {
  return [
    { id: "steam", name: "Steam", pluginInstalled: true, launcherInstalled: true, connected: true, gameCount: 0 },
    { id: "epic", name: "Epic Games", pluginInstalled: true, launcherInstalled: true, connected: true, gameCount: 0 },
    { id: "xbox", name: "Xbox / Game Pass", pluginInstalled: true, launcherInstalled: true, connected: false, gameCount: 0 },
    { id: "battlenet", name: "Battle.net", pluginInstalled: true, launcherInstalled: false, connected: null, gameCount: 0 },
  ];
}

/** Image de remplacement générée (SVG en data URL) : dégradé propre à chaque jeu + titre. */
export function demoImage(game: Game, kind: "cover" | "background" | "icon"): string {
  const [w, h] = kind === "cover" ? [600, 900] : kind === "background" ? [1920, 1080] : [256, 256];
  const hue = [...game.name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 360;
  const words = game.name.replace(/[<&>"]/g, "").split(" ");
  const lines: string[] = [];
  for (const word of words) {
    const last = lines.at(-1);
    if (last !== undefined && (last + " " + word).length <= 14) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  const size = kind === "background" ? 0 : Math.round(w / 9);
  const text = lines
    .slice(0, 4)
    .map((line, i) => `<text x="50%" y="${h * 0.62 + i * size * 1.15}" text-anchor="middle">${line}</text>`)
    .join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${hue} 60% 38%)"/><stop offset="1" stop-color="hsl(${(hue + 50) % 360} 55% 14%)"/>` +
    `</linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>` +
    `<circle cx="${w * 0.78}" cy="${h * 0.22}" r="${w * 0.3}" fill="hsl(${(hue + 180) % 360} 70% 60% / 0.18)"/>` +
    (size ? `<g fill="#fff" font-family="Segoe UI, sans-serif" font-weight="700" font-size="${size}">${text}</g>` : "") +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
