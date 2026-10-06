// Launchers : premier démarrage (console vierge), « Comptes et launchers » (installer,
// se connecter, synchroniser, même quand on a déjà des jeux) et les réglages d'un launcher.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError, type EngineClient } from "../../../api/client.ts";
import type { LauncherSetting, Store, StoreId } from "../../../api/types.ts";
import { PadHints } from "../components/PadHints.tsx";
import { Spinner } from "../components/Spinner.tsx";
import { useNavAction } from "../input/navigation.ts";
import { Page } from "./Pages.tsx";
import { LAUNCHERS, launcherOf, type Launcher, type Route } from "./spaces.ts";
import "./console-pages.css";

const V1: StoreId[] = ["steam", "epic", "xbox", "battlenet"];

function Logo({ launcher }: { launcher: Launcher }) {
  return <span className={`lr-logo store-${launcher.store ?? "other"}`}>{launcher.name.slice(0, 1)}</span>;
}

function statusOf(store: Store | undefined): { install: [string, string]; account: [string, string] } {
  const install: [string, string] =
    !store || store.launcherInstalled === null ? ["unknown", "Vérification…"] : store.launcherInstalled ? ["ok", "Installé"] : ["warn", "Pas installé"];
  const account: [string, string] =
    !store || store.connected === null ? ["unknown", "Compte : vérification…"] : store.connected ? ["ok", "Connecté"] : ["warn", "Non connecté"];
  return { install, account };
}

interface Actions {
  syncing: StoreId[];
  onNavigate(route: Route): void;
  onLogin(store: Store, alternative: boolean): void;
  onSync(store: Store): void;
}

/** L'action principale d'un launcher : installer, se connecter, ou il est prêt. */
function primaryAction(launcher: Launcher, store: Store | undefined, actions: Actions): { label: ReactNode; run(): void; done?: boolean } {
  if (!store || store.launcherInstalled === false)
    return { label: "Installer", run: () => actions.onNavigate({ kind: "relay", target: `install-${launcher.id}` }) };
  if (store.connected !== true) return { label: "Se connecter", run: () => actions.onLogin(store, false) };
  if (actions.syncing.includes(store.id))
    return {
      label: (
        <>
          <Spinner size={1.6} /> Synchronisation…
        </>
      ),
      run: () => undefined,
    };
  return { label: `✓ Prêt · ${store.gameCount} ${store.gameCount > 1 ? "jeux" : "jeu"}`, run: () => actions.onSync(store), done: true };
}

// ——— Premier démarrage ———

interface WelcomeProps extends Actions {
  stores: Store[] | null;
  onDone(): void;
}

