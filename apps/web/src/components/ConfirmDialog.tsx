import type { ReactNode } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';

export interface ConfirmDialogProps {
  open: boolean;
  /** A question, such as "Delete L03?". */
  title: string;
  /** Says what the button does, such as "Delete lecture" — never just "OK". */
  confirmLabel: string;
  onConfirm(): void;
  onCancel(): void;
  busy?: boolean;
  /** What happens, and what is kept. */
  children: ReactNode;
}

/**
 * The question asked before something is deleted: what happens and what is kept, with Cancel first and
 * the danger action named for what it does.
 */
export function ConfirmDialog({
  open,
  title,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onCancel()}
      title={title}
      size="sm"
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="danger" loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-2 text-sm">{children}</div>
    </Dialog>
  );
}
