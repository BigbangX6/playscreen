// Bibliothèque : tous les jeux, filtrés par store ou « installés » (LB / RB), triés (X).

import { useEffect, useMemo, useRef } from "react";
import type { EngineClient } from "../../../api/client.ts";
import type { Game } from "../../../api/types.ts";
import { Glyph, Hints } from "../components/Hints.tsx";
import { GameTile } from "../components/GameTile.tsx";
import type { Progress } from "../components/ProgressBar.tsx";
import { StateView } from "../components/StateView.tsx";
import { TopBar } from "../components/TopBar.tsx";
import { STORE_LABELS, type StoreKey } from "../format.ts";
import { focusFirst, useNavAction } from "../input/navigation.ts";

export type LibraryFilter = "all" | "installed" | StoreKey;
export type LibrarySort = "recent" | "name" | "playtime";

const SORTS: LibrarySort[] = ["recent", "name", "playtime"];
const SORT_LABELS: Record<LibrarySort, string> = { recent: "Récents", name: "Nom", playtime: "Temps de jeu" };
const STORE_ORDER: StoreKey[] = ["steam", "epic", "xbox", "battlenet", "other"];

interface Props {
  client: EngineClient;
  games: Game[] | null;
  error: string | null;
  installs: Record<string, Progress | null>;
  runningId: string | null;
  runningName: string | null;
  filter: LibraryFilter;
  sort: LibrarySort;
  focusedId: string | null;
  onFilter(filter: LibraryFilter): void;
  onSort(sort: LibrarySort): void;
  onFocusGame(id: string): void;
  onOpen(game: Game): void;
  onRetry(): void;
  onOpenStores(): void;
}

function sortGames(games: Game[], sort: LibrarySort): Game[] {
  const byName = (a: Game, b: Game) => (a.sortingName || a.name).localeCompare(b.sortingName || b.name, "fr");
  const time = (iso?: string | null) => (iso ? new Date(iso).getTime() : 0);
  return [...games].sort((a, b) => {
    if (sort === "name") return byName(a, b);
    if (sort === "playtime") return b.playtimeSeconds - a.playtimeSeconds || byName(a, b);
    // Récents : dernière partie, puis jeux installés, puis date d'ajout.
    return (
      time(b.lastPlayed) - time(a.lastPlayed) ||
      Number(b.installed) - Number(a.installed) ||
      time(b.added) - time(a.added) ||
      byName(a, b)
    );
  });
}

