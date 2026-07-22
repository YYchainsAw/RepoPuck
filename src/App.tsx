import { lazy, Suspense } from "react";
import { PuckWindow } from "./features/shell/PuckWindow";
import { ShellSettingsProvider } from "./features/shell/ShellSettingsProvider";
import {
  DEFAULT_SHELL_SETTINGS,
  type ShellSettings,
} from "./features/shell/settings";

export type WindowView = "panel" | "puck";

const PanelWindow = lazy(async () => {
  const module = await import("./features/shell/PanelWindow");
  return { default: module.PanelWindow };
});

export function getWindowView(search = window.location.search): WindowView {
  return new URLSearchParams(search).get("view") === "puck" ? "puck" : "panel";
}

interface AppProps {
  view?: WindowView;
  initialSettings?: ShellSettings;
}

export function App({
  view = getWindowView(),
  initialSettings = DEFAULT_SHELL_SETTINGS,
}: AppProps) {
  return (
    <ShellSettingsProvider initialSettings={initialSettings}>
      {view === "puck" ? (
        <PuckWindow />
      ) : (
        <Suspense fallback={null}>
          <PanelWindow />
        </Suspense>
      )}
    </ShellSettingsProvider>
  );
}
