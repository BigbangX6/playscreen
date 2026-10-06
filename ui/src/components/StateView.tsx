// États communs à tous les écrans : chargement, vide, erreur (avec une action pour s'en sortir).

import type { ReactNode } from "react";
import { Spinner } from "./Spinner.tsx";

interface Props {
  kind: "loading" | "empty" | "error";
  title: string;
  message?: string;
  children?: ReactNode;
}

export function StateView({ kind, title, message, children }: Props) {
  return (
    <div className={`state-view state-${kind}`}>
      {kind === "loading" ? <Spinner size={7} /> : <span className="state-icon">{kind === "error" ? "!" : "∅"}</span>}
      <h2>{title}</h2>
      {message && <p className="muted">{message}</p>}
      {children && <div className="state-actions">{children}</div>}
    </div>
  );
}
