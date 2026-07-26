// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShellSettingsProvider, useShellSettings } from "../features/shell/ShellSettingsProvider";
import type { LanguagePreference } from "../features/shell/settings";
import {
  detectSystemLanguage,
  I18nProvider,
  INTERFACE_LANGUAGE_CHANGED_EVENT,
  resolveLanguagePreference,
  useI18n,
} from ".";

const eventApi = vi.hoisted(() => ({
  emit: vi.fn().mockResolvedValue(undefined),
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => eventApi);

function setNavigatorLanguage(language: string, languages = [language]) {
  Object.defineProperty(window.navigator, "language", {
    configurable: true,
    value: language,
  });
  Object.defineProperty(window.navigator, "languages", {
    configurable: true,
    value: languages,
  });
}

function LanguageProbe() {
  const { language, t } = useI18n();
  return (
    <>
      <output aria-label="current language">{language}</output>
      <span>{t({ en: "Settings", "zh-CN": "设置" })}</span>
    </>
  );
}

function LanguageControls() {
  const { setLanguage } = useShellSettings();
  return (
    <button type="button" onClick={() => setLanguage("zh-CN")}>
      Switch language
    </button>
  );
}

function renderI18n(preference: LanguagePreference = "system", withControls = false) {
  return render(
    <ShellSettingsProvider
      initialSettings={{
        theme: "light",
        pinned: false,
        recentRepositories: [],
        language: preference,
      }}
      persistence={{ save: async () => undefined }}
    >
      <I18nProvider>
        <LanguageProbe />
        {withControls ? <LanguageControls /> : null}
      </I18nProvider>
    </ShellSettingsProvider>,
  );
}

beforeEach(() => {
  eventApi.emit.mockReset().mockResolvedValue(undefined);
  eventApi.listen.mockReset().mockResolvedValue(() => undefined);
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  setNavigatorLanguage("en-US");
  document.documentElement.lang = "";
});

describe("system language resolution", () => {
  it.each(["zh", "zh-CN", "zh-Hans-CN", "zh_TW"])(
    "maps %s to Simplified Chinese UI support",
    (locale) => {
      expect(detectSystemLanguage([locale], "en-US")).toBe("zh-CN");
    },
  );

  it("maps every other locale to English and falls back to navigator.language", () => {
    expect(detectSystemLanguage(["ja-JP"], "zh-CN")).toBe("en");
    expect(detectSystemLanguage([], "zh-HK")).toBe("zh-CN");
  });

  it("uses a manual preference instead of the detected system language", () => {
    expect(resolveLanguagePreference("zh-CN", "en")).toBe("zh-CN");
    expect(resolveLanguagePreference("en", "zh-CN")).toBe("en");
    expect(resolveLanguagePreference("system", "zh-CN")).toBe("zh-CN");
  });
});

it("uses a stable English fallback outside I18nProvider", () => {
  setNavigatorLanguage("zh-CN");
  render(<LanguageProbe />);

  expect(screen.getByRole("status", { name: "current language" })).toHaveTextContent(
    "en",
  );
  expect(screen.getByText("Settings")).toBeInTheDocument();
});

it("detects the system language and reacts to languagechange", () => {
  renderI18n();
  expect(document.documentElement).toHaveAttribute("lang", "en");

  setNavigatorLanguage("zh-Hans-CN");
  act(() => window.dispatchEvent(new Event("languagechange")));

  expect(screen.getByRole("status", { name: "current language" })).toHaveTextContent(
    "zh-CN",
  );
  expect(screen.getByText("设置")).toBeInTheDocument();
  expect(document.documentElement).toHaveAttribute("lang", "zh-CN");
});

it("applies a manual language switch immediately", () => {
  renderI18n("en", true);
  expect(document.documentElement).toHaveAttribute("lang", "en");

  fireEvent.click(screen.getByRole("button", { name: "Switch language" }));

  expect(screen.getByRole("status", { name: "current language" })).toHaveTextContent(
    "zh-CN",
  );
  expect(document.documentElement).toHaveAttribute("lang", "zh-CN");
});

it("publishes the resolved language for native UI on startup and system changes", async () => {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: {},
  });
  renderI18n("system");

  await waitFor(() =>
    expect(eventApi.emit).toHaveBeenCalledWith(
      INTERFACE_LANGUAGE_CHANGED_EVENT,
      { preference: "system", resolved: "en" },
    ),
  );

  setNavigatorLanguage("zh-Hans-CN");
  act(() => window.dispatchEvent(new Event("languagechange")));

  await waitFor(() =>
    expect(eventApi.emit).toHaveBeenLastCalledWith(
      INTERFACE_LANGUAGE_CHANGED_EVENT,
      { preference: "system", resolved: "zh-CN" },
    ),
  );
});
