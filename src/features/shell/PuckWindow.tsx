import { useEffect, useRef } from "react";
import { createNativeShellClient } from "./nativeClient";
import { Puck } from "./Puck";
import { usePuckChangeCount } from "./puckChangeCount";
import { TopIsland } from "./TopIsland";
import { useNativeShellState, type ShellMode } from "./useNativeShellState";

const PUCK_POLL_INTERVAL_MS = 30_000;

export function PuckWindow() {
  const { state } = useNativeShellState();

  if (state.mode === "top-drawer") return null;

  return <ActiveLauncher mode={state.mode} expanded={state.panelPhase !== "hidden"} />;
}

interface ActiveLauncherProps {
  mode: Exclude<ShellMode, "top-drawer">;
  expanded: boolean;
}

function ActiveLauncher({ mode, expanded }: ActiveLauncherProps) {
  const nativeClient = useRef(createNativeShellClient()).current;
  const { changeCount, refresh } = usePuckChangeCount({
    pollIntervalMs: PUCK_POLL_INTERVAL_MS,
  });

  useEffect(() => {
    let active = true;
    let stopListening: (() => void) | undefined;
    void nativeClient
      .listen({
        onRefreshRequested: () => void refresh(),
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
  }, [nativeClient, refresh]);

  return mode === "top-island" ? (
    <TopIsland
      changeCount={changeCount}
      expanded={expanded}
      client={nativeClient}
    />
  ) : (
    <Puck changeCount={changeCount} expanded={expanded} client={nativeClient} />
  );
}
