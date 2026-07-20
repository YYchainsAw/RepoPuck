import { GitProvider } from "./features/git/GitProvider";
import { useGitWorkspace } from "./features/git/useGitWorkspace";
import { PanelShell } from "./features/shell/PanelShell";
import { Puck } from "./features/shell/Puck";
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
  return <Puck changeCount={workspace.snapshot?.changes.length ?? 0} />;
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
