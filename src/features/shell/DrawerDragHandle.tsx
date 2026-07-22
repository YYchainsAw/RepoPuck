import { GrabberIcon } from "@primer/octicons-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { ShellMode } from "./useNativeShellState";

interface DrawerDragHandleProps {
  mode: ShellMode;
  closing: boolean;
}

export function DrawerDragHandle({ mode, closing }: DrawerDragHandleProps) {
  if (mode !== "top-drawer") return null;
  if (closing) {
    return (
      <div
        className="drawer-drag-handle drawer-drag-handle--inactive"
        aria-hidden="true"
      />
    );
  }

  const startDragging = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    void getCurrentWindow().startDragging().catch(() => undefined);
  };

  return (
    <button
      className="drawer-drag-handle"
      type="button"
      aria-label="Move top drawer"
      title="Drag to move the top drawer"
      onPointerDown={startDragging}
    >
      <GrabberIcon size={16} aria-hidden="true" />
    </button>
  );
}