export function Welcome(props: WelcomeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const stores = props.stores ?? [];
  const byId = (id: StoreId) => stores.find((s) => s.id === id);
  const installed = stores.some((s) => s.launcherInstalled);
  const connected = stores.some((s) => s.connected);
  const games = stores.reduce((sum, s) => sum + (s.connected ? s.gameCount : 0), 0);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>(".wcard [data-focusable]")?.focus({ preventScroll: true });
  }, [props.stores === null]);

  useNavAction((action) => {
    if (action === "back") {
      props.onDone();
      return true;
    }
    return false;
  });

  const steps: [string, boolean][] = [
    ["Installe tes launchers", installed],
    ["Connecte tes comptes", connected],
    ["Tes jeux arrivent tout seuls", games > 0],
  ];

  return (
    <div className="console-page welcome" ref={ref}>
      <div className="console-art welcome-art" />
      <div className="welcome-body">
        <span className="scene-eb welcome-eb">Bienvenue sur Playscreen</span>
        <h1 className="scene-title scene-title-m">Prépare ta console</h1>
        <p className="preview-text">
          Une seule fois. Installe les launchers où sont tes jeux et connecte tes comptes : ta bibliothèque se remplit toute seule.
          Tu pourras y revenir dans Paramètres › Comptes et launchers.
        </p>
        <ol className="steps">
          {steps.map(([label, done], index) => (
            <li key={label} className={done ? "step-done" : ""}>
              <span className="step-n">{done ? "✓" : index + 1}</span>
              {label}
            </li>
          ))}
        </ol>
        <div className="wcards">
          {V1.map((id) => {
            const launcher = launcherOf(id);
            const store = byId(id);
            const status = statusOf(store);
            const action = primaryAction(launcher, store, props);
            return (
              <div key={id} className="wcard">
                <div className="wcard-head">
                  <Logo launcher={launcher} />
                  <b>{launcher.name}</b>
                </div>
                <span className="wcard-status">
                  <span className={`dot dot-${status.install[0]}`} />
                  {status.install[1]}
                  {store?.launcherInstalled && (
                    <>
                      <span className={`dot dot-${status.account[0]}`} />
                      {status.account[1]}
                    </>
                  )}
                </span>
                <button className={`pill2 wcard-btn ${action.done ? "wcard-done" : ""}`} data-focusable onClick={action.run}>
                  {action.label}
                </button>
              </div>
            );
          })}
        </div>
        <div className="scene-btns">
          <button className="rb rb-primary" data-focusable onClick={props.onDone}>
            {connected ? "Aller à l'accueil" : "Plus tard"}
          </button>
          <button className="rb" data-focusable onClick={() => props.onNavigate({ kind: "launchers" })}>
            Autres launchers
          </button>
        </div>
      </div>
      <PadHints
        className="console-hints"
        items={[
          ["A", "Choisir"],
          ["B", "Plus tard"],
        ]}
      />
    </div>
  );
}

// ——— Comptes et launchers ———

interface LaunchersProps extends Actions {
  stores: Store[] | null;
  error: string | null;
  onRetry(): void;
  onBack(): void;
}

export function LaunchersPage(props: LaunchersProps) {
  const stores = props.stores ?? [];
  const others = LAUNCHERS.filter((l) => !l.store);
  return (
    <Page
      title="Comptes et launchers"
      subtitle="Installe un launcher, connecte ton compte, règle-le pour Playscreen."
      onBack={props.onBack}
      hints={[
        ["A", "Choisir"],
        ["B", "Retour"],
      ]}
    >
      {props.error && !props.stores && (
        <button className="srow" data-focusable onClick={props.onRetry}>
          <span>
            Impossible de lire les launchers <small>· {props.error}</small>
          </span>
          <span>Réessayer ›</span>
        </button>
      )}
      {V1.map((id) => {
        const launcher = launcherOf(id);
        const store = stores.find((s) => s.id === id);
        const status = statusOf(store);
        const action = primaryAction(launcher, store, props);
        return (
          <div key={id} className="lrow">
            <Logo launcher={launcher} />
            <span className="lrow-info">
              <b>{launcher.name}</b>
              <small>
                <span className={`dot dot-${status.install[0]}`} />
                {status.install[1]}
                {store?.launcherInstalled && (
                  <>
                    <span className={`dot dot-${status.account[0]}`} />
                    {status.account[1]}
                  </>
                )}
              </small>
            </span>
            <span className="lrow-actions">
              <button className={`pill2 ${action.done ? "wcard-done" : ""}`} data-focusable onClick={action.run}>
                {action.done ? "Synchroniser" : action.label}
              </button>
              {store && id === "epic" && store.launcherInstalled && store.connected !== true && (
                <button className="pill2" data-focusable onClick={() => props.onLogin(store, true)}>
                  Autre méthode
                </button>
              )}
              {store?.launcherInstalled && (
                <button className="pill2" data-focusable onClick={() => props.onNavigate({ kind: "launcher", store: id })}>
                  Réglages ›
                </button>
              )}
            </span>
          </div>
        );
      })}
      <span className="page-sec">Autres launchers · leurs jeux arriveront plus tard dans Playscreen</span>
      {others.map((launcher) => (
        <div key={launcher.id} className="lrow">
          <Logo launcher={launcher} />
          <span className="lrow-info">
            <b>{launcher.name}</b>
            <small>Page d'installation officielle</small>
          </span>
          <span className="lrow-actions">
            <button className="pill2" data-focusable onClick={() => props.onNavigate({ kind: "relay", target: `install-${launcher.id}` })}>
              Installer
            </button>
          </span>
        </div>
      ))}
    </Page>
  );
}

