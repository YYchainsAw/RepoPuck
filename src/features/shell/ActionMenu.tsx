import {
  ArchiveIcon,
  DownloadIcon,
  FileDirectoryIcon,
  GearIcon,
  GitCommitIcon,
  SyncIcon,
  TerminalIcon,
  UploadIcon,
} from "@primer/octicons-react";
import {
  useEffect,
  useRef,
  type ComponentType,
  type KeyboardEvent,
  type RefObject,
} from "react";

interface MenuAction {
  label: string;
  icon: ComponentType<{ size?: number }>;
  run(): void;
}

interface ActionMenuProps {
  open: boolean;
  busy: boolean;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose(): void;
  onOpenSettings(): void;
  actions: {
    fetch(): void;
    pull(): void;
    push(): void;
    stash(): void;
    openTerminal(): void;
    openExplorer(): void;
  };
}

export function ActionMenu({
  open,
  busy,
  triggerRef,
  onClose,
  onOpenSettings,
  actions,
}: ActionMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  const items: MenuAction[] = [
    { label: "Fetch", icon: SyncIcon, run: actions.fetch },
    { label: "Pull", icon: DownloadIcon, run: actions.pull },
    { label: "Push", icon: UploadIcon, run: actions.push },
    { label: "Stash", icon: ArchiveIcon, run: actions.stash },
    { label: "Open terminal", icon: TerminalIcon, run: actions.openTerminal },
    { label: "Open Explorer", icon: FileDirectoryIcon, run: actions.openExplorer },
  ];

  const getEnabledItems = () =>
    Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)',
      ) ?? [],
    );

  const closeAndRestoreFocus = () => {
    onClose();
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    getEnabledItems()[0]?.focus();

    const closeForOutsideInteraction = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !menuRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        onClose();
        triggerRef.current?.focus();
      }
    };
    const closeForEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", closeForOutsideInteraction);
    document.addEventListener("keydown", closeForEscape);
    return () => {
      document.removeEventListener("mousedown", closeForOutsideInteraction);
      document.removeEventListener("keydown", closeForEscape);
    };
  }, [onClose, open, triggerRef]);

  if (!open) return null;

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!new Set(["ArrowDown", "ArrowUp", "Home", "End"]).has(event.key)) {
      return;
    }
    event.preventDefault();
    const enabledItems = getEnabledItems();
    const currentIndex = enabledItems.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex = 0;
    if (event.key === "End") nextIndex = enabledItems.length - 1;
    else if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % enabledItems.length;
    else if (event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + enabledItems.length) % enabledItems.length;
    }
    enabledItems.forEach((item, index) => {
      item.tabIndex = index === nextIndex ? 0 : -1;
    });
    enabledItems[nextIndex]?.focus();
  };

  return (
    <div
      ref={menuRef}
      className="action-menu"
      role="menu"
      aria-label="Repository actions"
      onKeyDown={moveFocus}
    >
          {items.map(({ label, icon: Icon, run }, index) => (
            <button
              key={label}
              className="action-menu-item"
              type="button"
              role="menuitem"
              tabIndex={index === 0 ? 0 : -1}
              disabled={busy}
              onClick={() => {
                run();
                closeAndRestoreFocus();
              }}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </button>
          ))}
          <div className="action-menu-divider" />
          <span id="amend-unavailable" className="sr-only">
            Not available in this version
          </span>
          <button
            className="action-menu-item"
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled
            aria-describedby="amend-unavailable"
          >
            <GitCommitIcon size={16} aria-hidden="true" />
            Amend last commit
            <small>Unavailable</small>
          </button>
          <button
            className="action-menu-item"
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled={busy}
            onClick={() => {
              onOpenSettings();
              closeAndRestoreFocus();
            }}
          >
            <GearIcon size={16} aria-hidden="true" />
            Settings
          </button>
    </div>
  );
}
