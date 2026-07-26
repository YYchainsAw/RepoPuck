import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { LanguagePreference } from "../features/shell/settings";

export const INTERFACE_LANGUAGE_CHANGED_EVENT = "interface_language_changed";

export type ResolvedInterfaceLanguage = "zh-CN" | "en";

export interface InterfaceLanguageChangedPayload {
  preference: LanguagePreference;
  resolved: ResolvedInterfaceLanguage;
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === "system" || value === "zh-CN" || value === "en";
}

export function isInterfaceLanguageChangedPayload(
  value: unknown,
): value is InterfaceLanguageChangedPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<InterfaceLanguageChangedPayload>;
  if (!isLanguagePreference(candidate.preference)) return false;
  if (candidate.resolved !== "zh-CN" && candidate.resolved !== "en") return false;
  return candidate.preference === "system" || candidate.preference === candidate.resolved;
}

export function detectSystemLanguage(
  languages: readonly string[] | undefined =
    typeof navigator === "undefined" ? undefined : navigator.languages,
  language: string | undefined =
    typeof navigator === "undefined" ? undefined : navigator.language,
): ResolvedInterfaceLanguage {
  const primaryLanguage = languages?.find((locale) => locale.trim().length > 0);
  return /^zh(?:[-_]|$)/i.test((primaryLanguage ?? language)?.trim() ?? "")
    ? "zh-CN"
    : "en";
}

export function resolveLanguagePreference(
  preference: LanguagePreference,
  systemLanguage: ResolvedInterfaceLanguage,
): ResolvedInterfaceLanguage {
  return preference === "system" ? systemLanguage : preference;
}

export function createInterfaceLanguageChangedPayload(
  preference: LanguagePreference,
  systemLanguage = detectSystemLanguage(),
): InterfaceLanguageChangedPayload {
  return {
    preference,
    resolved: resolveLanguagePreference(preference, systemLanguage),
  };
}

export async function emitInterfaceLanguageChanged(
  payload: InterfaceLanguageChangedPayload,
): Promise<void> {
  if (!isTauriRuntime() || !isInterfaceLanguageChangedPayload(payload)) return;
  await emit(INTERFACE_LANGUAGE_CHANGED_EVENT, payload);
}

export async function listenForInterfaceLanguageChanged(
  onLanguageChanged: (payload: InterfaceLanguageChangedPayload) => void,
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => undefined;
  return listen<unknown>(INTERFACE_LANGUAGE_CHANGED_EVENT, ({ payload }) => {
    if (isInterfaceLanguageChangedPayload(payload)) {
      onLanguageChanged(payload);
    }
  });
}
