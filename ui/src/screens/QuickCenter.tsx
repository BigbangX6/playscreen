// Centre rapide (Start, partout ; Select + Start en jeu y mène directement) : le jeu en
// cours, ce qui tourne en fond (Discord, musique), le système et l'alimentation.
// Volume et luminosité sont des boutons : un appui ouvre le réglage (gauche / droite).

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import type { EngineClient } from "../../../api/client.ts";
import type { Game, Volume } from "../../../api/types.ts";
import { useFocusScope } from "../components/focus.ts";
import { Icon, type IconName } from "../components/Icons.tsx";
import { PadHints } from "../components/PadHints.tsx";
import type { Progress } from "../components/ProgressBar.tsx";
import { formatDuration, formatPlaytime } from "../format.ts";
import { useNavAction } from "../input/navigation.ts";
import { system, useSystem, type PowerAction } from "../system.ts";
import { MUSIC_SITES, type Route } from "./spaces.ts";
import "./quick.css";

export interface Download {
  game: Game;
  progress: Progress | null;
  etaSeconds: number | null;
}

interface Props {
  client: EngineClient;
  /** Jeu en cours (la section « En cours » n'existe qu'en jeu). */
  game: Game | null;
  since: number;
  download: Download | null;
  notifications: number;
  /** Volume de Windows (moteur) ; null si indisponible. */
  volume: Volume | null;
  /** « Quitter le jeu » demandé : on attend la fin de partie. */
  stopping: boolean;
  onVolume(level: number): void;
  onResume(): void;
  onClose(): void;
  onQuit(): void;
  onForceQuit(): void;
  onNavigate(route: Route): void;
  onOpenGame(game: Game): void;
  onPower(action: PowerAction): void;
}

type Adjustable = "volume" | "brightness";

function useElapsed(since: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, (now - since) / 1000);
}

function sessionLabel(seconds: number): string {
  return seconds < 3600 ? `${Math.max(1, Math.floor(seconds / 60))} min` : formatDuration(seconds);
}

function Tile(props: { label: string; value: string; className?: string; onClick(): void; id?: string }) {
  return (
    <button className={`st ${props.className ?? ""}`} data-focusable data-tile={props.id} onClick={props.onClick}>
      {props.label}
      <small>{props.value}</small>
    </button>
  );
}

