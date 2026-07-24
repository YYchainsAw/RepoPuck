import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { GitProvider } from "../git/GitProvider";
import { PanelResizeHandles } from "./PanelResizeHandles";
import {
  useNativeShellState,
  type PanelAnchor,
} from "./useNativeShellState";

const PANEL_POLL_INTERVAL_MS = 10_000;
const PanelShell = lazy(async () => {
  const module = await import("./PanelShell");
  return { default: module.PanelShell };
});

const isTauriRuntime = () => "__TAURI_INTERNALS__" in window;

const isPanelAnchor = (value: unknown): value is PanelAnchor =>
  value === "top-left" ||
  value === "top-right" ||
  value === "bottom-left" ||
  value === "bottom-right" ||
  value === "top-center";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = (event: MediaQueryListEvent) => setReduced(event.matches);
    setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reduced;
}

export function PanelWindow() {
  const browserPreview = !isTauriRuntime();
  const nativeShell = useNativeShellState();
  const reducedMotion = usePrefersReducedMotion();
  const [visible, setVisible] = useState(
    browserPreview || nativeShell.state.panelPhase !== "hidden",
  );
  const [revealed, setRevealed] = useState(
    browserPreview || nativeShell.state.panelPhase !== "hidden",
  );
  const [fallbackAnchor, setFallbackAnchor] =
    useState<PanelAnchor>("top-right");
  const [legacyOpening, setLegacyOpening] = useState(false);
  const completedTransitions = useRef(new Set<number>());
  const useLegacyVisibilityQuery = useRef(
    nativeShell.state.mode === "puck" &&
      nativeShell.state.panelPhase === "hidden" &&
      nativeShell.state.transitionId === null,
  ).current;

  const transition = nativeShell.transition;
  const mode = transition?.mode ?? nativeShell.state.mode;
  const closing =
    transition?.direction === "close" ||
    nativeShell.state.panelPhase === "closing";
  const anchor =
    transition?.anchor ??
    nativeShell.state.dockCorner ??
    (mode === "puck" ? fallbackAnchor : "top-center");

  useEffect(() => {
    if (browserPreview) return;
    if (nativeShell.state.panelPhase === "hidden") {
      setVisible(false);
      setRevealed(false);
      setLegacyOpening(false);
    } else {
      setVisible(true);
      setRevealed(true);
    }
  }, [browserPreview, nativeShell.state.panelPhase]);

  useEffect(() => {
    if (!legacyOpening) return;
    const timer = window.setTimeout(() => setLegacyOpening(false), 180);
    return () => window.clearTimeout(timer);
  }, [fallbackAnchor, legacyOpening]);

  // Keep the v0.1 visibility events as a safe fallback while native hosts
  // migrate to the richer shell-state and panel-transition protocol.
  useEffect(() => {
    if (!isTauriRuntime()) return;

    let active = true;
    let visibilityRevision = 0;
    const stopListening: Array<() => void> = [];
    const connect = async () => {
      try {
        const stop = await listen<PanelAnchor>("panel_opened", (event) => {
          if (!isPanelAnchor(event.payload)) return;
          visibilityRevision += 1;
          if (!active) return;
          setFallbackAnchor(event.payload);
          setVisible(true);
          setRevealed(true);
          setLegacyOpening(true);
        });
        if (!active) stop();
        else stopListening.push(stop);
      } catch {
        // Transition events are the primary path in current native hosts.
      }

      try {
        const stop = await listen<boolean>("panel_visibility_changed", (event) => {
          visibilityRevision += 1;
          if (!active) return;
          setVisible(event.payload);
          setRevealed(event.payload);
          if (!event.payload) setLegacyOpening(false);
        });
        if (!active) {
          stop();
          return;
        }
        stopListening.push(stop);
      } catch {
        if (active) setVisible(true);
        return;
      }

      if (!useLegacyVisibilityQuery) return;
      const queriedAtRevision = visibilityRevision;
      try {
        const currentVisible = await getCurrentWindow().isVisible();
        if (active && visibilityRevision === queriedAtRevision) {
          setVisible(currentVisible);
          setRevealed(currentVisible);
        }
      } catch {
        if (active && visibilityRevision === queriedAtRevision) setVisible(true);
      }
    };

    void connect();
    return () => {
      active = false;
      stopListening.forEach((stop) => stop());
    };
  }, [useLegacyVisibilityQuery]);

  const finishTransition = useCallback(() => {
    if (!transition || completedTransitions.current.has(transition.transitionId)) {
      return;
    }
    completedTransitions.current.add(transition.transitionId);
    void nativeShell.completeTransition(transition.transitionId).catch(() => {
      completedTransitions.current.delete(transition.transitionId);
    });
  }, [nativeShell, transition]);

  useEffect(() => {
    if (!transition) return;
    setVisible(true);
    setRevealed(true);
    if (reducedMotion || transition.durationMs === 0) {
      let active = true;
      queueMicrotask(() => {
        if (active) finishTransition();
      });
      return () => {
        active = false;
      };
    }
    const timer = window.setTimeout(
      finishTransition,
      transition.durationMs + 100,
    );
    return () => window.clearTimeout(timer);
  }, [finishTransition, reducedMotion, transition]);

  const transitionClasses = transition
    ? ` panel-window-content--transitioning panel-window-content--${transition.direction === "open" ? "opening" : "closing"} panel-window-content--${transition.animation}`
    : legacyOpening
      ? " panel-window-content--transitioning panel-window-content--opening panel-window-content--corner-scale"
      : "";

  return (
    <GitProvider visible={visible} pollIntervalMs={PANEL_POLL_INTERVAL_MS}>
      <div
        className={`panel-window-frame panel-window-frame--${anchor}`}
        data-panel-mode={mode}
      >
        <div
          className={`panel-window-content${revealed ? "" : " panel-window-content--concealed"}${transitionClasses}`}
          data-open-corner={anchor}
          data-panel-mode={mode}
          data-panel-phase={nativeShell.state.panelPhase}
          data-transition-direction={transition?.direction}
          style={
            transition
              ? { animationDuration: `${transition.durationMs}ms` }
              : undefined
          }
          onAnimationEnd={(event) => {
            if (event.currentTarget === event.target) finishTransition();
          }}
        >
          <Suspense fallback={null}>
            <PanelShell />
          </Suspense>
        </div>
        {!closing && (
          <PanelResizeHandles
            disabledDirections={
              mode === "puck"
                ? undefined
                : ["North", "NorthEast", "NorthWest"]
            }
          />
        )}
      </div>
    </GitProvider>
  );
}
