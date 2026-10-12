import { useNavigate } from '@tanstack/react-router';
import { ChevronsUpDown, Copy, FolderOpen, FolderPlus, Settings, Vault } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../components/DropdownMenu';
import { desktopBridge } from '../../../lib/desktop';
import { notifyError, notifySuccess } from '../../../lib/notify';
import { useCurrentVault } from './current-vault';
import { useVaultDialog } from './OpenVaultDialog';
import { useVaultSwitch } from './vault-switch';

/**
 * The open vault, at the foot of the Files pane as in Obsidian (task 23.03): its name, and a menu to
 * open a recent vault or another folder, show or copy where it is, and manage vaults in Settings.
 * Says "No vault open" when the server cannot say which vault it has.
 */
export function VaultSwitcher() {
  const current = useCurrentVault();
  const navigate = useNavigate();
  const vaults = useVaultSwitch();
  const bridge = desktopBridge();
  const openDialog = () => useVaultDialog.getState().setOpen(true);
  const others = current.recent.filter((entry) => !entry.current);
  const name = current.vault?.name ?? null;

  return (
    <div className="flex-none border-t border-chrome-line px-2 py-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-vault-switcher
            aria-label={name ? `Vault: ${name}. Change vault` : 'No vault open. Open a vault'}
            className="flex h-9 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-surface-hover"
          >
            <Vault aria-hidden="true" size={15} className="shrink-0 text-muted" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">
                {current.isPending ? 'Loading vault…' : (name ?? 'No vault open')}
              </span>
            </span>
            <ChevronsUpDown aria-hidden="true" size={14} className="shrink-0 text-subtle" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {current.vault && (
            <>
              <DropdownMenuLabel>Open now</DropdownMenuLabel>
              <div className="px-2 pb-1.5">
                <p className="truncate text-sm font-medium">{current.vault.name}</p>
                <p className="break-all font-mono text-xs text-muted">{current.vault.path}</p>
              </div>
              {bridge ? (
                <DropdownMenuItem
                  icon={<FolderOpen size={15} />}
                  onSelect={() => current.vault && void bridge.revealInExplorer(current.vault.path)}
                >
                  Show the vault folder
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  icon={<Copy size={15} />}
                  onSelect={() =>
                    current.vault &&
                    navigator.clipboard
                      .writeText(current.vault.path)
                      .then(() => notifySuccess('Path copied'))
                      .catch(notifyError)
                  }
                >
                  Copy the vault’s path
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
            </>
          )}
          {others.length > 0 && (
            <>
              <DropdownMenuLabel>Recent vaults</DropdownMenuLabel>
              {others.map((entry) => (
                <DropdownMenuItem
                  key={entry.path}
                  disabled={!entry.exists || vaults.pending}
                  icon={<Vault size={15} />}
                  onSelect={() => vaults.switchTo(entry.path)}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{entry.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {entry.exists ? entry.path : 'Not found'}
                    </span>
                  </span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem icon={<FolderPlus size={15} />} onSelect={openDialog}>
            Open folder as vault…
          </DropdownMenuItem>
          <DropdownMenuItem
            icon={<Settings size={15} />}
            onSelect={() => void navigate({ to: '/settings' })}
          >
            Manage vaults…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {vaults.message && (
        <p role="status" className="px-2 pt-1 text-xs text-muted">
          {vaults.message}
        </p>
      )}
      {current.isError && (
        <p className="px-2 pt-1 text-xs text-muted">
          Which vault is open could not be read.{' '}
          <button type="button" className="underline" onClick={current.refetch}>
            Try again
          </button>
        </p>
      )}
    </div>
  );
}
