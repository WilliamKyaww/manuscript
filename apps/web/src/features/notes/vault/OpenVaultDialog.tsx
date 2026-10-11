import type { VaultInspection } from '@skb/core';
import { FolderOpen } from 'lucide-react';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { create } from 'zustand';
import { Button } from '../../../components/Button';
import { Dialog } from '../../../components/Dialog';
import { Input } from '../../../components/Input';
import { desktopBridge } from '../../../lib/desktop';
import { notifyError } from '../../../lib/notify';
import { useVaultSwitch } from './vault-switch';

/**
 * "Open folder as vault…" from the Notes page (task 23.03), without going to Settings: choose a
 * folder (with the system's picker in the desktop app, or by its path), see what is in it, open it.
 */

export const useVaultDialog = create<{ open: boolean; setOpen(open: boolean): void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

export function OpenVaultDialog() {
  const open = useVaultDialog((state) => state.open);
  const setOpen = useVaultDialog((state) => state.setOpen);
  const vaults = useVaultSwitch();
  const bridge = desktopBridge();
  const [folder, setFolder] = useState('');
  const [inspection, setInspection] = useState<VaultInspection | null>(null);
  const inputId = useId();
  const formId = useId();

  useEffect(() => {
    if (!open) {
      setFolder('');
      setInspection(null);
    }
  }, [open]);

  const look = (path: string) => {
    setInspection(null);
    vaults.inspect.mutate(path.trim(), { onSuccess: setInspection, onError: notifyError });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (inspection && inspection.path === folder.trim()) vaults.switchTo(inspection.path);
    else if (folder.trim()) look(folder);
  };
  const browse = async () => {
    const picked = await bridge?.pickFolder({ title: 'Choose the folder to open as a vault' });
    if (!picked) return;
    setFolder(picked);
    look(picked);
  };
  const ready =
    inspection !== null &&
    inspection.path === folder.trim() &&
    !inspection.current &&
    !inspection.locked;

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Open folder as vault"
      description="A vault is a folder of Markdown notes, opened where it is. Obsidian vaults work as they are: only an id line is ever added to a note."
      footer={
        <>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          {ready ? (
            <Button
              variant="primary"
              loading={vaults.pending}
              onClick={() => inspection && vaults.switchTo(inspection.path)}
            >
              Open this vault
            </Button>
          ) : (
            <Button
              type="submit"
              form={formId}
              disabled={folder.trim() === ''}
              loading={vaults.inspect.isPending}
            >
              Look at it
            </Button>
          )}
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-3">
        {bridge && (
          <Button type="button" variant="primary" onClick={() => void browse()}>
            <FolderOpen aria-hidden="true" size={15} />
            Choose a folder…
          </Button>
        )}
        <div className="space-y-1">
          <label htmlFor={inputId} className="block text-sm font-medium">
            {bridge ? 'Or type its path' : 'The folder’s path'}
          </label>
          <Input
            id={inputId}
            value={folder}
            autoFocus={!bridge}
            placeholder="C:\Users\you\Documents\Obsidian\Uni"
            onChange={(event) => {
              setFolder(event.target.value);
              setInspection(null);
            }}
          />
        </div>
        {inspection && (
          <p role="status" className="rounded-md border border-border p-3 text-sm">
            {inspection.summary}
          </p>
        )}
        {vaults.message && (
          <p role="status" className="text-sm">
            {vaults.message}
          </p>
        )}
      </form>
    </Dialog>
  );
}
