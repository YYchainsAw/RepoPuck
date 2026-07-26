// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import {
  ShellSettingsProvider,
  useShellSettings,
} from "./ShellSettingsProvider";
import { SettingsDialog } from "./SettingsDialog";
import type { ShellSettingsPersistence } from "./settings";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

afterEach(() => {
  invokeMock.mockReset();
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
});

function Harness({
  open = true,
  onOpenRecent = vi.fn(),
  shellMode = "puck",
  shellModePending = false,
  shellModeError = null,
  onShellModeChange = vi.fn(),
}: {
  open?: boolean;
  onOpenRecent?: (path: string) => void;
  shellMode?: "puck" | "top-island" | "top-drawer";
  shellModePending?: boolean;
  shellModeError?: string | null;
  onShellModeChange?: (mode: "puck" | "top-island" | "top-drawer") => void;
}) {
  const settings = useShellSettings();
  return (
    <I18nProvider>
      <SettingsDialog
        open={open}
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
    </I18nProvider>
  );
}

it("switches and persists the interface language independently from commit language", async () => {
  const persistence: ShellSettingsPersistence = {
    save: vi.fn().mockResolvedValue(undefined),
  };
  render(
    <ShellSettingsProvider
      initialSettings={{
        theme: "light",
        pinned: false,
        recentRepositories: [],
        language: "en",
      }}
      persistence={persistence}
    >
      <Harness />
    </ShellSettingsProvider>,
  );

  expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox", { name: /Interface language/ }), {
    target: { value: "zh-CN" },
  });

  expect(screen.getByRole("heading", { name: "设置" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "关闭" })).toBeInTheDocument();
  expect(screen.getByRole("radiogroup", { name: "启动模式" })).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "提交信息语言" })).toHaveValue(
    "zh-CN",
  );
  await waitFor(() =>
    expect(persistence.save).toHaveBeenCalledWith({
      theme: "light",
      pinned: false,
      recentRepositories: [],
      language: "zh-CN",
    }),
  );
});

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

it("persists AI language and Conventional Commit formatting preferences", async () => {
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
      <Harness />
    </ShellSettingsProvider>,
  );

  expect(screen.getByRole("textbox", { name: "AI service base URL" })).toHaveValue(
    "https://api.openai.com/v1",
  );
  expect(screen.getByRole("textbox", { name: "AI model" })).toHaveValue("gpt-4.1-mini");
  fireEvent.change(screen.getByRole("combobox", { name: "Commit language" }), {
    target: { value: "en" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Commit type" }), {
    target: { value: "fix" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Scope (optional)" }), {
    target: { value: "ui" },
  });

  await waitFor(() =>
    expect(persistence.save).toHaveBeenLastCalledWith({
      theme: "light",
      pinned: false,
      recentRepositories: [],
      aiCommit: {
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4.1-mini",
        language: "en",
        commitType: "fix",
        scope: "ui",
      },
    }),
  );
  expect(screen.getByText(/fix\(ui\):/)).toBeInTheDocument();
});

it("keeps secure key controls unavailable in the browser demo", () => {
  render(
    <ShellSettingsProvider
      initialSettings={{ theme: "light", pinned: false, recentRepositories: [] }}
    >
      <Harness />
    </ShellSettingsProvider>,
  );

  expect(screen.getByLabelText("AI API key")).toBeDisabled();
  expect(
    screen.getByText("Secure API key storage is available in the RepoPuck desktop app."),
  ).toBeInTheDocument();
  expect(invokeMock).not.toHaveBeenCalled();
});

it("stores, replaces, and removes the API key without ever revealing it", async () => {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: {},
  });
  invokeMock.mockImplementation(async (command: string) => {
    if (command === "get_ai_key_status") return { configured: true };
    return { success: true };
  });

  render(
    <ShellSettingsProvider
      initialSettings={{ theme: "light", pinned: false, recentRepositories: [] }}
    >
      <Harness />
    </ShellSettingsProvider>,
  );

  await waitFor(() =>
    expect(screen.getByText("API key saved securely.")).toBeInTheDocument(),
  );
  const apiKeyInput = screen.getByLabelText<HTMLInputElement>("AI API key");
  expect(apiKeyInput).toHaveAttribute("type", "password");
  expect(apiKeyInput).toHaveValue("");

  fireEvent.change(apiKeyInput, { target: { value: "sk-replacement" } });
  fireEvent.click(screen.getByRole("button", { name: "Save key" }));
  await waitFor(() =>
    expect(invokeMock).toHaveBeenCalledWith("save_ai_api_key", {
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-replacement",
    }),
  );
  expect(apiKeyInput).toHaveValue("");

  fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  await waitFor(() =>
    expect(invokeMock).toHaveBeenCalledWith("delete_ai_api_key", {
      baseUrl: "https://api.openai.com/v1",
    }),
  );
  expect(screen.getByText("No API key saved yet.")).toBeInTheDocument();
});

it("localizes concrete Windows Credential Manager failures", async () => {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: {},
  });
  invokeMock.mockImplementation(async (command: string) => {
    if (command === "get_ai_key_status") return { configured: false };
    return {
      success: false,
      message: "Windows Credential Manager could not save the AI API key",
    };
  });

  render(
    <ShellSettingsProvider
      initialSettings={{
        theme: "light",
        pinned: false,
        recentRepositories: [],
        language: "zh-CN",
      }}
    >
      <Harness />
    </ShellSettingsProvider>,
  );

  await waitFor(() => expect(screen.getByText("尚未保存 API 密钥。")).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText("AI API 密钥"), {
    target: { value: "sk-valid-looking" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存密钥" }));

  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Windows 凭据管理器无法保存 AI API 密钥。",
    ),
  );
});

