// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { INTERFACE_LANGUAGE_CHANGED_EVENT } from "../../i18n";
import { ShellSettingsProvider, useShellSettings } from "./ShellSettingsProvider";
import type { ShellSettingsPersistence } from "./settings";

const eventApi = vi.hoisted(() => ({
  emit: vi.fn().mockResolvedValue(undefined),
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => eventApi);

beforeEach(() => {
  eventApi.emit.mockReset().mockResolvedValue(undefined);
  eventApi.listen.mockReset().mockResolvedValue(() => undefined);
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
});

function ColorModeProbe() {
  const { colorMode } = useShellSettings();
  return <output>{colorMode}</output>;
}

function AISettingsProbe() {
  const { settings, setAiCommitPreferences } = useShellSettings();
  return (
    <>
      <output aria-label="AI language">{settings.aiCommit?.language}</output>
      <button
        type="button"
        onClick={() =>
          setAiCommitPreferences({
            baseUrl: "https://example.test/v1",
            model: "example-mini",
            language: "en",
            commitType: "fix",
            scope: "ui",
          })
        }
      >
        Update AI preferences
      </button>
    </>
  );
}

function LanguageSettingsProbe() {
  const { settings, setLanguage } = useShellSettings();
  return (
    <>
      <output aria-label="UI language">{settings.language ?? "system"}</output>
      <button type="button" onClick={() => setLanguage("zh-CN")}>
        Use Chinese
      </button>
    </>
  );
}

it("reactively resolves system theme changes for shell consumers", () => {
  let listener: ((event: MediaQueryListEvent) => void) | undefined;
  const matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn((_type: string, callback: (event: MediaQueryListEvent) => void) => {
      listener = callback;
    }),
    removeEventListener: vi.fn(),
  });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: matchMedia });

  render(
    <ShellSettingsProvider
      initialSettings={{ theme: "system", pinned: false, recentRepositories: [] }}
    >
      <ColorModeProbe />
    </ShellSettingsProvider>,
  );

  expect(screen.getByRole("status")).toHaveTextContent("light");
  expect(document.documentElement).toHaveAttribute("data-color-mode", "light");
  expect(document.documentElement).toHaveAttribute("data-light-theme", "light");
  expect(document.documentElement).toHaveAttribute("data-dark-theme", "dark");
  act(() => listener?.({ matches: true } as MediaQueryListEvent));
  expect(screen.getByRole("status")).toHaveTextContent("dark");
  expect(document.documentElement).toHaveAttribute("data-color-mode", "dark");
});

it("persists non-secret AI commit preferences without an API key field", () => {
  const persistence: ShellSettingsPersistence = {
    save: vi.fn().mockResolvedValue(undefined),
  };
  render(
    <ShellSettingsProvider
      initialSettings={{
        theme: "light",
        pinned: false,
        recentRepositories: [],
      }}
      persistence={persistence}
    >
      <AISettingsProbe />
    </ShellSettingsProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Update AI preferences" }));

  expect(screen.getByRole("status", { name: "AI language" })).toHaveTextContent("en");
  expect(persistence.save).toHaveBeenLastCalledWith({
    theme: "light",
    pinned: false,
    recentRepositories: [],
    aiCommit: {
      baseUrl: "https://example.test/v1",
      model: "example-mini",
      language: "en",
      commitType: "fix",
      scope: "ui",
    },
  });
  expect(JSON.stringify(vi.mocked(persistence.save).mock.calls)).not.toContain("apiKey");
});

it("updates and persists the manual UI language preference", () => {
  const persistence: ShellSettingsPersistence = {
    save: vi.fn().mockResolvedValue(undefined),
  };
  render(
    <ShellSettingsProvider
      initialSettings={{
        theme: "light",
        pinned: false,
        recentRepositories: [],
        language: "system",
      }}
      persistence={persistence}
    >
      <LanguageSettingsProbe />
    </ShellSettingsProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Use Chinese" }));

  expect(screen.getByRole("status", { name: "UI language" })).toHaveTextContent(
    "zh-CN",
  );
  expect(persistence.save).toHaveBeenLastCalledWith({
    theme: "light",
    pinned: false,
    recentRepositories: [],
    language: "zh-CN",
  });
  expect(eventApi.emit).not.toHaveBeenCalled();
});

it("broadcasts a validated language payload immediately in Tauri", async () => {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: {},
  });
  const persistence: ShellSettingsPersistence = {
    save: vi.fn().mockImplementation(() => new Promise<void>(() => undefined)),
  };
  render(
    <ShellSettingsProvider
      initialSettings={{
        theme: "light",
        pinned: false,
        recentRepositories: [],
        language: "system",
      }}
      persistence={persistence}
    >
      <LanguageSettingsProbe />
    </ShellSettingsProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Use Chinese" }));

  await waitFor(() =>
    expect(eventApi.emit).toHaveBeenCalledWith(
      INTERFACE_LANGUAGE_CHANGED_EVENT,
      { preference: "zh-CN", resolved: "zh-CN" },
    ),
  );
  expect(persistence.save).toHaveBeenCalledOnce();
});

it("receives valid cross-WebView language changes and cleans up the listener", async () => {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: {},
  });
  const unlisten = vi.fn();
  let handleEvent: ((event: { payload: unknown }) => void) | undefined;
  eventApi.listen.mockImplementation(
    async (_eventName: string, handler: (event: { payload: unknown }) => void) => {
      handleEvent = handler;
      return unlisten;
    },
  );
  const persistence: ShellSettingsPersistence = {
    save: vi.fn().mockResolvedValue(undefined),
  };
  const view = render(
    <ShellSettingsProvider
      initialSettings={{
        theme: "light",
        pinned: false,
        recentRepositories: [],
        language: "en",
      }}
      persistence={persistence}
    >
      <LanguageSettingsProbe />
    </ShellSettingsProvider>,
  );

  await waitFor(() =>
    expect(eventApi.listen).toHaveBeenCalledWith(
      INTERFACE_LANGUAGE_CHANGED_EVENT,
      expect.any(Function),
    ),
  );

  act(() =>
    handleEvent?.({
      payload: { preference: "fr", resolved: "en" },
    }),
  );
  expect(screen.getByRole("status", { name: "UI language" })).toHaveTextContent("en");

  act(() =>
    handleEvent?.({
      payload: { preference: "en", resolved: "zh-CN" },
    }),
  );
  expect(screen.getByRole("status", { name: "UI language" })).toHaveTextContent("en");

  act(() =>
    handleEvent?.({
      payload: { preference: "system", resolved: "zh-CN" },
    }),
  );
  expect(screen.getByRole("status", { name: "UI language" })).toHaveTextContent(
    "system",
  );
  expect(persistence.save).not.toHaveBeenCalled();

  view.unmount();
  expect(unlisten).toHaveBeenCalledOnce();
});
