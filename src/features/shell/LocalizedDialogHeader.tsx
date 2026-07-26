import { XIcon } from "@primer/octicons-react";
import { Dialog, IconButton, type DialogHeaderProps } from "@primer/react";
import { useI18n } from "../../i18n";
import { getShellCopy } from "../../i18n/shell";

export function LocalizedDialogHeader({
  dialogLabelId,
  title,
  onClose,
}: DialogHeaderProps) {
  const { language } = useI18n();
  const copy = getShellCopy(language);

  return (
    <Dialog.Header>
      <Dialog.Title id={dialogLabelId}>{title}</Dialog.Title>
      <IconButton
        icon={XIcon}
        aria-label={copy.settings.close}
        variant="invisible"
        onClick={() => onClose("close-button")}
      />
    </Dialog.Header>
  );
}
