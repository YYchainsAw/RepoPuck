import { AlertIcon, CheckCircleIcon, CopyIcon, XIcon } from "@primer/octicons-react";
import { IconButton } from "@primer/react";

interface NoticeProps {
  kind: "success" | "error";
  children: string;
  onDismiss?(): void;
}

export function Notice({ kind, children, onDismiss }: NoticeProps) {
  const Icon = kind === "error" ? AlertIcon : CheckCircleIcon;
  const copyDetails = () => {
    void navigator.clipboard?.writeText(children).catch(() => undefined);
  };
  return (
    <div
      className={`panel-notice panel-notice--${kind}`}
      role={kind === "error" ? "alert" : "status"}
    >
      <Icon size={16} aria-hidden="true" />
      <span>{children}</span>
      {kind === "error" && (
        <IconButton
          icon={CopyIcon}
          unsafeDisableTooltip
          aria-label="Copy error details"
          variant="invisible"
          onClick={copyDetails}
        />
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
