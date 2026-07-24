// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ShellSettingsProvider, useShellSettings } from "./ShellSettingsProvider";
import type { ShellSettingsPersistence } from "./settings";

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
