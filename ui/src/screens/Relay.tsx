// Relais : chaque fois que Playscreen passe la main (Paramètres Windows, fenêtre d'un
// launcher), il dit où l'on va, ce que devient la manette et comment revenir. Même mise en
// page pour le chargement d'une page web (« Instant Gaming s'ouvre… »).

import { useEffect } from "react";
import { useFocusScope } from "../components/focus.ts";
import { PadGlyph } from "../components/PadHints.tsx";
import { Spinner } from "../components/Spinner.tsx";
import { useNavAction } from "../input/navigation.ts";
import "./console-pages.css";

interface Props {
  to: string;
  title: string;
  text?: string;
  /** Souris virtuelle (sentinelle) : affiche les commandes et le retour par Select + Y. */
  mouse: boolean;
  /** Chargement : se termine seul après `ms`. */
  loading?: { ms: number; onDone(): void };
  onBack(): void;
}

export function Relay({ to, title, text, mouse, loading, onBack }: Props) {
  const ref = useFocusScope<HTMLDivElement>();

  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(loading.onDone, loading.ms);
    return () => clearTimeout(timer);
  }, []);

  // Démo : B joue le rôle de Select + Y (retour à Playscreen).
  useNavAction((action) => {
    if (action === "back") onBack();
    return true;
  });

  return (
    <div className="relay" role="dialog" aria-modal="true" ref={ref} tabIndex={-1}>
      <div className="console-art" />
      <div className="relay-card">
        <div className="relay-steps">
          <b>Playscreen</b>
          <i>→</i>
          <b>{to}</b>
        </div>
        <h1>{title}</h1>
        {text && <p>{text}</p>}
        {mouse ? (
          <>
            <div className="legend">
              <div>
                <span className="pad-stick relay-stick">L</span>Déplacer
              </div>
              <div>
                <span className="relay-glyph">
                  <PadGlyph pad="A" />
                </span>
                Cliquer
              </div>
              <div>
                <span className="pad-stick relay-stick">R</span>Défiler
              </div>
              <div>
                <span className="relay-glyph">
                  <PadGlyph pad="Y" />
                </span>
                Clavier
              </div>
            </div>
            <div className="relay-steps relay-return">
              Pour revenir : <b>Select + Y</b>
            </div>
          </>
        ) : (
          <Spinner size={4} />
        )}
      </div>
    </div>
  );
}
