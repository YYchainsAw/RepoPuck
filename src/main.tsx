import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App, getWindowView } from "./App";
import {
  applyThemePreference,
  loadShellSettings,
} from "./features/shell/settings";
import "./styles/tokens.css";
import "./styles/global.css";

async function renderApp() {
  const settings = await loadShellSettings();
  const view = getWindowView();
  applyThemePreference(settings.theme);
  document.documentElement.dataset.windowView = view;
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App view={view} initialSettings={settings} />
    </StrictMode>,
  );
}

void renderApp();
