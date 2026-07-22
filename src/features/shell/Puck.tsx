import {
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import puckIconUrl from "../../../src-tauri/icons/128x128.png";
import { createNativeShellClient, type NativeShellClient } from "./nativeClient";
import "./native-shell.css";

interface PuckProps {
  changeCount: number;
  client?: NativeShellClient;
}

interface PointerOrigin {
  pointerId: number;
  x: number;
  y: number;
  dragged: boolean;
}

const DRAG_THRESHOLD = 8;

export function Puck({ changeCount, client: injectedClient }: PuckProps) {
  const clientRef = useRef(injectedClient ?? createNativeShellClient());
  const gesture = useRef<PointerOrigin | null>(null);
  const showRequest = useRef<Promise<void> | null>(null);
  const count = Math.max(0, Math.floor(changeCount));
  const countLabel = count === 0 ? "no changed files" : `${count} changed ${count === 1 ? "file" : "files"}`;

  const showPanel = () => {
    if (showRequest.current) return;

    const request = clientRef.current
      .showPanel()
      .catch(() => undefined)
      .finally(() => {
        if (showRequest.current === request) showRequest.current = null;
      });
    showRequest.current = request;
  };

  const releasePointer = (
    event: ReactPointerEvent<HTMLButtonElement>,
    pointerId: number,
  ) => {
    try {
      if (event.currentTarget.hasPointerCapture?.(pointerId)) {
        event.currentTarget.releasePointerCapture(pointerId);
      }
    } catch {
      // Native dragging may already have released the browser pointer capture.
    }
  };

  const startPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !event.isPrimary) return;
    gesture.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      dragged: false,
    };
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // The gesture still works if the host does not expose pointer capture.
    }
  };

  const movePointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId || current.dragged) return;
    if ((event.buttons & 1) === 0) {
      gesture.current = null;
      releasePointer(event, current.pointerId);
      return;
    }
    const distance = Math.hypot(
      event.clientX - current.x,
      event.clientY - current.y,
    );
    if (distance < DRAG_THRESHOLD) return;
    current.dragged = true;
    void clientRef.current
      .startDragging()
      .then(() => clientRef.current.savePuckPosition())
      .catch(() => undefined);
  };

  const endPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = null;
    releasePointer(event, current.pointerId);
    if (!current.dragged) showPanel();
  };

  const cancelPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = null;
    releasePointer(event, current.pointerId);
  };

  const handleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    // Pointer activation is handled on pointerup so a native drag cannot leave a
    // stale click-suppression flag. detail === 0 preserves assistive/programmatic clicks.
    if (event.detail === 0) showPanel();
  };

  return (
    <main className="puck-surface" aria-label="RepoPuck launcher">
      <button
        className="puck-button"
        type="button"
        aria-label={`Open Git panel, ${countLabel}`}
        title="Open RepoPuck"
        onPointerDown={startPointer}
        onPointerMove={movePointer}
        onPointerUp={endPointer}
        onPointerCancel={cancelPointer}
        onClick={handleClick}
        onKeyDown={(event) => {
          if (event.repeat || (event.key !== "Enter" && event.key !== " ")) return;
          event.preventDefault();
          showPanel();
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          void clientRef.current.showPuckMenu();
        }}
      >
        <img src={puckIconUrl} alt="" draggable={false} />
        {count > 0 && (
          <span className="puck-badge" aria-label={countLabel}>
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
    </main>
  );
}
