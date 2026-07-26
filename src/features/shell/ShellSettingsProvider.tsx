import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import {
  addRecentRepository,
  applyThemePreference,
  createShellSettingsPersistence,
  getLanguagePreference,
  type AICommitPreferences,
  type LanguagePreference,
  type ShellSettings,
  type ShellSettingsPersistence,
  type ThemePreference,
  resolveTheme,
} from "./settings";
import {
  createInterfaceLanguageChangedPayload,
  emitInterfaceLanguageChanged,
  listenForInterfaceLanguageChanged,
} from "../../i18n/interfaceLanguageEvent";

export interface ShellSettingsValue {
  settings: ShellSettings;
  colorMode: "light" | "dark";
  setTheme(theme: ThemePreference): void;
  setPinned(pinned: boolean): void;
  /**
   * Optional only so older injected test doubles remain source-compatible.
   * The real provider and useShellSettings() always expose this method.
   */
  setLanguage?(language: LanguagePreference): void;
  setAiCommitPreferences(preferences: AICommitPreferences): void;
  rememberRepository(path: string): void;
  clearRecentRepositories(): void;
}

export type ShellSettingsContextValue = ShellSettingsValue & {
  setLanguage(language: LanguagePreference): void;
};

const ShellSettingsContext = createContext<ShellSettingsContextValue | null>(null);

interface ShellSettingsProviderProps extends PropsWithChildren {
  initialSettings: ShellSettings;
  persistence?: ShellSettingsPersistence;
}

export function ShellSettingsProvider({
  children,
  initialSettings,
  persistence: injectedPersistence,
}: ShellSettingsProviderProps) {
  const persistence = useMemo(
    () => injectedPersistence ?? createShellSettingsPersistence(),
    [injectedPersistence],
  );
  const [settings, setSettings] = useState(initialSettings);
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = (matches = media.matches) => setSystemPrefersDark(matches);
    update();
    const handleChange = (event: MediaQueryListEvent) => update(event.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    let disposed = false;
    let stopListening: (() => void) | undefined;

    void listenForInterfaceLanguageChanged(({ preference }) => {
      if (disposed) return;
      setSettings((current) =>
        getLanguagePreference(current) === preference
          ? current
          : { ...current, language: preference },
      );
    })
      .then((unlisten) => {
        if (disposed) {
          unlisten();
        } else {
          stopListening = unlisten;
        }
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      stopListening?.();
    };
  }, []);

  const colorMode = resolveTheme(settings.theme, systemPrefersDark);

  useEffect(() => {
    applyThemePreference(settings.theme, systemPrefersDark);
  }, [settings.theme, systemPrefersDark]);

  const update = useCallback(
    (change: (current: ShellSettings) => ShellSettings) => {
      setSettings((current) => {
        const next = change(current);
        if (next === current) return current;
        void persistence.save(next).catch(() => undefined);
        return next;
      });
    },
    [persistence],
  );

  const setLanguage = useCallback(
    (language: LanguagePreference) => {
      setSettings((current) => {
        if (getLanguagePreference(current) === language) return current;
        const next = { ...current, language };
        void persistence.save(next).catch(() => undefined);
        void emitInterfaceLanguageChanged(
          createInterfaceLanguageChangedPayload(language),
        ).catch(() => undefined);
        return next;
      });
    },
    [persistence],
  );

  const value = useMemo<ShellSettingsContextValue>(
    () => ({
      settings,
      colorMode,
      setTheme: (theme) => update((current) => ({ ...current, theme })),
      setPinned: (pinned) => update((current) => ({ ...current, pinned })),
      setLanguage,
      setAiCommitPreferences: (aiCommit) =>
        update((current) => ({ ...current, aiCommit })),
      rememberRepository: (path) => update((current) => addRecentRepository(current, path)),
      clearRecentRepositories: () =>
        update((current) =>
          current.recentRepositories.length === 0
            ? current
            : { ...current, recentRepositories: [] },
        ),
    }),
    [colorMode, setLanguage, settings, update],
  );

  return (
    <ShellSettingsContext.Provider value={value}>
      {children}
    </ShellSettingsContext.Provider>
  );
}

export function useShellSettings(): ShellSettingsContextValue {
  const value = useContext(ShellSettingsContext);
  if (!value) throw new Error("useShellSettings must be used within ShellSettingsProvider");
  return value;
}
