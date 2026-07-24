// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
  ShellSettingsProvider,
  useShellSettings,
} from "./ShellSettingsProvider";
import { SettingsDialog } from "./SettingsDialog";
import type { ShellSettingsPersistence } from "./settings";

function Harness({
  onOpenRecent = vi.fn(),
  shellMode = "puck",
  shellModePending = false,
  shellModeError = null,
  onShellModeChange = vi.fn(),
}: {
  onOpenRecent?: (path: string) => void;
  shellMode?: "puck" | "top-island" | "top-drawer";
  shellModePending?: boolean;
  shellModeError?: string | null;
  onShellModeChange?: (mode: "puck" | "top-island" | "top-drawer") => void;
}) {
  const settings = useShellSettings();
  return (
    <SettingsDialog
      open
      settings={settings.settings}
      shellMode={shellMode}
      shellModePending={shellModePending}
      shellModeError={shellModeError}
      onShellModeChange={onShellModeChange}
      onThemeChange={settings.setTheme}
      onPinnedChange={settings.setPinned}
      onClearRecent={settings.clearRecentRepositories}
      onOpenRecent={onOpenRecent}
      onClose={vi.fn()}
    />
  );
}

it("offers three accessible launch modes and applies a selection immediately", () => {
  const onShellModeChange = vi.fn();
  render(
    <ShellSettingsProvider
      initialSettings={{ theme: "light", pinned: false, recentRepositories: [] }}
    >
      <Harness onShellModeChange={onShellModeChange} />
    </ShellSettingsProvider>,
  );

  expect(screen.getByRole("radiogroup", { name: "Launch mode" })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: /Floating puck/ })).toBeChecked();
  fireEvent.click(screen.getByRole("radio", { name: /Top island/ }));
  expect(onShellModeChange).toHaveBeenCalledWith("top-island");
});

it("explains and disables optional pinning in top modes", () => {
  render(
    <ShellSettingsProvider
      initialSettings={{ theme: "light", pinned: false, recentRepositories: [] }}
    >
      <Harness shellMode="top-drawer" />
    </ShellSettingsProvider>,
  );

  expect(screen.getByRole("checkbox", { name: /Keep panel on top/ })).toBeDisabled();
  expect(
    screen.getByText("Top modes stay above other windows by design."),
  ).toBeInTheDocument();
});

it("disables launch modes while applying and announces pending or failed changes", () => {
  const onShellModeChange = vi.fn();
  const renderSettings = (
    shellModePending: boolean,
    shellModeError: string | null,
  ) => (
    <ShellSettingsProvider
      initialSettings={{ theme: "light", pinned: false, recentRepositories: [] }}
    >
      <Harness
        shellModePending={shellModePending}
        shellModeError={shellModeError}
        onShellModeChange={onShellModeChange}
      />
    </ShellSettingsProvider>
  );
  const rendered = render(renderSettings(true, null));

  expect(screen.getByRole("radiogroup", { name: "Launch mode" })).toHaveAttribute(
    "aria-busy",
    "true",
  );
  expect(screen.getByRole("status")).toHaveTextContent("Applying launch mode");
  const radios = screen.getAllByRole("radio");
  radios.forEach((radio) => expect(radio).toBeDisabled());
  screen.getByRole<HTMLInputElement>("radio", { name: /Top island/ }).click();
  expect(onShellModeChange).not.toHaveBeenCalled();

  rendered.rerender(
    renderSettings(false, "RepoPuck could not change the launch mode."),
  );
  expect(screen.getByRole("radiogroup", { name: "Launch mode" })).toHaveAttribute(
    "aria-busy",
    "false",
  );
  screen.getAllByRole("radio").forEach((radio) => expect(radio).toBeEnabled());
  expect(screen.getByRole("alert")).toHaveTextContent(
    "RepoPuck could not change the launch mode.",
  );
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

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