export function QuickCenter(props: Props) {
  const { client, game } = props;
  const sys = useSystem();
  const elapsed = useElapsed(props.since);
  const [adjusting, setAdjusting] = useState<Adjustable | null>(null);
  const original = useRef(0);
  const ref = useFocusScope<HTMLDivElement>(game ? ".qc-resume" : ".st");

  const value = (kind: Adjustable) => (kind === "volume" ? props.volume?.level : sys.brightness) ?? 0;
  const set = (kind: Adjustable, v: number) => (kind === "volume" ? props.onVolume(v) : system.setBrightness(v));

  const startAdjust = (kind: Adjustable) => {
    original.current = value(kind);
    setAdjusting(kind);
  };
  const endAdjust = (keep: boolean) => {
    if (!adjusting) return;
    if (!keep) set(adjusting, original.current);
    const kind = adjusting;
    setAdjusting(null);
    // Le focus revient sur le bouton qui a ouvert le réglage.
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>(`[data-tile="${kind}"]`)?.focus({ preventScroll: true }));
  };

  useNavAction((action) => {
    if (adjusting) {
      if (action === "left" || action === "right") set(adjusting, value(adjusting) + (action === "left" ? -5 : 5));
      else if (action === "confirm") endAdjust(true);
      else if (action === "back") endAdjust(false);
      return true;
    }
    if (action === "back" || action === "menu") {
      if (game) props.onResume();
      else props.onClose();
      return true;
    }
    // Rien ne fuit vers l'écran derrière.
    return !["up", "down", "left", "right", "confirm"].includes(action);
  });

  // Pendant un réglage, le focus reste sur le curseur.
  useEffect(() => {
    if (adjusting) ref.current?.querySelector<HTMLElement>(".adjust")?.focus({ preventScroll: true });
  }, [adjusting]);

  const dim = adjusting ? "dimmed" : "";

  // ——— Système : tuiles, et le réglage ouvert sous sa ligne ———
  const tiles: { id: string; node: ReactNode }[] = [];
  const tileClass = (id: string) => (adjusting ? (adjusting === id ? "st-f2" : "dimmed") : "");
  if (props.volume)
    tiles.push({
      id: "volume",
      node: (
        <Tile
          id="volume"
          label="Volume"
          value={props.volume.muted ? "Coupé" : String(props.volume.level)}
          className={tileClass("volume")}
          onClick={() => startAdjust("volume")}
        />
      ),
    });
  if (sys.brightness !== null)
    tiles.push({
      id: "brightness",
      node: <Tile id="brightness" label="Luminosité" value={`${sys.brightness} %`} className={tileClass("brightness")} onClick={() => startAdjust("brightness")} />,
    });
  if (sys.audioOutput)
    tiles.push({ id: "audio", node: <Tile label="Sortie audio" value={sys.audioOutput} className={tileClass("audio")} onClick={() => system.nextAudioOutput()} /> });
  if (sys.controllerBattery !== null)
    tiles.push({
      id: "pad",
      node: <Tile label="Manette" value={`${sys.controllerBattery} %`} className={tileClass("pad")} onClick={() => props.onNavigate({ kind: "settings", section: "manettes" })} />,
    });
  if (sys.network)
    tiles.push({
      id: "net",
      node: <Tile label={sys.network === "Câble" ? "Réseau" : "Wi-Fi"} value={sys.network} className={tileClass("net")} onClick={() => props.onNavigate({ kind: "settings", section: "reseau" })} />,
    });
  tiles.push({
    id: "notif",
    node: (
      <Tile
        label="Notifications"
        value={props.notifications ? `${props.notifications} nouvelle${props.notifications > 1 ? "s" : ""}` : "Aucune nouvelle"}
        className={tileClass("notif")}
        onClick={() => props.onNavigate({ kind: "page", page: "notifications" })}
      />
    ),
  });

  const adjustIndex = adjusting ? tiles.findIndex((t) => t.id === adjusting) : -1;
  const insertAfter = adjustIndex < 0 ? -1 : Math.min(tiles.length - 1, Math.floor(adjustIndex / 3) * 3 + 2);
  const adjustIcon: IconName = adjusting === "volume" ? "speaker" : "sun";

  const dl = props.download;
  const dlRatio = dl?.progress && dl.progress.bytesTotal > 0 ? dl.progress.bytesDone / dl.progress.bytesTotal : null;

  const discord = sys.discord;
  const music = sys.music;
  const musicSite = MUSIC_SITES[music?.service ?? sys.musicServices[0] ?? "Spotify"] ?? "spotify";

  return (
    <div className="qc" role="dialog" aria-modal="true">
      <div className="qc-scrim" />
      <div className="panel2" ref={ref}>
        {game && (
          <>
            <span className={`sec ${dim}`}>En cours</span>
            <div className={`qc-game ${dim}`}>
              <div className="qc-cover">
                {game.media?.cover ? <img src={client.mediaUrl(game.id, "cover")} alt="" draggable={false} /> : <span>{game.name}</span>}
              </div>
              <div>
                <div className="qc-name">{game.name}</div>
                <div className="qc-session">Session : {sessionLabel(elapsed)}</div>
              </div>
            </div>
            <div className={`pills ${dim}`}>
              <button className="pill2 qc-resume" data-focusable onClick={props.onResume}>
                ▶ Reprendre
              </button>
              <button className="pill2" data-focusable onClick={() => !props.stopping && props.onQuit()}>
                {props.stopping ? "Fermeture…" : "Quitter le jeu"}
              </button>
              <button className="pill2 pill2-danger" data-focusable onClick={props.onForceQuit}>
                Forcer la fermeture
              </button>
            </div>
          </>
        )}

        {(discord || music) && (
          <>
            <span className={`sec ${dim}`}>En fond</span>
            <div className={`bgcards ${dim}`}>
              {discord && (
                <div className="bgc">
                  <div className="bgc-t">
                    <span className="bgc-ico">
                      <Icon name="people" />
                    </span>
                    Discord
                  </div>
                  <span className="bgc-sub">
                    {discord.call ? `Appel · ${discord.call.channel} · ${discord.call.people}` : discord.unread ? `${discord.unread} messages non lus` : "Pas d'appel en cours"}
                  </span>
                  <div className="ctl">
                    {discord.call && (
                      <>
                        <button data-focusable onClick={() => system.toggleMicrophone()} className={discord.call.muted ? "ctl-on" : ""}>
                          {discord.call.muted ? "Micro coupé" : "Micro"}
                        </button>
                        <button data-focusable className="ctl-warn" onClick={() => system.leaveCall()}>
                          Quitter
                        </button>
                      </>
                    )}
                    <button data-focusable onClick={() => props.onNavigate({ kind: "web", site: "discord" })}>
                      Ouvrir
                    </button>
                  </div>
                </div>
              )}
              {(music || discord) && (
                <div className="bgc">
                  <div className="bgc-t">
                    <span className="bgc-ico">
                      <Icon name="music" />
                    </span>
                    Musique
                  </div>
                  <span className="bgc-sub">{music ? `${music.service} · ${[music.artist, music.title].filter(Boolean).join(", ")}` : "Rien en lecture"}</span>
                  <div className="ctl">
                    {music && (
                      <>
                        <button data-focusable onClick={() => system.musicPrevious()}>
                          |◀
                        </button>
                        <button data-focusable onClick={() => system.musicToggle()}>
                          {music.playing ? "❚❚" : "▶"}
                        </button>
                        <button data-focusable onClick={() => system.musicNext()}>
                          ▶|
                        </button>
                      </>
                    )}
                    <button data-focusable onClick={() => props.onNavigate({ kind: "web", site: musicSite })}>
                      Ouvrir
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        <span className="sec">Système</span>
        <div className="sys">
          {tiles.map((tile, index) => (
            <Fragment key={tile.id}>
              {tile.node}
              {adjusting && index === insertAfter && (
                <div className="adjust" tabIndex={-1} data-focusable>
                  <div className="adjust-top">
                    <span className="adjust-name">
                      <Icon name={adjustIcon} />
                      {adjusting === "volume" ? "Volume" : "Luminosité"}
                    </span>
                    <span>
                      {value(adjusting)}
                      {adjusting === "brightness" ? " %" : ""}
                    </span>
                  </div>
                  <div className="adjust-track">
                    <i style={{ width: `${value(adjusting)}%` }} />
                    <b style={{ left: `${value(adjusting)}%` }} />
                  </div>
                  <PadHints
                    className="adjust-help"
                    items={[
                      ["leftRight", "Régler"],
                      ["A", "Valider"],
                      ["B", "Annuler"],
                    ]}
                  />
                </div>
              )}
            </Fragment>
          ))}
          {dl && (
            <button className={`st st-wide ${dim}`} data-focusable onClick={() => props.onOpenGame(dl.game)}>
              Téléchargement
              <small>
                {dl.game.name}
                {dlRatio !== null && ` · ${Math.round(dlRatio * 100)} %`}
                {dl.etaSeconds !== null && ` · encore ${formatPlaytime(dl.etaSeconds)}`}
              </small>
            </button>
          )}
        </div>

        <span className={`sec ${dim}`}>Alimentation</span>
        <div className={`pills ${dim}`}>
          <button className="pill2" data-focusable onClick={() => props.onPower("sleep")}>
            Veille
          </button>
          <button className="pill2" data-focusable onClick={() => props.onPower("shutdown")}>
            Éteindre
          </button>
          <button className="pill2" data-focusable onClick={() => props.onPower("restart")}>
            Redémarrer
          </button>
          <button className="pill2" data-focusable onClick={() => props.onPower("desktop")}>
            Bureau Windows
          </button>
        </div>
      </div>
      {!adjusting && (
        <PadHints
          className="qc-hints"
          items={[
            ["A", "Choisir"],
            ["B", game ? "Reprendre" : "Fermer"],
          ]}
        />
      )}
    </div>
  );
}
