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

interface PendingCountRefresh {
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
  const pendingRefreshRef = useRef<PendingCountRefresh | null>(null);
  clientRef.current = client;

  const performRefresh = useCallback((): Promise<void> => {
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

  const refresh = useCallback((): Promise<void> => {
    if (!mountedRef.current) return Promise.resolve();
    const generation = generationRef.current;
    const targetClient = clientRef.current;
    const existing = inFlightRef.current;
    if (
      existing?.client !== targetClient ||
      existing.generation !== generation
    ) {
      return performRefresh();
    }

    const pending = pendingRefreshRef.current;
    if (
      pending?.client === targetClient &&
      pending.generation === generation
    ) {
      return pending.promise;
    }

    const followUp = existing.promise.then(() => {
      if (pendingRefreshRef.current?.promise === followUp) {
        pendingRefreshRef.current = null;
      }
      if (
        !mountedRef.current ||
        clientRef.current !== targetClient ||
        generationRef.current !== generation
      ) {
        return;
      }
      return performRefresh();
    });
    pendingRefreshRef.current = {
      client: targetClient,
      generation,
      promise: followUp,
    };
    return followUp;
  }, [performRefresh]);

  useEffect(() => {
    mountedRef.current = true;
    generationRef.current += 1;
    pendingRefreshRef.current = null;
    void performRefresh();
    const timer = window.setInterval(
      () => void performRefresh(),
      pollIntervalMs,
    );
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      inFlightRef.current = null;
      pendingRefreshRef.current = null;
      window.clearInterval(timer);
    };
  }, [client, performRefresh, pollIntervalMs]);

  return { changeCount, refresh };
}
