import { lazy, Suspense } from "react";
import { PuckWindow } from "./features/shell/PuckWindow";
import { ShellSettingsProvider } from "./features/shell/ShellSettingsProvider";
import {
  DEFAULT_SHELL_SETTINGS,
  type ShellSettings,
} from "./features/shell/settings";
import {
  DEFAULT_NATIVE_SHELL_STATE,
  NativeShellStateProvider,
  type NativeShellStateSnapshot,
} from "./features/shell/useNativeShellState";

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
  initialNativeShellState?: NativeShellStateSnapshot;
}

export function App({
  view = getWindowView(),
  initialSettings = DEFAULT_SHELL_SETTINGS,
  initialNativeShellState = DEFAULT_NATIVE_SHELL_STATE,
}: AppProps) {
  return (
    <NativeShellStateProvider initialState={initialNativeShellState}>
      <ShellSettingsProvider initialSettings={initialSettings}>
        {view === "puck" ? (
          <PuckWindow />
        ) : (
          <Suspense fallback={null}>
            <PanelWindow />
          </Suspense>
        )}
      </ShellSettingsProvider>
    </NativeShellStateProvider>
  );
}
