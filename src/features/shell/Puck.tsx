import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import puckIconUrl from "../../../src-tauri/icons/128x128.png";
import { createNativeShellClient, type NativeShellClient } from "./nativeClient";
import "./native-shell.css";

interface PuckProps {
  changeCount: number;
  client?: NativeShellClient;
}

interface PointerOrigin {
  x: number;
  y: number;
}

const DRAG_THRESHOLD = 5;

export function Puck({ changeCount, client: injectedClient }: PuckProps) {
  const clientRef = useRef(injectedClient ?? createNativeShellClient());
  const origin = useRef<PointerOrigin | null>(null);
  const dragged = useRef(false);
  const suppressClick = useRef(false);
  const count = Math.max(0, Math.floor(changeCount));
  const countLabel = count === 0 ? "no changed files" : `${count} changed ${count === 1 ? "file" : "files"}`;

  const startPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    origin.current = { x: event.clientX, y: event.clientY };
    dragged.current = false;
  };

  const movePointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!origin.current || dragged.current) return;
    const distance = Math.hypot(
      event.clientX - origin.current.x,
      event.clientY - origin.current.y,
    );
    if (distance < DRAG_THRESHOLD) return;
    dragged.current = true;
    suppressClick.current = true;
    void clientRef.current
      .startDragging()
      .then(() => clientRef.current.savePuckPosition())
      .catch(() => undefined);
  };

  const endPointer = () => {
    origin.current = null;
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
        onPointerCancel={endPointer}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          void clientRef.current.togglePanel();
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
