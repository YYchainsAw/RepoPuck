import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

export interface NativeShellListeners {
  onRefreshRequested(): void;
  onOpenSettingsRequested(): void;
}

export interface NativeShellClient {
  togglePanel(): Promise<void>;
  setPanelPinned(pinned: boolean): Promise<void>;
  savePuckPosition(): Promise<void>;
  openSettings(): Promise<void>;
  showPuckMenu(): Promise<void>;
  startDragging(): Promise<void>;
  listen(listeners: NativeShellListeners): Promise<() => void>;
}

const isTauriRuntime = () => "__TAURI_INTERNALS__" in window;

const browserClient: NativeShellClient = {
  togglePanel: async () => undefined,
  setPanelPinned: async () => undefined,
  savePuckPosition: async () => undefined,
  openSettings: async () => undefined,
  showPuckMenu: async () => undefined,
  startDragging: async () => undefined,
  listen: async () => () => undefined,
};

export function createNativeShellClient(): NativeShellClient {
  if (!isTauriRuntime()) return browserClient;
  return {
    togglePanel: () => invoke("toggle_panel"),
    setPanelPinned: (pinned) => invoke("set_panel_pinned", { pinned }),
    savePuckPosition: () => invoke("save_puck_position"),
    openSettings: () => invoke("open_settings"),
    showPuckMenu: () => invoke("show_puck_menu"),
    startDragging: () => getCurrentWindow().startDragging(),
    async listen(listeners) {
      const unlisten = await Promise.all([
        listen("refresh_requested", listeners.onRefreshRequested),
        listen("open_settings_requested", listeners.onOpenSettingsRequested),
      ]);
      return () => unlisten.forEach((stop) => stop());
    },
  };
}