// ——— Réglages d'un launcher ———

interface LauncherProps extends Actions {
  client: EngineClient;
  storeId: StoreId;
  store: Store | undefined;
  onNotify(title: string, message?: string): void;
  onBack(): void;
}

export function LauncherPage(props: LauncherProps) {
  const launcher = launcherOf(props.storeId);
  const [settings, setSettings] = useState<LauncherSetting[] | null>(null);

  const load = () =>
    props.client.launcherSettings().then(
      (all) => setSettings(all.filter((s) => s.store === props.storeId)),
      () => setSettings([]),
    );
  useEffect(() => void load(), [props.storeId]);
  // Les réglages arrivent du moteur après l'ouverture : le focus va sur le premier.
  const focused = useRef(false);
  useEffect(() => {
    if (focused.current || !settings?.length) return;
    focused.current = true;
    document.querySelector<HTMLElement>(".page-body .srow")?.focus({ preventScroll: true });
  }, [settings]);

  const apply = (setting: LauncherSetting) => {
    props.client.applyLauncherSetting(setting.id).then(
      () => {
        props.onNotify(`${launcher.name} réglé pour Playscreen`, setting.label);
        void load();
      },
      (error) =>
        props.onNotify(
          `Impossible de régler ${launcher.name}`,
          error instanceof ApiError && error.status === 409 ? `Ferme ${launcher.name}, puis réessaie.` : "Le moteur n'a pas répondu.",
        ),
    );
  };

  const store = props.store;
  return (
    <Page
      title={launcher.name}
      subtitle="Réglages du launcher"
      onBack={props.onBack}
      hints={[
        ["A", "Choisir"],
        ["B", "Retour"],
      ]}
    >
      <span className="page-sec">Recommandé pour Playscreen</span>
      {settings === null && <p className="page-note">Lecture des réglages…</p>}
      {settings?.length === 0 && <p className="page-note">Aucun réglage à changer pour ce launcher pour l'instant.</p>}
      {settings?.map((setting) => (
        <button key={setting.id} className="srow" data-focusable onClick={() => !setting.applied && apply(setting)}>
          <span>
            {setting.label}{" "}
            <small>
              ·{" "}
              {setting.applied
                ? "réglé pour Playscreen"
                : setting.launcherRunning
                  ? `ferme ${launcher.name} pour le changer`
                  : `recommandé : ${setting.recommended}`}
            </small>
          </span>
          <span className={setting.applied ? "srow-on" : ""}>{setting.applied ? "✓ Réglé" : "Régler ›"}</span>
        </button>
      ))}
      <span className="page-sec">Dans {launcher.name}</span>
      <button className="srow" data-focusable onClick={() => props.onNavigate({ kind: "relay", target: `launcher-settings-${props.storeId}` })}>
        <span>
          Tous les paramètres de {launcher.name} <small>· avec la souris virtuelle</small>
        </span>
        <span>Ouvrir ›</span>
      </button>
      {store && (
        <button className="srow" data-focusable onClick={() => props.onLogin(store, false)}>
          <span>
            {store.connected ? "Changer de compte" : "Se connecter"} <small>· {store.connected ? "compte connecté" : "compte non connecté"}</small>
          </span>
          <span>›</span>
        </button>
      )}
      {store?.connected && (
        <button className="srow" data-focusable onClick={() => props.onSync(store)}>
          <span>
            Synchroniser la bibliothèque <small>· {store.gameCount} jeux</small>
          </span>
          <span>{props.syncing.includes(store.id) ? "En cours…" : "›"}</span>
        </button>
      )}
      <button className="srow" data-focusable onClick={() => props.onNavigate({ kind: "relay", target: `install-${launcher.id}` })}>
        <span>
          Réinstaller {launcher.name} <small>· page d'installation officielle</small>
        </span>
        <span>›</span>
      </button>
    </Page>
  );
}
