// @vitest-environment jsdom

import { act, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ShellSettingsProvider, useShellSettings } from "./ShellSettingsProvider";

function ColorModeProbe() {
  const { colorMode } = useShellSettings();
  return <output>{colorMode}</output>;
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
  act(() => listener?.({ matches: true } as MediaQueryListEvent));
  expect(screen.getByRole("status")).toHaveTextContent("dark");
});
