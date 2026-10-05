import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { startInput } from "./input/gamepad.ts";
import { startNavigation } from "./input/navigation.ts";
import "./theme.css";

startInput();
startNavigation();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
