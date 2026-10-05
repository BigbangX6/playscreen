// Stores : état de chaque store (launcher installé, compte connecté), connexion,
// synchronisation.

import type { Store, StoreId } from "../../../api/types.ts";
import { useFocusScope } from "../components/focus.ts";
import { Hints } from "../components/Hints.tsx";
import { Spinner } from "../components/Spinner.tsx";
import { StateView } from "../components/StateView.tsx";
import { TopBar } from "../components/TopBar.tsx";
import { useNavAction } from "../input/navigation.ts";

interface Props {
  stores: Store[] | null;
  error: string | null;
  syncing: StoreId[];
  runningName: string | null;
  onLogin(store: Store, alternative: boolean): void;
  onSync(store: Store): void;
  onRetry(): void;
  onBack(): void;
}

type Tone = "ok" | "warn" | "unknown";

function Status({ tone, children }: { tone: Tone; children: string }) {
  return <span className={`status status-${tone}`}>{children}</span>;
}

function StoreRow({ store, syncing, onLogin, onSync }: { store: Store; syncing: boolean } & Pick<Props, "onLogin" | "onSync">) {
  const launcher: [Tone, string] =
    store.launcherInstalled === null ? ["unknown", "Launcher : inconnu"] : store.launcherInstalled ? ["ok", "Launcher installé"] : ["warn", "Launcher absent"];
  const account: [Tone, string] =
    store.connected === null ? ["unknown", "Compte : vérification…"] : store.connected ? ["ok", "Compte connecté"] : ["warn", "Compte non connecté"];
  return (
    <div className={`store-row store-tint-${store.id}`}>
      <div className={`store-logo store-${store.id}`}>{store.name.slice(0, 1)}</div>
      <div className="store-info">
        <h2>{store.name}</h2>
        <div className="store-statuses">
          <Status tone={launcher[0]}>{launcher[1]}</Status>
          <Status tone={account[0]}>{account[1]}</Status>
          <span className="muted">{store.gameCount} {store.gameCount > 1 ? "jeux" : "jeu"}</span>
        </div>
      </div>
      <div className="store-actions">
        {store.pluginInstalled ? (
          <>
            {store.connected !== true && (
              <button className="btn btn-primary" data-focusable onClick={() => onLogin(store, false)}>
                Se connecter
              </button>
            )}
            {store.id === "epic" && store.connected !== true && (
              <button className="btn btn-ghost" data-focusable onClick={() => onLogin(store, true)}>
                Autre méthode
              </button>
            )}
            <button
              className={`btn ${store.connected === true ? "btn-primary" : "btn-ghost"} ${syncing ? "btn-busy" : ""}`}
              data-focusable
              onClick={() => !syncing && onSync(store)}
            >
              {syncing ? (
                <>
                  <Spinner size={2.2} /> Synchronisation…
                </>
              ) : (
                "Synchroniser"
              )}
            </button>
          </>
        ) : (
          <span className="muted">Intégration indisponible</span>
        )}
      </div>
    </div>
  );
}

export function Stores(props: Props) {
  const ref = useFocusScope<HTMLDivElement>();
  useNavAction((action) => {
    if (action === "back") {
      props.onBack();
      return true;
    }
    return false;
  });

  let body;
  if (props.error && !props.stores) {
    body = (
      <StateView kind="error" title="Impossible de lire l'état des stores" message={props.error}>
        <button className="btn btn-primary" data-focusable onClick={props.onRetry}>
          Réessayer
        </button>
      </StateView>
    );
  } else if (!props.stores) {
    body = <StateView kind="loading" title="Lecture des stores…" />;
  } else if (props.stores.length === 0) {
    body = <StateView kind="empty" title="Aucun store disponible" />;
  } else {
    body = (
      <div className="store-list">
        {props.stores.map((store) => (
          <StoreRow key={store.id} store={store} syncing={props.syncing.includes(store.id)} onLogin={props.onLogin} onSync={props.onSync} />
        ))}
      </div>
    );
  }

  return (
    <div className="screen stores" ref={ref}>
      <TopBar title="Stores" running={props.runningName} />
      <section className="stores-body">
        <p className="lead muted">Connecte tes comptes pour retrouver tous tes jeux, installés ou non.</p>
        {body}
      </section>
      <Hints
        items={[
          ["confirm", "Choisir"],
          ["back", "Retour"],
        ]}
      />
    </div>
  );
}
