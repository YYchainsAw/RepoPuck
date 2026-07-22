import { AlertIcon, CheckCircleIcon, CopyIcon, XIcon } from "@primer/octicons-react";
import { IconButton } from "@primer/react";
import { useState } from "react";

interface NoticeProps {
  kind: "success" | "error";
  children: string;
  onDismiss?(): void;
}

export function Notice({ kind, children, onDismiss }: NoticeProps) {
  const Icon = kind === "error" ? AlertIcon : CheckCircleIcon;
  const [copyFeedback, setCopyFeedback] = useState<{
    message: string;
    state: "copied" | "failed";
  }>();
  const copyState = copyFeedback?.message === children ? copyFeedback.state : "idle";
  const copyDetails = async () => {
    setCopyFeedback(undefined);
    if (!navigator.clipboard?.writeText) {
      setCopyFeedback({ message: children, state: "failed" });
      return;
    }
    try {
      await navigator.clipboard.writeText(children);
      setCopyFeedback({ message: children, state: "copied" });
    } catch {
      setCopyFeedback({ message: children, state: "failed" });
    }
  };
  return (
    <div
      className={`panel-notice panel-notice--${kind}`}
      role={kind === "error" ? "alert" : "status"}
    >
      <Icon size={16} aria-hidden="true" />
      <span className="panel-notice__message">{children}</span>
      {kind === "error" && (
        <>
          <span className="panel-notice__copy-status" aria-live="polite">
            {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : ""}
          </span>
          <IconButton
            icon={CopyIcon}
            unsafeDisableTooltip
            aria-label="Copy error details"
            variant="invisible"
            onClick={() => void copyDetails()}
          />
        </>
      )}
      {kind === "success" && onDismiss && (
        <IconButton
          icon={XIcon}
          unsafeDisableTooltip
          aria-label="Dismiss notification"
          variant="invisible"
          onClick={onDismiss}
        />
      )}
    </div>
  );
}
