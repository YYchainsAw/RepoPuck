import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

export type ShellMode = "puck" | "top-island" | "top-drawer";
export type PanelPhase = "hidden" | "opening" | "open" | "closing";
export type PanelTransitionDirection = "open" | "close";
export type PanelTransitionAnimation =
  | "corner-scale"
  | "island-drop"
  | "drawer-roll";
export type PanelAnchor =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "top-center";
export type DockCorner = Exclude<PanelAnchor, "top-center">;

export interface NativeShellStateSnapshot {
  mode: ShellMode;
  panelPhase: PanelPhase;
  transitionId: number | null;
  activeMonitorName: string | null;
  dockCorner: DockCorner | null;
}

export interface NativePanelTransition {
  transitionId: number;
  mode: ShellMode;
  direction: PanelTransitionDirection;
  animation: PanelTransitionAnimation;
  anchor: PanelAnchor;
  durationMs: number;
}

interface NativeShellStateListeners {
  onStateChanged(state: NativeShellStateSnapshot): void;
  onPanelTransition(transition: NativePanelTransition): void;
}

export interface NativeShellStateClient {
  getState(): Promise<NativeShellStateSnapshot>;
  setMode(mode: ShellMode): Promise<void>;
  completeTransition(transitionId: number): Promise<void>;
  listen(listeners: NativeShellStateListeners): Promise<() => void>;
}

export const DEFAULT_NATIVE_SHELL_STATE: NativeShellStateSnapshot = {
  mode: "puck",
  panelPhase: "hidden",
  transitionId: null,
  activeMonitorName: null,
  dockCorner: null,
};

