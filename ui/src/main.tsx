import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { DEMO } from "./engine.ts";
import { startInput } from "./input/gamepad.ts";
import { loadLanguage, startTranslation } from "./i18n/index.ts";
import { startNavigation } from "./input/navigation.ts";
import { startTextFieldKeyboard } from "./shell.ts";
import "./theme.css";

// Panneau de la version démo seulement (absent de la vraie interface).
const DemoPanel = DEMO ? lazy(() => import("./demo/DemoPanel.tsx").then((m) => ({ default: m.DemoPanel }))) : null;

startInput();
startNavigation();
startTextFieldKeyboard();

// Langue d'abord (fichier de l'installateur ou Paramètres, sinon Windows), puis l'écran.
await loadLanguage();
startTranslation();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    {DemoPanel && (
      <Suspense>
        <DemoPanel />
      </Suspense>
    )}
  </StrictMode>,
);
