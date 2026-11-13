// Faux disque pour le faux moteur et la démo de l'interface (GET /files) : quelques dossiers
// et fichiers lançables, comme sur un vrai PC. Pas utilisé par le vrai moteur.

import type { FileEntry, FileListing } from "./types.ts";

const TREE: Record<string, string[]> = {
  "C:\\": ["Games\\", "Program Files\\", "Users\\"],
  "C:\\Games\\": ["Celeste\\", "Hollow Knight\\", "RetroArch\\"],
  "C:\\Games\\Celeste\\": ["Content\\", "Celeste.exe"],
  "C:\\Games\\Celeste\\Content\\": [],
  "C:\\Games\\Hollow Knight\\": ["hollow_knight_Data\\", "hollow_knight.exe", "UnityCrashHandler64.exe"],
  "C:\\Games\\Hollow Knight\\hollow_knight_Data\\": [],
  "C:\\Games\\RetroArch\\": ["retroarch.exe", "retroarch_debug.bat"],
  "C:\\Program Files\\": ["Mozilla Firefox\\"],
  "C:\\Program Files\\Mozilla Firefox\\": ["firefox.exe"],
  "C:\\Users\\": ["Joueur\\"],
  "C:\\Users\\Joueur\\": ["Desktop\\", "Downloads\\"],
  "C:\\Users\\Joueur\\Desktop\\": ["Minecraft.lnk", "Shadow PC.lnk"],
  "C:\\Users\\Joueur\\Downloads\\": ["Terraria\\", "setup-jeu.exe"],
  "C:\\Users\\Joueur\\Downloads\\Terraria\\": ["Terraria.exe"],
  "D:\\": ["Jeux\\"],
  "D:\\Jeux\\": ["Stardew Valley\\"],
  "D:\\Jeux\\Stardew Valley\\": ["Stardew Valley.exe"],
};

const ROOT: FileEntry[] = [
  { name: "Bureau", path: "C:\\Users\\Joueur\\Desktop\\", kind: "place", added: false },
  { name: "Téléchargements", path: "C:\\Users\\Joueur\\Downloads\\", kind: "place", added: false },
  { name: "Games (C:)", path: "C:\\Games\\", kind: "place", added: false },
  { name: "Windows (C:)", path: "C:\\", kind: "drive", detail: "112 Go libres", added: false },
  { name: "Jeux (D:)", path: "D:\\", kind: "drive", detail: "640 Go libres", added: false },
];

/** Contenu d'un dossier du faux disque ; null si le dossier n'existe pas. */
export function fakeListing(path: string | null | undefined, added: Set<string> = new Set()): FileListing | null {
  if (!path) return { path: null, parent: null, entries: ROOT };
  const dir = path.endsWith("\\") ? path : `${path}\\`;
  const names = TREE[dir];
  if (!names) return null;
  const entries: FileEntry[] = names.map((name) =>
    name.endsWith("\\")
      ? { name: name.slice(0, -1), path: dir + name, kind: "folder", added: false }
      : {
          name,
          path: dir + name,
          kind: "file",
          detail: name.endsWith(".lnk") ? "Raccourci" : name.endsWith(".bat") ? "Script" : "48 Mo",
          added: added.has(dir + name),
        },
  );
  // Disque : pas de parent (retour à la racine) ; sinon le dossier au-dessus.
  const parent = /^[A-Z]:\\$/.test(dir) ? null : dir.replace(/[^\\]+\\$/, "");
  return { path: dir, parent, entries };
}
