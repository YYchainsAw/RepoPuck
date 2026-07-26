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
import { useI18n } from "../../i18n";
import { getShellCopy } from "../../i18n/shell";

interface MenuAction {
  label: string;
  icon: ComponentType<{ size?: number }>;
  detail?: string;
  run(): void;
}

interface ActionMenuProps {
  open: boolean;
  busy: boolean;
  remoteName?: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose(): void;
  onOpenSettings(): void;
  onAmendLastCommit(): void;
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
  remoteName,
  triggerRef,
  onClose,
  onOpenSettings,
  onAmendLastCommit,
  actions,
}: ActionMenuProps) {
  const { language } = useI18n();
  const copy = getShellCopy(language);
  const menuRef = useRef<HTMLDivElement>(null);

  const items: MenuAction[] = [
    { label: copy.menu.fetch, icon: SyncIcon, run: actions.fetch },
    { label: copy.menu.pull, icon: DownloadIcon, run: actions.pull },
    { label: copy.menu.push, icon: UploadIcon, detail: remoteName, run: actions.push },
    { label: copy.menu.stash, icon: ArchiveIcon, run: actions.stash },
    { label: copy.menu.openTerminal, icon: TerminalIcon, run: actions.openTerminal },
    { label: copy.menu.openExplorer, icon: FileDirectoryIcon, run: actions.openExplorer },
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
      aria-label={copy.menu.repositoryActions}
      onKeyDown={moveFocus}
    >
      {items.map(({ label, icon: Icon, detail, run }, index) => (
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
          <span>{label}</span>
          {detail && <small>{detail}</small>}
        </button>
      ))}
      <div className="action-menu-divider" role="separator" />
      <button
        className="action-menu-item"
        type="button"
        role="menuitem"
        tabIndex={-1}
        disabled={busy}
        onClick={() => {
          onAmendLastCommit();
          closeAndRestoreFocus();
        }}
      >
        <GitCommitIcon size={16} aria-hidden="true" />
        {copy.menu.amendLastCommit}
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
        {copy.menu.settings}
      </button>
    </div>
  );
}