const shellModes = new Set<ShellMode>(["puck", "top-island", "top-drawer"]);
const panelPhases = new Set<PanelPhase>(["hidden", "opening", "open", "closing"]);
const transitionDirections = new Set<PanelTransitionDirection>(["open", "close"]);
const transitionAnimations = new Set<PanelTransitionAnimation>([
  "corner-scale",
  "island-drop",
  "drawer-roll",
]);
const panelAnchors = new Set<PanelAnchor>([
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
  "top-center",
]);
const dockCorners = new Set<DockCorner>([
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const finiteTransitionId = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;

const nullableString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

export const isShellMode = (value: unknown): value is ShellMode =>
  shellModes.has(value as ShellMode);

export function normalizeNativeShellState(
  value: unknown,
): NativeShellStateSnapshot {
  if (!isRecord(value)) return { ...DEFAULT_NATIVE_SHELL_STATE };
  return {
    mode: isShellMode(value.mode) ? value.mode : "puck",
    panelPhase: panelPhases.has(value.panelPhase as PanelPhase)
      ? (value.panelPhase as PanelPhase)
      : "hidden",
    transitionId: finiteTransitionId(value.transitionId),
    activeMonitorName: nullableString(value.activeMonitorName),
    dockCorner: dockCorners.has(value.dockCorner as DockCorner)
      ? (value.dockCorner as DockCorner)
      : null,
  };
}

export function normalizePanelTransition(
  value: unknown,
): NativePanelTransition | null {
  if (!isRecord(value)) return null;
  const transitionId = finiteTransitionId(value.transitionId);
  if (transitionId === null) return null;
  const mode = isShellMode(value.mode) ? value.mode : "puck";
  const fallbackAnimation: PanelTransitionAnimation =
    mode === "top-island"
      ? "island-drop"
      : mode === "top-drawer"
        ? "drawer-roll"
        : "corner-scale";
  return {
    transitionId,
    mode,
    direction: transitionDirections.has(
      value.direction as PanelTransitionDirection,
    )
      ? (value.direction as PanelTransitionDirection)
      : "open",
    animation: transitionAnimations.has(
      value.animation as PanelTransitionAnimation,
    )
      ? (value.animation as PanelTransitionAnimation)
      : fallbackAnimation,
    anchor: panelAnchors.has(value.anchor as PanelAnchor)
      ? (value.anchor as PanelAnchor)
      : mode === "puck"
        ? "top-right"
        : "top-center",
    durationMs:
      typeof value.durationMs === "number" && Number.isFinite(value.durationMs)
        ? Math.min(1_000, Math.max(0, Math.round(value.durationMs)))
        : 160,
  };
}

const isTauriRuntime = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const browserClient: NativeShellStateClient = {
  getState: async () => ({ ...DEFAULT_NATIVE_SHELL_STATE }),
  setMode: async () => undefined,
  completeTransition: async () => undefined,
  listen: async () => () => undefined,
};

export function createNativeShellStateClient(): NativeShellStateClient {
  if (!isTauriRuntime()) return browserClient;
  return {
    async getState() {
      return normalizeNativeShellState(await invoke<unknown>("get_shell_state"));
    },
    setMode: (mode) => invoke("set_shell_mode", { mode }),
    completeTransition: (transitionId) =>
      invoke("complete_panel_transition", { transitionId }),
    async listen(listeners) {
      const unlisten = await Promise.all([
        listen<unknown>("shell_state_changed", (event) =>
          listeners.onStateChanged(normalizeNativeShellState(event.payload)),
        ),
        listen<unknown>("panel_transition", (event) => {
          const transition = normalizePanelTransition(event.payload);
          if (transition) listeners.onPanelTransition(transition);
        }),
      ]);
      return () => unlisten.forEach((stop) => stop());
    },
  };
}

export async function loadInitialNativeShellState(): Promise<NativeShellStateSnapshot> {
  try {
    return await createNativeShellStateClient().getState();
  } catch {
    return { ...DEFAULT_NATIVE_SHELL_STATE };
  }
}

export interface NativeShellStateValue {
  state: NativeShellStateSnapshot;
  transition: NativePanelTransition | null;
  modePending: boolean;
  modeError: string | null;
  setMode(mode: ShellMode): Promise<void>;
  completeTransition(transitionId: number): Promise<void>;
}

const defaultValue: NativeShellStateValue = {
  state: DEFAULT_NATIVE_SHELL_STATE,
  transition: null,
  modePending: false,
  modeError: null,
  setMode: async () => undefined,
  completeTransition: async () => undefined,
};

const NativeShellStateContext = createContext<NativeShellStateValue>(defaultValue);

interface NativeShellStateProviderProps extends PropsWithChildren {
  initialState?: NativeShellStateSnapshot;
  client?: NativeShellStateClient;
}

export function NativeShellStateProvider({
  children,
  initialState = DEFAULT_NATIVE_SHELL_STATE,
  client: injectedClient,
}: NativeShellStateProviderProps) {
  const client = useMemo(
    () => injectedClient ?? createNativeShellStateClient(),
    [injectedClient],
  );
  const [state, setState] = useState(() => normalizeNativeShellState(initialState));
  const [transition, setTransition] = useState<NativePanelTransition | null>(null);
  const [modePending, setModePending] = useState(false);
  const [modeError, setModeError] = useState<string | null>(null);
  const modeQueue = useRef<Promise<void>>(Promise.resolve());
  const modeRevision = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.shellMode = state.mode;
  }, [state.mode]);

  useEffect(() => {
    let active = true;
    let stateRevision = 0;
    let stopListening: (() => void) | undefined;

    const connect = async () => {
      try {
        const stop = await client.listen({
          onStateChanged: (next) => {
            stateRevision += 1;
            if (active) setState(next);
          },
          onPanelTransition: (next) => {
            if (active) setTransition(next);
          },
        });
        if (!active) {
          stop();
          return;
        }
        stopListening = stop;
      } catch {
        // A one-time state query still keeps the shell usable without events.
      }

      const queriedAtRevision = stateRevision;
      try {
        const next = await client.getState();
        if (active && stateRevision === queriedAtRevision) setState(next);
      } catch {
        // Keep the initial safe state if the native host is unavailable.
      }
    };

    void connect();
    return () => {
      active = false;
      stopListening?.();
    };
  }, [client]);

  const setMode = useCallback(
    (mode: ShellMode) => {
      const revision = ++modeRevision.current;
      if (mounted.current) {
        setModePending(true);
        setModeError(null);
      }

      const run = async () => {
        await client.setMode(mode);
        // Rust owns persistence and normalization. Read back its accepted state
        // instead of making the selected mode optimistic in React.
        const next = await client.getState();
        if (mounted.current && revision === modeRevision.current) setState(next);
      };
      const request = modeQueue.current.then(run, run);
      modeQueue.current = request.catch(() => undefined);
      return request
        .catch(() => {
          if (mounted.current && revision === modeRevision.current) {
            setModeError("RepoPuck could not change the launch mode.");
          }
        })
        .finally(() => {
          if (mounted.current && revision === modeRevision.current) {
            setModePending(false);
          }
        });
    },
    [client],
  );

  const completeTransition = useCallback(
    async (transitionId: number) => {
      await client.completeTransition(transitionId);
      setTransition((current) =>
        current?.transitionId === transitionId ? null : current,
      );
    },
    [client],
  );

  const value = useMemo<NativeShellStateValue>(
    () => ({
      state,
      transition,
      modePending,
      modeError,
      setMode,
      completeTransition,
    }),
    [completeTransition, modeError, modePending, setMode, state, transition],
  );

  return (
    <NativeShellStateContext.Provider value={value}>
      {children}
    </NativeShellStateContext.Provider>
  );
}

export function useNativeShellState(): NativeShellStateValue {
  return useContext(NativeShellStateContext);
}
