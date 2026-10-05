// Pictogrammes au trait (capsule de l'accueil, centre rapide, navigateur).

import "./console.css";

export type IconName =
  | "search"
  | "bag"
  | "people"
  | "music"
  | "globe"
  | "trophy"
  | "gear"
  | "grid"
  | "sun"
  | "speaker"
  | "down";

const PATHS: Record<IconName, string[]> = {
  search: ["M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14Z", "m20 20-4-4"],
  bag: ["M5 8h14l-1 12H6L5 8Z", "M9 8V6a3 3 0 0 1 6 0v2"],
  people: [
    "M9 4.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7Z",
    "M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5",
    "M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.7c1.8.7 3 2.4 3.5 5.3",
  ],
  music: ["M9 18V5l11-2v13", "M6.5 15.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5Z", "M17.5 13.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5Z"],
  globe: [
    "M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17Z",
    "M3.5 12h17M12 3.5c2.5 2.6 3.6 5.4 3.6 8.5s-1.1 5.9-3.6 8.5c-2.5-2.6-3.6-5.4-3.6-8.5S9.5 6.1 12 3.5Z",
  ],
  trophy: ["M7 4h10v5a5 5 0 0 1-10 0V4Z", "M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 14v3M8 20h8M9.5 17h5"],
  gear: [
    "M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6Z",
    "M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1",
  ],
  grid: [
    "M5.5 4h3.5a1.5 1.5 0 0 1 1.5 1.5v3.5a1.5 1.5 0 0 1-1.5 1.5h-3.5a1.5 1.5 0 0 1-1.5-1.5v-3.5a1.5 1.5 0 0 1 1.5-1.5Z",
    "M15 4h3.5a1.5 1.5 0 0 1 1.5 1.5v3.5a1.5 1.5 0 0 1-1.5 1.5h-3.5a1.5 1.5 0 0 1-1.5-1.5v-3.5a1.5 1.5 0 0 1 1.5-1.5Z",
    "M5.5 13.5h3.5a1.5 1.5 0 0 1 1.5 1.5v3.5a1.5 1.5 0 0 1-1.5 1.5h-3.5a1.5 1.5 0 0 1-1.5-1.5v-3.5a1.5 1.5 0 0 1 1.5-1.5Z",
    "M15 13.5h3.5a1.5 1.5 0 0 1 1.5 1.5v3.5a1.5 1.5 0 0 1-1.5 1.5h-3.5a1.5 1.5 0 0 1-1.5-1.5v-3.5a1.5 1.5 0 0 1 1.5-1.5Z",
  ],
  sun: [
    "M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8Z",
    "M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4",
  ],
  speaker: ["M4 9.5h3.5L12 5.5v13l-4.5-4H4z", "M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"],
  down: ["M12 4v11M7 10l5 5 5-5M5 20h14"],
};

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={`icon ${className ?? ""}`} viewBox="0 0 24 24" aria-hidden="true">
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
