import { createDemoGitClient } from "./demoClient";
import { createTauriGitClient } from "./tauriClient";
import type { GitClient } from "./types";

export type GitClientRuntime = "browser" | "tauri";

export interface CreateGitClientOptions {
  runtime?: GitClientRuntime;
}

const clientFactories: Record<GitClientRuntime, () => GitClient> = {
  browser: createDemoGitClient,
  tauri: createTauriGitClient,
};

function detectRuntime(): GitClientRuntime {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
    ? "tauri"
    : "browser";
}

export function createGitClient(options: CreateGitClientOptions = {}): GitClient {
  const runtime = options.runtime ?? detectRuntime();

  return clientFactories[runtime]();
}

export type {
  BranchSummary,
  ChangeEntry,
  GitClient,
  OperationResult,
  RepositorySnapshot,
} from "./types";
