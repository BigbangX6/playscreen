// Pages simples des espaces (première version) : Rechercher, Trophées, Notifications.
// Même mise en page que les Paramètres : titre en haut à gauche, lignes en dessous.

import { useEffect, useRef, type ReactNode } from "react";
import type { Game } from "../../../api/types.ts";
import { PadHints } from "../components/PadHints.tsx";
import { STORE_LABELS } from "../format.ts";
import { useNavAction } from "../input/navigation.ts";
import { system } from "../system.ts";
import "./console-pages.css";

export interface NotificationEntry {
  id: number;
  title: string;
  message?: string;
  at: number;
}

function Page({ title, children, onBack }: { title: string; children: ReactNode; onBack(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>("[data-focusable]");
    if (first) first.focus({ preventScroll: true });
    else ref.current?.focus({ preventScroll: true });
  }, []);
  useNavAction((action) => {
    if (action === "back") {
      onBack();
      return true;
    }
    return false;
  });
  return (
    <div className="console-page" ref={ref} tabIndex={-1}>
      <div className="console-art" />
      <h1 className="title-s">{title}</h1>
      <div className="page-body">{children}</div>
      <PadHints
        className="console-hints"
        items={[
          ["A", "Ouvrir"],
          ["B", "Retour"],
        ]}
      />
    </div>
  );
}

export function SearchPage({ games, onOpenGame, onBack }: { games: Game[] | null; onOpenGame(game: Game): void; onBack(): void }) {
  const recent = [...(games ?? [])]
    .filter((g) => g.lastPlayed)
    .sort((a, b) => new Date(b.lastPlayed!).getTime() - new Date(a.lastPlayed!).getTime())
    .slice(0, 6);
  return (
    <Page title="Rechercher" onBack={onBack}>
      <div className="search-field">Tape le nom d'un jeu…</div>
      <p className="page-note">Le clavier manette de Windows s'ouvrira ici (à ajouter au moteur).</p>
      <span className="page-sec">Joués récemment</span>
      {recent.map((game) => (
        <button key={game.id} className="srow" data-focusable onClick={() => onOpenGame(game)}>
          <span>
            {game.name} <small>· {STORE_LABELS[game.store]}</small>
          </span>
        </button>
      ))}
    </Page>
  );
}

export function TrophiesPage({ games, onOpenGame, onBack }: { games: Game[] | null; onOpenGame(game: Game): void; onBack(): void }) {
  const rows = (games ?? [])
    .map((game) => ({ game, trophies: system.trophies(game.id) }))
    .filter((r) => r.trophies)
    .sort((a, b) => b.trophies!.unlocked / b.trophies!.total - a.trophies!.unlocked / a.trophies!.total);
  return (
    <Page title="Trophées" onBack={onBack}>
      {rows.length === 0 && (
        <p className="page-note">Les trophées arriveront avec l'extension Playnite SuccessStory (Steam, Epic, Xbox, Battle.net).</p>
      )}
      {rows.map(({ game, trophies }) => (
        <button key={game.id} className="srow" data-focusable onClick={() => onOpenGame(game)}>
          <span>
            {game.name} <small>· {STORE_LABELS[game.store]}</small>
          </span>
          <span className="srow-trophies">
            {trophies!.unlocked} / {trophies!.total}
            <span className="mini" style={{ ["--ratio" as string]: `${(trophies!.unlocked / trophies!.total) * 100}%` }} />
          </span>
        </button>
      ))}
    </Page>
  );
}

export function NotificationsPage({ entries, onBack }: { entries: NotificationEntry[]; onBack(): void }) {
  return (
    <Page title="Notifications" onBack={onBack}>
      {entries.length === 0 && <p className="page-note">Aucune notification pour l'instant.</p>}
      {[...entries].reverse().map((entry) => (
        <button key={entry.id} className="srow" data-focusable>
          <span>
            {entry.title} {entry.message && <small>· {entry.message}</small>}
          </span>
          <span className="srow-time">{new Date(entry.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
        </button>
      ))}
    </Page>
  );
}
