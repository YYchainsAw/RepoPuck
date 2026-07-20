import { useEffect, useRef } from "react";
import { GitProvider } from "./features/git/GitProvider";
import { useGitWorkspace } from "./features/git/useGitWorkspace";
import { PanelShell } from "./features/shell/PanelShell";
import { Puck } from "./features/shell/Puck";
import { createNativeShellClient } from "./features/shell/nativeClient";
import { ShellSettingsProvider } from "./features/shell/ShellSettingsProvider";
import {
  DEFAULT_SHELL_SETTINGS,
  type ShellSettings,
} from "./features/shell/settings";

export type WindowView = "panel" | "puck";

export function getWindowView(search = window.location.search): WindowView {
  return new URLSearchParams(search).get("view") === "puck" ? "puck" : "panel";
}

interface AppProps {
  view?: WindowView;
  initialSettings?: ShellSettings;
}

function PuckWindow() {
  const workspace = useGitWorkspace();
  const nativeClient = useRef(createNativeShellClient()).current;

  useEffect(() => {
    let active = true;
    let stopListening: (() => void) | undefined;
    void nativeClient
      .listen({
        onRefreshRequested: () => void workspace.refresh(),
        onOpenSettingsRequested: () => undefined,
      })
      .then((stop) => {
        if (active) stopListening = stop;
        else stop();
      })
      .catch(() => undefined);
    return () => {
      active = false;
      stopListening?.();
    };
  }, [nativeClient, workspace.refresh]);

  return <Puck changeCount={workspace.snapshot?.changes.length ?? 0} client={nativeClient} />;
}

export function App({
  view = getWindowView(),
  initialSettings = DEFAULT_SHELL_SETTINGS,
}: AppProps) {
  return (
    <ShellSettingsProvider initialSettings={initialSettings}>
      <GitProvider>{view === "puck" ? <PuckWindow /> : <PanelShell />}</GitProvider>
    </ShellSettingsProvider>
  );
}
