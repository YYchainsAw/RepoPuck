import { useEffect, useRef } from "react";
import { createNativeShellClient } from "./nativeClient";
import { Puck } from "./Puck";
import { usePuckChangeCount } from "./puckChangeCount";

const PUCK_POLL_INTERVAL_MS = 30_000;

export function PuckWindow() {
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

  return <Puck changeCount={changeCount} client={nativeClient} />;
}
