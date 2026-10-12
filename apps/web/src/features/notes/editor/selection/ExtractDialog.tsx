import { type FormEvent, useState } from 'react';
import { Button } from '../../../../components/Button';
import { Dialog } from '../../../../components/Dialog';
import { Input } from '../../../../components/Input';
import { notifyError, notifySuccess } from '../../../../lib/notify';

/**
 * "Extract selection to a new note" (Phase 26), Obsidian's note composer: the selected text becomes a
 * new note beside this one, and a link to it takes its place — one undoable edit here, one new file.
 */

/** A title from the text: its first heading, or its first few words. */
export function suggestTitle(text: string): string {
  const heading = /^#{1,6}\s+(.+)$/mu.exec(text)?.[1];
  const words = (heading ?? text)
    .replace(/[#*_`~=[\]()>|^%$]/gu, ' ')
    .replace(/[\\/:"?<>|]/gu, ' ')
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, heading ? 12 : 6)
    .join(' ');
  return words.slice(0, 80) || 'Extracted note';
}

export function ExtractDialog({
  text,
  onExtract,
  onClose,
}: {
  text: string;
  /** Makes the note; resolves to the name to link to (null when it could not be made). */
  onExtract(title: string): Promise<string | null>;
  onClose(): void;
}) {
  const [title, setTitle] = useState(() => suggestTitle(text));
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const name = title.trim();
    if (!name) return;
    setBusy(true);
    try {
      const made = await onExtract(name);
      if (made) {
        notifySuccess(`Extracted to “${made}”`);
        onClose();
      }
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(false);
    }
  };
  const lines = text.split('\n').length;
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Extract to a new note"
      description={`${lines === 1 ? 'The selected text moves' : `The ${lines} selected lines move`} to a new note in this folder, and a link to the note takes its place.`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="extract-note" variant="primary" loading={busy}>
            Extract
          </Button>
        </>
      }
    >
      <form id="extract-note" onSubmit={(event) => void submit(event)}>
        <label className="block text-sm font-medium" htmlFor="extract-title">
          Title of the new note
        </label>
        <Input
          id="extract-title"
          autoFocus
          value={title}
          maxLength={120}
          onChange={(event) => setTitle(event.target.value)}
          className="mt-1.5 w-full"
        />
      </form>
    </Dialog>
  );
}