export function Library(props: Props) {
  const { client, games, error, installs, runningId, filter, sort, focusedId } = props;
  const gridRef = useRef<HTMLDivElement>(null);
  /** Après LB / RB : le focus revient sur la première tuile. */
  const focusGridNext = useRef(false);

  // Onglets : « Tous », « Installés », puis seulement les stores qui ont des jeux.
  const filters = useMemo<LibraryFilter[]>(() => {
    const stores = new Set(games?.map((g) => g.store));
    return ["all", "installed", ...STORE_ORDER.filter((s) => stores.has(s))];
  }, [games]);

  const visible = useMemo(() => {
    if (!games) return [];
    const kept = games.filter((g) => (filter === "all" ? true : filter === "installed" ? g.installed : g.store === filter));
    return sortGames(kept, sort);
  }, [games, filter, sort]);

  const focused = games?.find((g) => g.id === focusedId) ?? null;

  // Le focus n'est jamais perdu : jeu précédemment choisi, sinon première tuile.
  useEffect(() => {
    // Pendant le chargement : le focus ira sur la grille dès qu'elle sera là.
    if (!games && !error) {
      focusGridNext.current = true;
      return;
    }
    const grid = gridRef.current;
    const active = document.activeElement;
    const lost = !active || active === document.body || !active.isConnected;
    if (!focusGridNext.current && !lost) return;
    focusGridNext.current = false;
    const target =
      (focusedId && grid?.querySelector<HTMLElement>(`[data-game-id="${focusedId}"]`)) ||
      grid?.querySelector<HTMLElement>("[data-game-id]");
    if (target) {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "nearest" });
    } else focusFirst();
  }, [visible, focusedId, games, error]);

  const cycleFilter = (step: number) => {
    const index = filters.indexOf(filter);
    const next = filters[(index + step + filters.length) % filters.length]!;
    focusGridNext.current = true;
    gridRef.current?.scrollTo({ top: 0 });
    props.onFilter(next);
  };
  const cycleSort = () => props.onSort(SORTS[(SORTS.indexOf(sort) + 1) % SORTS.length]!);

  useNavAction((action) => {
    if (action === "previousTab") cycleFilter(-1);
    else if (action === "nextTab") cycleFilter(1);
    else if (action === "options") cycleSort();
    else return false;
    return true;
  });

  const filterLabel = (f: LibraryFilter) => (f === "all" ? "Tous" : f === "installed" ? "Installés" : STORE_LABELS[f]);
  const count = (f: LibraryFilter) =>
    games?.filter((g) => (f === "all" ? true : f === "installed" ? g.installed : g.store === f)).length ?? 0;

  let body;
  if (error && !games) {
    body = (
      <StateView kind="error" title="Impossible de charger la bibliothèque" message={error}>
        <button className="btn btn-primary" data-focusable onClick={props.onRetry}>
          Réessayer
        </button>
      </StateView>
    );
  } else if (!games) {
    body = (
      <div className="grid" aria-busy="true">
        {Array.from({ length: 14 }, (_, i) => (
          <div key={i} className="tile-skeleton" style={{ animationDelay: `${i * 60}ms` }} />
        ))}
      </div>
    );
  } else if (games.length === 0) {
    body = (
      <StateView kind="empty" title="Aucun jeu pour l'instant" message="Connecte un store pour retrouver tes jeux ici.">
        <button className="btn btn-primary" data-focusable onClick={props.onOpenStores}>
          Connecter un store
        </button>
      </StateView>
    );
  } else if (visible.length === 0) {
    body = (
      <StateView kind="empty" title={filter === "installed" ? "Aucun jeu installé" : "Aucun jeu ici"} message="Choisis un jeu dans « Tous » pour l'installer.">
        <button className="btn btn-primary" data-focusable onClick={() => props.onFilter("all")}>
          Voir tous les jeux
        </button>
      </StateView>
    );
  } else {
    body = (
      <div className="grid" ref={gridRef}>
        {visible.map((game) => (
          <GameTile
            key={game.id}
            game={game}
            client={client}
            progress={installs[game.id] ?? null}
            installing={game.id in installs}
            running={game.id === runningId}
            onOpen={props.onOpen}
            onFocus={(g) => props.onFocusGame(g.id)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="screen library">
      <div
        className="backdrop"
        style={{
          backgroundImage: focused?.media?.background ? `url("${client.mediaUrl(focused.id, "background")}")` : undefined,
        }}
      />
      <TopBar title="Bibliothèque" running={props.runningName} />
      <nav className="tabs">
        <Glyph action="previousTab" />
        {filters.map((f) => (
          <button
            key={f}
            className={`tab ${f === filter ? "tab-active" : ""}`}
            data-focusable
            onClick={() => props.onFilter(f)}
          >
            {filterLabel(f)}
            {games && <span className="tab-count">{count(f)}</span>}
          </button>
        ))}
        <Glyph action="nextTab" />
        <span className="spacer" />
        <button className="chip" data-focusable onClick={cycleSort}>
          <Glyph action="options" /> Tri : {SORT_LABELS[sort]}
        </button>
      </nav>
      <section className="library-body">{body}</section>
      <Hints
        items={[
          ["confirm", "Ouvrir"],
          ["tabs", "Filtrer"],
          ["options", "Trier"],
          ["menu", "Menu"],
        ]}
      />
    </div>
  );
}
