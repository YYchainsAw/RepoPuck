import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { useShellSettings } from "../features/shell/ShellSettingsProvider";
import {
  getLanguagePreference,
} from "../features/shell/settings";
import {
  createInterfaceLanguageChangedPayload,
  detectSystemLanguage,
  emitInterfaceLanguageChanged,
  resolveLanguagePreference,
  type ResolvedInterfaceLanguage,
} from "./interfaceLanguageEvent";

export {
  detectSystemLanguage,
  INTERFACE_LANGUAGE_CHANGED_EVENT,
  isInterfaceLanguageChangedPayload,
  resolveLanguagePreference,
  type InterfaceLanguageChangedPayload,
} from "./interfaceLanguageEvent";

export type AppLanguage = ResolvedInterfaceLanguage;

export type LocalizedText = Readonly<Record<AppLanguage, string>>;

export interface I18nValue {
  language: AppLanguage;
  t(text: LocalizedText): string;
}

const englishFallback: I18nValue = {
  language: "en",
  t: (text) => text.en,
};

const I18nContext = createContext<I18nValue>(englishFallback);

export function I18nProvider({ children }: PropsWithChildren) {
  const { settings } = useShellSettings();
  const [systemLanguage, setSystemLanguage] = useState(detectSystemLanguage);
  const lastPublishedSystemLanguage = useRef<AppLanguage | null>(null);

  useEffect(() => {
    const handleLanguageChange = () => setSystemLanguage(detectSystemLanguage());
    window.addEventListener("languagechange", handleLanguageChange);
    return () => window.removeEventListener("languagechange", handleLanguageChange);
  }, []);

  const language = resolveLanguagePreference(
    getLanguagePreference(settings),
    systemLanguage,
  );

  useEffect(() => {
    if (lastPublishedSystemLanguage.current === systemLanguage) return;
    lastPublishedSystemLanguage.current = systemLanguage;
    void emitInterfaceLanguageChanged(
      createInterfaceLanguageChangedPayload(
        getLanguagePreference(settings),
        systemLanguage,
      ),
    ).catch(() => undefined);
  }, [settings, systemLanguage]);

  useLayoutEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<I18nValue>(
    () => ({
      language,
      t: (text) => text[language],
    }),
    [language],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Returns a stable English fallback outside I18nProvider so isolated component
 * tests and reusable surfaces do not depend on the host operating-system locale.
 */
export function useI18n(): I18nValue {
  return useContext(I18nContext);
}
