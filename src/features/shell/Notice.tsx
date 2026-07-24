import { AlertIcon, CheckCircleIcon, CopyIcon, XIcon } from "@primer/octicons-react";
import { IconButton } from "@primer/react";
import { useState } from "react";
import { useI18n } from "../../i18n";
import { getShellCopy } from "../../i18n/shell";

interface NoticeProps {
  kind: "success" | "error";
  children: string;
  onDismiss?(): void;
}

export function Notice({ kind, children, onDismiss }: NoticeProps) {
  const { language } = useI18n();
  const copy = getShellCopy(language);
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
            {copyState === "copied"
              ? copy.notice.copied
              : copyState === "failed"
                ? copy.notice.copyFailed
                : ""}
          </span>
          <IconButton
            icon={CopyIcon}
            unsafeDisableTooltip
            aria-label={copy.notice.copyErrorDetails}
            variant="invisible"
            onClick={() => void copyDetails()}
          />
        </>
      )}
      {kind === "success" && onDismiss && (
        <IconButton
          icon={XIcon}
          unsafeDisableTooltip
          aria-label={copy.notice.dismiss}
          variant="invisible"
          onClick={onDismiss}
        />
      )}
    </div>
  );
}