it("clears an unsubmitted API key as soon as the dialog closes", async () => {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: {},
  });
  invokeMock.mockResolvedValue({ configured: false });
  const settings = {
    theme: "light" as const,
    pinned: false,
    recentRepositories: [],
  };
  const rendered = render(
    <ShellSettingsProvider initialSettings={settings}>
      <Harness />
    </ShellSettingsProvider>,
  );

  await waitFor(() => expect(screen.getByText("No API key saved yet.")).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText("AI API key"), {
    target: { value: "sk-never-submit-this" },
  });
  expect(screen.getByLabelText("AI API key")).toHaveValue("sk-never-submit-this");

  rendered.rerender(
    <ShellSettingsProvider initialSettings={settings}>
      <Harness open={false} />
    </ShellSettingsProvider>,
  );
  rendered.rerender(
    <ShellSettingsProvider initialSettings={settings}>
      <Harness />
    </ShellSettingsProvider>,
  );

  await waitFor(() => expect(screen.getByLabelText("AI API key")).toHaveValue(""));
});

it("keeps the saved-key state when replacing a key fails", async () => {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: {},
  });
  invokeMock.mockImplementation(async (command: string) => {
    if (command === "get_ai_key_status") return { configured: true };
    return { success: false, message: "The provider rejected the replacement key." };
  });
  render(
    <ShellSettingsProvider
      initialSettings={{ theme: "light", pinned: false, recentRepositories: [] }}
    >
      <Harness />
    </ShellSettingsProvider>,
  );

  await waitFor(() =>
    expect(screen.getByText("API key saved securely.")).toBeInTheDocument(),
  );
  fireEvent.change(screen.getByLabelText("AI API key"), {
    target: { value: "sk-invalid-replacement" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save key" }));

  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The provider rejected the replacement key.",
    ),
  );
  expect(screen.getByRole("button", { name: "Remove" })).toBeEnabled();
  expect(screen.getByLabelText("AI API key")).toHaveValue("sk-invalid-replacement");
});

it("requires an explicit key choice after the AI provider host changes", async () => {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: {},
  });
  invokeMock.mockImplementation(async (command: string, arguments_: unknown) => {
    if (command === "get_ai_context_summary") {
      return {
        includedFiles: 2,
        approximateBytes: 2048,
        binaryFiles: 0,
        truncated: false,
        excludedFiles: [],
      };
    }
    if (command === "get_ai_key_status") {
      const { baseUrl } = arguments_ as { baseUrl: string };
      return baseUrl.includes("example.com")
        ? {
            configured: false,
            legacyConfigured: false,
            providerHost: "api.example.com",
          }
        : {
            configured: true,
            legacyConfigured: false,
            providerHost: "api.openai.com",
          };
    }
    return { success: true };
  });
  render(
    <ShellSettingsProvider
      initialSettings={{ theme: "light", pinned: false, recentRepositories: [] }}
    >
      <Harness />
    </ShellSettingsProvider>,
  );

  await waitFor(() =>
    expect(screen.getByText(/saved securely for api\.openai\.com/i)).toBeInTheDocument(),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "AI service base URL" }), {
    target: { value: "https://api.example.com/v1" },
  });

  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Provider changed to api.example.com",
    ),
  );
  expect(screen.getByText(/No API key is saved for api\.example\.com/i)).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("AI API key"), {
    target: { value: "sk-example" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save key" }));
  await waitFor(() =>
    expect(invokeMock).toHaveBeenCalledWith("save_ai_api_key", {
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-example",
    }),
  );
});

it("only migrates a legacy key after confirmation and previews staged context", async () => {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: {},
  });
  invokeMock.mockImplementation(async (command: string) => {
    if (command === "get_ai_context_summary") {
      return {
        includedFiles: 3,
        approximateBytes: 1536,
        binaryFiles: 1,
        truncated: true,
        excludedFiles: [".env"],
      };
    }
    if (command === "get_ai_key_status") {
      return {
        configured: false,
        legacyConfigured: true,
        providerHost: "api.openai.com",
      };
    }
    return { success: true };
  });
  render(
    <ShellSettingsProvider
      initialSettings={{ theme: "light", pinned: false, recentRepositories: [] }}
    >
      <Harness />
    </ShellSettingsProvider>,
  );

  expect(await screen.findByText(/3 staged files · approximately 1\.5 KB/i)).toBeInTheDocument();
  expect(screen.getByText(/1 binary file has content omitted/i)).toBeInTheDocument();
  expect(screen.getByText(/1 sensitive file is excluded/i)).toBeInTheDocument();
  expect(screen.getByText(/context is truncated/i)).toBeInTheDocument();
  expect(invokeMock).not.toHaveBeenCalledWith(
    "migrate_legacy_ai_api_key",
    expect.anything(),
  );

  fireEvent.click(screen.getByRole("button", { name: "Confirm existing key" }));
  await waitFor(() =>
    expect(invokeMock).toHaveBeenCalledWith("migrate_legacy_ai_api_key", {
      baseUrl: "https://api.openai.com/v1",
    }),
  );
});

it("discloses exactly what is sent when generating a message", () => {
  render(
    <ShellSettingsProvider
      initialSettings={{ theme: "dark", pinned: false, recentRepositories: [] }}
    >
      <Harness />
    </ShellSettingsProvider>,
  );

  expect(
    screen.getByText(/only when you click AI, staged text differences/i),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Known sensitive paths and binary contents are excluded/i),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/stored in Windows Credential Manager and is never written to settings\.json/i),
  ).toBeInTheDocument();
});
