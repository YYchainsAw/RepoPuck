import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App, getWindowView } from "./App";
import {
  applyThemePreference,
  loadShellSettings,
} from "./features/shell/settings";
import { loadInitialNativeShellState } from "./features/shell/useNativeShellState";
import "./styles/tokens.css";
import "./styles/global.css";

async function renderApp() {
  const [settings, nativeShellState] = await Promise.all([
    loadShellSettings(),
    loadInitialNativeShellState(),
  ]);
  const view = getWindowView();
  applyThemePreference(settings.theme);
  document.documentElement.dataset.windowView = view;
  document.documentElement.dataset.shellMode = nativeShellState.mode;
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App
        view={view}
        initialSettings={settings}
        initialNativeShellState={nativeShellState}
      />
    </StrictMode>,
  );
}

void renderApp();
