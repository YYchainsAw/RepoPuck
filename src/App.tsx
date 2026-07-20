import { GitProvider } from "./features/git/GitProvider";
import { PanelShell } from "./features/shell/PanelShell";

export function App() {
  return (
    <GitProvider>
      <PanelShell />
    </GitProvider>
  );
}
