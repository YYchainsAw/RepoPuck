import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { lazy, Suspense, useEffect, useState } from "react";
import { GitProvider } from "../git/GitProvider";

const PANEL_POLL_INTERVAL_MS = 10_000;
const PanelShell = lazy(async () => {
  const module = await import("./PanelShell");
  return { default: module.PanelShell };
});

const isTauriRuntime = () => "__TAURI_INTERNALS__" in window;

export function PanelWindow() {
  const [visible, setVisible] = useState(() => !isTauriRuntime());

  useEffect(() => {
    if (!isTauriRuntime()) return;

    let active = true;
    let visibilityRevision = 0;
    let stopListening: (() => void) | undefined;
    const connect = async () => {
      try {
        const stop = await listen<boolean>("panel_visibility_changed", (event) => {
          visibilityRevision += 1;
          if (active) setVisible(event.payload);
        });
        if (!active) {
          stop();
          return;
        }
        stopListening = stop;
      } catch {
        // Keep the panel usable if native visibility observation is unavailable.
        if (active) setVisible(true);
        return;
      }

      const queriedAtRevision = visibilityRevision;
      try {
        const currentVisible = await getCurrentWindow().isVisible();
        if (active && visibilityRevision === queriedAtRevision) {
          setVisible(currentVisible);
        }
      } catch {
        if (active && visibilityRevision === queriedAtRevision) {
          setVisible(true);
        }
      }
    };

    void connect();
    return () => {
      active = false;
      stopListening?.();
    };
  }, []);

  return (
    <GitProvider visible={visible} pollIntervalMs={PANEL_POLL_INTERVAL_MS}>
      <Suspense fallback={null}>
        <PanelShell />
      </Suspense>
    </GitProvider>
  );
}
