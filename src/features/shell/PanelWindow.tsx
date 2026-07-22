import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { lazy, Suspense, useEffect, useState } from "react";
import { GitProvider } from "../git/GitProvider";
import { PanelResizeHandles } from "./PanelResizeHandles";

const PANEL_POLL_INTERVAL_MS = 10_000;
const PanelShell = lazy(async () => {
  const module = await import("./PanelShell");
  return { default: module.PanelShell };
});

const isTauriRuntime = () => "__TAURI_INTERNALS__" in window;

type PanelCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

const isPanelCorner = (value: unknown): value is PanelCorner =>
  value === "top-left" ||
  value === "top-right" ||
  value === "bottom-left" ||
  value === "bottom-right";

export function PanelWindow() {
  const browserPreview = !isTauriRuntime();
  const [visible, setVisible] = useState(browserPreview);
  const [revealed, setRevealed] = useState(browserPreview);
  const [openCorner, setOpenCorner] = useState<PanelCorner>("top-right");
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (!opening) return;
    const timer = window.setTimeout(() => setOpening(false), 180);
    return () => window.clearTimeout(timer);
  }, [openCorner, opening]);

  useEffect(() => {
    if (!isTauriRuntime()) return;

    let active = true;
    let visibilityRevision = 0;
    const stopListening: Array<() => void> = [];
    const connect = async () => {
      try {
        const stop = await listen<PanelCorner>("panel_opened", (event) => {
          if (!isPanelCorner(event.payload)) return;
          visibilityRevision += 1;
          if (!active) return;
          setOpenCorner(event.payload);
          setVisible(true);
          setRevealed(true);
          setOpening(true);
        });
        if (!active) {
          stop();
          return;
        }
        stopListening.push(stop);
      } catch {
        // Placement animation is optional; visibility observation still works.
      }

      try {
        const stop = await listen<boolean>("panel_visibility_changed", (event) => {
          visibilityRevision += 1;
          if (!active) return;
          setVisible(event.payload);
          if (event.payload) {
            // Fallback for a host that cannot deliver panel_opened. In the
            // normal path the earlier panel_opened event starts the animation.
            setRevealed(true);
          } else {
            setRevealed(false);
            setOpening(false);
          }
        });
        if (!active) {
          stop();
          return;
        }
        stopListening.push(stop);
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
          setRevealed(currentVisible);
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
      stopListening.forEach((stop) => stop());
    };
  }, []);

  return (
    <GitProvider visible={visible} pollIntervalMs={PANEL_POLL_INTERVAL_MS}>
      <div className={`panel-window-frame panel-window-frame--${openCorner}`}>
        <div
          className={`panel-window-content${revealed ? "" : " panel-window-content--concealed"}${opening ? " panel-window-content--opening" : ""}`}
          data-open-corner={openCorner}
        >
          <Suspense fallback={null}>
            <PanelShell />
          </Suspense>
        </div>
        <PanelResizeHandles />
      </div>
    </GitProvider>
  );
}
