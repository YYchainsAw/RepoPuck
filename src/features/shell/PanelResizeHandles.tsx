import { getCurrentWindow } from "@tauri-apps/api/window";
import type { PointerEvent as ReactPointerEvent } from "react";

type ResizeDirection =
  | "North"
  | "NorthEast"
  | "East"
  | "SouthEast"
  | "South"
  | "SouthWest"
  | "West"
  | "NorthWest";

const resizeDirections: ResizeDirection[] = [
  "North",
  "NorthEast",
  "East",
  "SouthEast",
  "South",
  "SouthWest",
  "West",
  "NorthWest",
];

const isTauriRuntime = () => "__TAURI_INTERNALS__" in window;

export function PanelResizeHandles() {
  if (!isTauriRuntime()) return null;

  const startResize = (
    event: ReactPointerEvent<HTMLDivElement>,
    direction: ResizeDirection,
  ) => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    event.stopPropagation();
    void getCurrentWindow().startResizeDragging(direction).catch(() => undefined);
  };

  return (
    <div className="panel-resize-handles" aria-hidden="true">
      {resizeDirections.map((direction) => (
        <div
          key={direction}
          className={`panel-resize-handle panel-resize-handle--${direction.toLowerCase()}`}
          data-resize-direction={direction}
          aria-hidden="true"
          onPointerDown={(event) => startResize(event, direction)}
        />
      ))}
    </div>
  );
}
