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
  type ShellSettings,
  type ShellSettingsPersistence,
  type ThemePreference,
  resolveTheme,
} from "./settings";

export interface ShellSettingsValue {
  settings: ShellSettings;
  colorMode: "light" | "dark";
  setTheme(theme: ThemePreference): void;
  setPinned(pinned: boolean): void;
  rememberRepository(path: string): void;
  clearRecentRepositories(): void;
}

const ShellSettingsContext = createContext<ShellSettingsValue | null>(null);

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

  const value = useMemo<ShellSettingsValue>(
    () => ({
      settings,
      colorMode,
      setTheme: (theme) => update((current) => ({ ...current, theme })),
      setPinned: (pinned) => update((current) => ({ ...current, pinned })),
      rememberRepository: (path) => update((current) => addRecentRepository(current, path)),
      clearRecentRepositories: () =>
        update((current) =>
          current.recentRepositories.length === 0
            ? current
            : { ...current, recentRepositories: [] },
        ),
    }),
    [colorMode, settings, update],
  );

  return (
    <ShellSettingsContext.Provider value={value}>
      {children}
    </ShellSettingsContext.Provider>
  );
}

export function useShellSettings(): ShellSettingsValue {
  const value = useContext(ShellSettingsContext);
  if (!value) throw new Error("useShellSettings must be used within ShellSettingsProvider");
  return value;
}
