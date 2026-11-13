// « Ajouter un jeu » hors launcher, entièrement à la manette (docs/hors-launcher.md) :
// - Suggestions : raccourcis du Bureau et du menu Démarrer ;
// - Parcourir : explorateur de fichiers (lieux utiles, disques, dossiers, fichiers lançables).
// Puis une confirmation : nom modifiable au clavier manette, « Ajouter ». La jaquette est
// cherchée ensuite par le moteur (événement game.updated).

import { useEffect, useRef, useState } from "react";
import type { EngineClient } from "../../../api/client.ts";
import type { AppCandidate, FileEntry, FileListing, Game } from "../../../api/types.ts";
import { useNavAction } from "../input/navigation.ts";
import { Page } from "./Pages.tsx";

type Tab = "suggestions" | "browse";

interface Choice {
  path: string;
  name: string;
  arguments?: string;
}

interface Props {
  client: EngineClient;
  onAdded(game: Game): void;
  onBack(): void;
}

/** Noms d'exécutables qui ne disent rien du jeu : on prend alors le nom du dossier. */
const GENERIC = /^(game|launcher|start|play|run|setup|app|client|main|bin|win(32|64)?|x64|x86)$/i;

/** Nom proposé pour un fichier : sans extension, ou le dossier si le nom est générique. */
export function suggestName(path: string): string {
  const parts = path.split("\\").filter(Boolean);
  const base = (parts.at(-1) ?? path).replace(/\.(exe|lnk|url|bat|cmd)$/i, "").replace(/[_]+/g, " ").trim();
  const folders = parts.slice(0, -1).filter((p) => !/^(bin(aries)?|win(32|64)?|x64|x86|game)$/i.test(p) && !/:$/.test(p));
  if ((GENERIC.test(base) || base.length < 3) && folders.length) return folders.at(-1)!;
  return base;
}

const ICONS: Record<FileEntry["kind"], string> = { place: "★", drive: "▣", folder: "▸", file: "▶" };

