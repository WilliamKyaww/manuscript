import { FilePlus, FolderOpen, Search, X } from 'lucide-react';
import { useLayoutStore } from '../../../app/layout-store';
import { keyLabels } from '../../../app/shortcuts/registry';
import { Button } from '../../../components/Button';
import { Kbd } from '../../../components/Kbd';
import { isApplePlatform } from '../../../lib/platform';

/**
 * What a tab with no note shows (tasks 23.03–23.04). In an empty vault it says so and offers the two
 * ways forward — write the first note here, or open the folder where the notes are; otherwise it
 * offers what Obsidian's empty tab does.
 */
export function EmptyTab({
  vaultName,
  vaultEmpty,
  canClose,
  onNewNote,
  onOpenVault,
  onClose,
}: {
  vaultName: string | null;
  vaultEmpty: boolean;
  canClose: boolean;
  onNewNote(): void;
  onOpenVault(): void;
  onClose(): void;
}) {
  const openSwitcher = () => useLayoutStore.getState().setQuickSwitcherOpen(true);
  return (
    <div className="flex min-h-full flex-1 items-center justify-center p-8">
      <div className="w-full max-w-sm animate-rise-in text-center">
        {vaultEmpty ? (
          <>
            <h3 className="text-lg font-semibold">
              {vaultName ? `“${vaultName}” has no notes yet` : 'This vault has no notes yet'}
            </h3>
            <p className="mt-1 text-sm text-muted">
              Notes are Markdown files in the vault’s folder. Write the first one here, or open the
              folder where your notes already are — an Obsidian vault works as it is.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <Button variant="primary" onClick={onNewNote}>
                <FilePlus aria-hidden="true" size={15} />
                Create a note
              </Button>
              <Button onClick={onOpenVault}>
                <FolderOpen aria-hidden="true" size={15} />
                Open another vault…
              </Button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-lg font-semibold">No note is open</h3>
            <p className="mt-1 text-sm text-muted">
              Choose one in the file list, or find it by name.
            </p>
            <ul className="mt-5 space-y-1 text-sm">
              <li>
                <Button variant="ghost" className="w-full justify-between" onClick={onNewNote}>
                  <span className="flex items-center gap-2">
                    <FilePlus aria-hidden="true" size={15} />
                    Create a note
                  </span>
                </Button>
              </li>
              <li>
                <Button variant="ghost" className="w-full justify-between" onClick={openSwitcher}>
                  <span className="flex items-center gap-2">
                    <Search aria-hidden="true" size={15} />
                    Go to a note
                  </span>
                  <span className="flex gap-1 text-xs text-muted">
                    {keyLabels('mod+o', isApplePlatform()).map((key) => (
                      <Kbd key={key}>{key}</Kbd>
                    ))}
                  </span>
                </Button>
              </li>
              {canClose && (
                <li>
                  <Button variant="ghost" className="w-full justify-between" onClick={onClose}>
                    <span className="flex items-center gap-2">
                      <X aria-hidden="true" size={15} />
                      Close this tab
                    </span>
                  </Button>
                </li>
              )}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
