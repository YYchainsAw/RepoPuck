import { AlertIcon, CheckCircleIcon } from "@primer/octicons-react";

interface NoticeProps {
  kind: "success" | "error";
  children: string;
}

export function Notice({ kind, children }: NoticeProps) {
  const Icon = kind === "error" ? AlertIcon : CheckCircleIcon;
  return (
    <div
      className={`panel-notice panel-notice--${kind}`}
      role={kind === "error" ? "alert" : "status"}
    >
      <Icon size={16} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
