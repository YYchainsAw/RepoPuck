import { ChevronDownIcon, GitBranchIcon } from "@primer/octicons-react";
import { useRef } from "react";
import puckIconUrl from "../../../src-tauri/icons/128x128.png";
import { createNativeShellClient, type NativeShellClient } from "./nativeClient";
import "./native-shell.css";

interface TopIslandProps {
  changeCount: number;
  expanded: boolean;
  client?: NativeShellClient;
}

export function TopIsland({
  changeCount,
  expanded,
  client: injectedClient,
}: TopIslandProps) {
  const clientRef = useRef(injectedClient ?? createNativeShellClient());
  const toggleRequest = useRef<Promise<void> | null>(null);
  const togglePending = useRef(false);
  const count = Math.max(0, Math.floor(changeCount));
  const countLabel =
    count === 0
      ? "No changed files"
      : `${count} changed ${count === 1 ? "file" : "files"}`;

  const togglePanel = () => {
    if (toggleRequest.current) {
      togglePending.current = !togglePending.current;
      return;
    }
    const request = clientRef.current
      .togglePanel()
      .catch(() => undefined)
      .finally(() => {
        if (toggleRequest.current !== request) return;
        toggleRequest.current = null;
        if (togglePending.current) {
          togglePending.current = false;
          togglePanel();
        }
      });
    toggleRequest.current = request;
  };

  return (
    <main
      className="top-island-surface"
      aria-label="RepoPuck top island"
      data-expanded={expanded}
      data-placement="top-edge"
    >
      <button
        className="top-island-button"
        type="button"
        aria-label={`${expanded ? "Hide" : "Show"} RepoPuck Git panel, ${countLabel.toLowerCase()}`}
        aria-expanded={expanded}
        title={expanded ? "Hide RepoPuck" : "Open RepoPuck"}
        onClick={togglePanel}
        onContextMenu={(event) => {
          event.preventDefault();
          void clientRef.current.showPuckMenu();
        }}
      >
        <img className="top-island-logo" src={puckIconUrl} alt="" draggable={false} />
        <span className="top-island-copy">
          <strong>RepoPuck</strong>
          <span>{countLabel}</span>
        </span>
        <GitBranchIcon className="top-island-branch" size={16} aria-hidden="true" />
        <ChevronDownIcon
          className="top-island-chevron"
          size={16}
          aria-hidden="true"
        />
      </button>
    </main>
  );
}
