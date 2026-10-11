import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { Button } from '../../../components/Button';
import { Dialog } from '../../../components/Dialog';
import { Input } from '../../../components/Input';
import type { TreeNode } from '../tree/buildTree';

/** "Rename…" from the More options menu (task 23.08); the file tree renames in place instead. */
export function RenameDialog({
  target,
  onCancel,
  onRename,
}: {
  target: TreeNode | null;
  onCancel(): void;
  onRename(node: TreeNode, name: string): void;
}) {
  const [name, setName] = useState('');
  const inputId = useId();
  const formId = useId();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!target) return;
    setName(target.name);
    // Select the name, not the extension, as a file manager does.
    const frame = requestAnimationFrame(() => {
      const dot = target.kind === 'attachment' ? target.name.lastIndexOf('.') : -1;
      input.current?.setSelectionRange(0, dot > 0 ? dot : target.name.length);
    });
    return () => cancelAnimationFrame(frame);
  }, [target]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!target || !trimmed) return;
    if (trimmed !== target.name) onRename(target, trimmed);
    onCancel();
  };
  const kind = target?.kind === 'folder' ? 'folder' : target?.kind === 'note' ? 'note' : 'file';

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => !open && onCancel()}
      title={`Rename ${kind}`}
      description={
        target?.kind === 'note'
          ? 'Links to it are updated, so they keep pointing at it.'
          : 'Links and embeds that point at it are updated.'
      }
      size="sm"
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" type="submit" form={formId} disabled={!name.trim()}>
            Rename
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-1">
        <label htmlFor={inputId} className="block text-sm font-medium">
          New name
        </label>
        <Input
          id={inputId}
          ref={input}
          value={name}
          autoFocus
          onChange={(event) => setName(event.target.value)}
        />
      </form>
    </Dialog>
  );
}