export function AddGame({ client, onAdded, onBack }: Props) {
  const [tab, setTab] = useState<Tab>("suggestions");
  const [candidates, setCandidates] = useState<AppCandidate[] | null>(null);
  const [listing, setListing] = useState<FileListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [adding, setAdding] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  /** Dossier d'où l'on remonte : il garde le focus. */
  const cameFrom = useRef<string | null>(null);

  useEffect(() => {
    client.appCandidates().then(setCandidates, () => setCandidates([]));
  }, [client]);

  const open = (path: string | null) => {
    setError(null);
    client.listFiles(path).then(
      (result) => setListing(result),
      () => setError("Impossible d'ouvrir ce dossier."),
    );
  };

  useEffect(() => {
    if (tab === "browse" && !listing) open(null);
  }, [tab]);

  // Après chaque changement de vue : focus sur le dossier d'où l'on vient, sinon la 1re ligne.
  useEffect(() => {
    const root = body.current;
    if (!root) return;
    const from = cameFrom.current;
    cameFrom.current = null;
    const target =
      (from && [...root.querySelectorAll<HTMLElement>("[data-path]")].find((e) => e.dataset.path === from)) ||
      root.querySelector<HTMLElement>("[data-focusable]");
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "nearest" });
  }, [tab, listing, candidates, choice, error]);

  const up = () => {
    if (!listing?.path) return false;
    cameFrom.current = listing.path;
    open(listing.parent);
    return true;
  };

  const back = () => {
    if (choice) setChoice(null);
    else if (tab === "browse" && up()) return;
    else onBack();
  };

  useNavAction((action) => {
    if (choice) return false;
    if (action === "previousTab" || action === "nextTab") {
      setTab((t) => (t === "suggestions" ? "browse" : "suggestions"));
      return true;
    }
    return false;
  });

  if (choice) {
    return (
      <Confirm
        choice={choice}
        adding={adding}
        onName={(name) => setChoice({ ...choice, name })}
        onAdd={() => {
          setAdding(true);
          client.addApp(choice).then(
            (game) => {
              setAdding(false);
              onAdded(game);
            },
            () => {
              setAdding(false);
              setError("Ce fichier ne peut pas être ajouté (raccourci vers un programme introuvable ?).");
              setChoice(null);
            },
          );
        }}
        onBack={back}
      />
    );
  }

  const pick = (path: string, name: string, args?: string) => setChoice({ path, name, arguments: args });

  return (
    <Page
      title="Ajouter un jeu"
      subtitle={tab === "suggestions" ? "Trouvés sur ce PC" : (listing?.path ?? "Lieux et disques")}
      onBack={back}
      hints={[
        ["A", "Choisir"],
        ["LB RB", "Suggestions / Parcourir"],
        ["B", tab === "browse" && listing?.path ? "Dossier précédent" : "Retour"],
      ]}
    >
      <div className="add-tabs">
        {(["suggestions", "browse"] as Tab[]).map((t) => (
          <button key={t} className={`chip ${t === tab ? "chip-active" : ""}`} data-focusable={t === tab ? undefined : true} onClick={() => setTab(t)}>
            {t === "suggestions" ? "Suggestions" : "Parcourir les dossiers"}
          </button>
        ))}
      </div>
      <div className="add-body" ref={body}>
        {error && <p className="page-note">{error}</p>}
        {tab === "suggestions" ? (
          candidates === null ? (
            <p className="page-note">Recherche des jeux et applications…</p>
          ) : candidates.length === 0 ? (
            <p className="page-note">Rien trouvé sur le Bureau ni dans le menu Démarrer. Essaie « Parcourir les dossiers » (RB).</p>
          ) : (
            candidates.map((c) => (
              <button key={c.path + c.arguments} className="srow" data-focusable data-path={c.path} onClick={() => pick(c.path, c.name, c.arguments)}>
                <span>
                  {c.name} <small>· {c.source === "desktop" ? "Bureau" : "Menu Démarrer"}</small>
                </span>
                <span className={c.added ? "srow-on" : ""}>{c.added ? "✓ Déjà ajouté" : "Ajouter ›"}</span>
              </button>
            ))
          )
        ) : !listing ? (
          !error && <p className="page-note">Ouverture…</p>
        ) : (
          <>
            {listing.path && (
              <button className="srow" data-focusable onClick={up}>
                <span>⬑ Dossier précédent</span>
                <span className="srow-dim">B</span>
              </button>
            )}
            {listing.entries.length === 0 && <p className="page-note">Aucun dossier ni jeu ici.</p>}
            {listing.entries.map((e) => (
              <button
                key={e.path}
                className="srow"
                data-focusable
                data-path={e.path}
                onClick={() => (e.kind === "file" ? pick(e.path, suggestName(e.path)) : open(e.path))}
              >
                <span>
                  <span className="add-icon">{ICONS[e.kind]}</span> {e.name} {e.detail && <small>· {e.detail}</small>}
                </span>
                <span className={e.added ? "srow-on" : ""}>{e.kind === "file" ? (e.added ? "✓ Déjà ajouté" : "Ajouter ›") : "›"}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </Page>
  );
}

function Confirm({ choice, adding, onName, onAdd, onBack }: { choice: Choice; adding: boolean; onName(name: string): void; onAdd(): void; onBack(): void }) {
  const field = useRef<HTMLInputElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  // Entrée (Start sur le clavier manette) dans le champ : on referme le clavier et on va sur « Ajouter ».
  useNavAction((action) => {
    if (document.activeElement !== field.current) return false;
    if (action === "confirm") {
      addButton.current?.focus();
      return true;
    }
    return false;
  });
  const name = choice.name.trim();
  return (
    <Page title="Ajouter ce jeu ?" subtitle={choice.path} onBack={onBack} hints={[["A", "Choisir"], ["B", "Retour"]]}>
      <button ref={addButton} className="srow" data-focusable disabled={adding || !name} onClick={onAdd}>
        <span>{adding ? "Ajout…" : `Ajouter « ${name || "sans nom"} » à la bibliothèque`}</span>
        <span>›</span>
      </button>
      <span className="page-sec">Nom affiché (A pour le changer)</span>
      <input ref={field} className="search-field" data-focusable value={choice.name} onChange={(e) => onName(e.target.value)} />
      <p className="page-note">La jaquette est cherchée automatiquement d'après le nom. Le jeu se lance comme un programme ; Playscreen ferme les launchers ouverts pour lui laisser la mémoire.</p>
      <button className="srow" data-focusable onClick={onBack}>
        <span>Annuler</span>
        <span />
      </button>
    </Page>
  );
}
