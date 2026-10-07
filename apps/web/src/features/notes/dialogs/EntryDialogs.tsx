import type { MovePreview } from '@skb/core';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { Button } from '../../../components/Button';
import { Dialog } from '../../../components/Dialog';
import { Input } from '../../../components/Input';

/** "New folder" inside a parent folder. */
export function NewFolderDialog({
  open,
  parent,
  onOpenChange,
  onSubmit,
  busy,
}: {
  open: boolean;
  parent: string;
  onOpenChange(open: boolean): void;
  onSubmit(path: string): void;
  busy: boolean;
}) {
  const [name, setName] = useState('');
  const inputId = useId();
  const formId = useId();
  useEffect(() => {
    if (open) setName('');
  }, [open]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed) onSubmit(parent ? `${parent}/${trimmed}` : trimmed);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New folder"
      description={parent ? `Inside “${parent}”.` : 'At the top of the vault.'}
      size="sm"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            type="submit"
            form={formId}
            loading={busy}
            disabled={!name.trim()}
          >
            Create folder
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-1">
        <label htmlFor={inputId} className="block text-sm font-medium">
          Name
        </label>
        <Input
          id={inputId}
          value={name}
          autoFocus
          onChange={(event) => setName(event.target.value)}
        />
      </form>
    </Dialog>
  );
}

/** Confirms a move or rename that would leave links pointing elsewhere unless they are updated. */
export function LinkRewriteDialog({
  preview,
  onCancel,
  onConfirm,
  busy,
}: {
  preview: MovePreview | null;
  onCancel(): void;
  onConfirm(rewriteLinks: boolean): void;
  busy: boolean;
}) {
  const total = preview?.rewrites.reduce((sum, rewrite) => sum + rewrite.links, 0) ?? 0;
  return (
    <Dialog
      open={preview !== null}
      onOpenChange={(open) => !open && onCancel()}
      title="Update links?"
      description={
        preview
          ? `Moving “${preview.from}” to “${preview.to}” would change where ${total} ${total === 1 ? 'link' : 'links'} in ${preview.rewrites.length} ${preview.rewrites.length === 1 ? 'note' : 'notes'} point.`
          : undefined
      }
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button onClick={() => onConfirm(false)} disabled={busy}>
            Move without updating
          </Button>
          <Button variant="primary" onClick={() => onConfirm(true)} loading={busy}>
            Update links and move
          </Button>
        </>
      }
    >
      <ul className="max-h-60 space-y-1 overflow-y-auto text-sm">
        {preview?.rewrites.map((rewrite) => (
          <li key={rewrite.source.id} className="flex justify-between gap-3">
            <span className="truncate">{rewrite.source.path}</span>
            <span className="shrink-0 text-muted">
              {rewrite.links} {rewrite.links === 1 ? 'link' : 'links'}
            </span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

/** Confirms moving a note, folder or attachment to the trash. */
export function TrashDialog({
  target,
  notesInside,
  retentionDays,
  onCancel,
  onConfirm,
  busy,
}: {
  target: { path: string; kind: 'note' | 'folder' | 'attachment' } | null;
  notesInside: number;
  retentionDays: number;
  onCancel(): void;
  onConfirm(): void;
  busy: boolean;
}) {
  const name = target?.path.slice(target.path.lastIndexOf('/') + 1) ?? '';
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => !open && onCancel()}
      title={target?.kind === 'folder' ? 'Move folder to the trash?' : 'Move to the trash?'}
      size="sm"
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} loading={busy}>
            Move to trash
          </Button>
        </>
      }
    >
      <p className="text-sm">
        “{name}”
        {target?.kind === 'folder' && notesInside > 0
          ? ` and the ${notesInside} ${notesInside === 1 ? 'note' : 'notes'} inside it`
          : ''}{' '}
        will be kept in the trash for {retentionDays} days and can be restored until then. Links to
        it will show as unresolved.
      </p>
    </Dialog>
  );
}
