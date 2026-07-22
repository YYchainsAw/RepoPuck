// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
  ShellSettingsProvider,
  useShellSettings,
} from "./ShellSettingsProvider";
import { SettingsDialog } from "./SettingsDialog";
import type { ShellSettingsPersistence } from "./settings";

function Harness({ onOpenRecent = vi.fn() }: { onOpenRecent?: (path: string) => void }) {
  const settings = useShellSettings();
  return (
    <SettingsDialog
      open
      settings={settings.settings}
      onThemeChange={settings.setTheme}
      onPinnedChange={settings.setPinned}
      onClearRecent={settings.clearRecentRepositories}
      onOpenRecent={onOpenRecent}
      onClose={vi.fn()}
    />
  );
}

it("persists theme and pin choices", async () => {
  const persistence: ShellSettingsPersistence = {
    save: vi.fn().mockResolvedValue(undefined),
  };
  render(
    <ShellSettingsProvider
      initialSettings={{
        theme: "system",
        pinned: false,
        recentRepositories: [],
      }}
      persistence={persistence}
    >
      <Harness />
    </ShellSettingsProvider>,
  );

  fireEvent.change(screen.getByRole("combobox", { name: "Theme" }), {
    target: { value: "dark" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "Keep panel on top" }));

  await waitFor(() =>
    expect(persistence.save).toHaveBeenLastCalledWith({
      theme: "dark",
      pinned: true,
      recentRepositories: [],
    }),
  );
});

it("opens and clears a bounded recent repository list", async () => {
  const onOpenRecent = vi.fn();
  const persistence: ShellSettingsPersistence = {
    save: vi.fn().mockResolvedValue(undefined),
  };
  render(
    <ShellSettingsProvider
      initialSettings={{
        theme: "light",
        pinned: true,
        recentRepositories: ["C:\\work\\one", "C:\\work\\two"],
      }}
      persistence={persistence}
    >
      <Harness onOpenRecent={onOpenRecent} />
    </ShellSettingsProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Open C:\\work\\two" }));
  expect(onOpenRecent).toHaveBeenCalledWith("C:\\work\\two");

  fireEvent.click(screen.getByRole("button", { name: "Clear recent repositories" }));
  await waitFor(() =>
    expect(persistence.save).toHaveBeenLastCalledWith({
      theme: "light",
      pinned: true,
      recentRepositories: [],
    }),
  );
  expect(screen.getByText("No recent repositories.")).toBeInTheDocument();
});

it("keeps settings controls and recent repository rows at least 44 pixels tall", () => {
  render(
    <ShellSettingsProvider
      initialSettings={{
        theme: "system",
        pinned: false,
        recentRepositories: ["C:\\work\\one"],
      }}
    >
      <Harness />
    </ShellSettingsProvider>,
  );

  expect(getComputedStyle(screen.getByRole("combobox", { name: "Theme" })).minHeight).toBe(
    "44px",
  );
  expect(getComputedStyle(screen.getByRole("checkbox", { name: "Keep panel on top" }).closest("label")!).minHeight).toBe(
    "44px",
  );
  expect(getComputedStyle(screen.getByRole("button", { name: "Clear recent repositories" })).minHeight).toBe(
    "44px",
  );
  expect(getComputedStyle(screen.getByRole("button", { name: "Open C:\\work\\one" })).minHeight).toBe(
    "44px",
  );
});
