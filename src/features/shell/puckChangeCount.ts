import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface PuckChangeCountClient {
  getChangeCount(): Promise<number>;
}

interface UsePuckChangeCountOptions {
  client?: PuckChangeCountClient;
  pollIntervalMs?: number;
}

interface CountFlight {
  client: PuckChangeCountClient;
  generation: number;
  promise: Promise<void>;
}

const DEMO_CHANGE_COUNT = 2;
const DEFAULT_POLL_INTERVAL_MS = 30_000;
const isTauriRuntime = () => "__TAURI_INTERNALS__" in window;

export function createPuckChangeCountClient(): PuckChangeCountClient {
  if (!isTauriRuntime()) {
    return { getChangeCount: async () => DEMO_CHANGE_COUNT };
  }
  return { getChangeCount: () => invoke<number>("get_change_count") };
}

const normalizeCount = (count: number) =>
  Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;

export function usePuckChangeCount({
  client: injectedClient,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: UsePuckChangeCountOptions = {}) {
  const client = useMemo(
    () => injectedClient ?? createPuckChangeCountClient(),
    [injectedClient],
  );
  const [changeCount, setChangeCount] = useState(0);
  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  const clientRef = useRef(client);
  const inFlightRef = useRef<CountFlight | null>(null);
  clientRef.current = client;

  const refresh = useCallback((): Promise<void> => {
    if (!mountedRef.current) return Promise.resolve();
    const generation = generationRef.current;
    const targetClient = clientRef.current;
    const existing = inFlightRef.current;
    if (
      existing?.client === targetClient &&
      existing.generation === generation
    ) {
      return existing.promise;
    }

    const flight: CountFlight = {
      client: targetClient,
      generation,
      promise: Promise.resolve(),
    };
    flight.promise = targetClient
      .getChangeCount()
      .then((count) => {
        if (
          mountedRef.current &&
          clientRef.current === targetClient &&
          generationRef.current === generation
        ) {
          setChangeCount(normalizeCount(count));
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (inFlightRef.current === flight) inFlightRef.current = null;
      });
    inFlightRef.current = flight;
    return flight.promise;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    generationRef.current += 1;
    void refresh();
    const timer = window.setInterval(() => void refresh(), pollIntervalMs);
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      inFlightRef.current = null;
      window.clearInterval(timer);
    };
  }, [client, pollIntervalMs, refresh]);

  return { changeCount, refresh };
}
