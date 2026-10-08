import type { TrashItem } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { FileText, Folder, Paperclip, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../components/Button';
import { Dialog } from '../../../components/Dialog';
import { EmptyState, ErrorState, LoadingState } from '../../../components/States';
import { useApi } from '../../../lib/api/context';
import { formatDateTime } from '../../../lib/format';
import { notifySuccess } from '../../../lib/notify';
import { trashQuery, usePurgeTrash, useRestoreTrash } from '../api';

const ICONS = { note: FileText, folder: Folder, attachment: Paperclip };

/**
 * The trash (task 3.08): everything deleted in the app, restorable to its original place until it
 * expires. Deleting permanently asks for confirmation first.
 */
export function TrashView({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const api = useApi();
  const trash = useQuery({ ...trashQuery(api), enabled: open });
  const restore = useRestoreTrash();
  const purge = usePurgeTrash();
  const [confirming, setConfirming] = useState<TrashItem | null>(null);

  return (
    <>
      <Dialog
        open={open && confirming === null}
        onOpenChange={onOpenChange}
        title="Trash"
        description={
          trash.data
            ? `Deleted notes, folders and attachments are kept for ${trash.data.retentionDays} days.`
            : undefined
        }
        size="lg"
      >
        {trash.isPending && <LoadingState label="Loading the trash" />}
        {trash.isError && (
          <ErrorState
            message="The trash could not be loaded."
            onRetry={() => void trash.refetch()}
          />
        )}
        {trash.data && trash.data.items.length === 0 && (
          <EmptyState icon={<Trash2 size={20} />} title="The trash is empty" />
        )}
        <ul className="divide-y divide-border">
          {trash.data?.items.map((item) => {
            const Icon = ICONS[item.kind];
            return (
              <li key={item.id} className="flex items-center gap-3 py-2 text-sm">
                <Icon aria-hidden="true" size={16} className="shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.originalPath}</p>
                  <p className="text-xs text-muted">
                    Deleted {formatDateTime(new Date(item.deletedAt))}
                    {item.kind === 'folder'
                      ? ` · ${item.notes} ${item.notes === 1 ? 'note' : 'notes'}`
                      : ''}{' '}
                    · kept until {formatDateTime(new Date(item.expiresAt))}
                  </p>
                </div>
                <Button
                  size="sm"
                  loading={restore.isPending && restore.variables === item.id}
                  onClick={() =>
                    restore.mutate(item.id, {
                      onSuccess: (result) => notifySuccess('Restored', result.path),
                    })
                  }
                >
                  <RotateCcw aria-hidden="true" size={14} />
                  Restore
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Delete ${item.originalPath} permanently`}
                  onClick={() => setConfirming(item)}
                >
                  <Trash2 aria-hidden="true" size={14} />
                </Button>
              </li>
            );
          })}
        </ul>
      </Dialog>
      <Dialog
        open={confirming !== null}
        onOpenChange={(next) => !next && setConfirming(null)}
        title="Delete permanently?"
        size="sm"
        footer={
          <>
            <Button onClick={() => setConfirming(null)}>Cancel</Button>
            <Button
              variant="danger"
              loading={purge.isPending}
              onClick={() =>
                confirming &&
                purge.mutate(confirming.id, {
                  onSuccess: () => {
                    notifySuccess('Deleted permanently', confirming.originalPath);
                    setConfirming(null);
                  },
                })
              }
            >
              Delete permanently
            </Button>
          </>
        }
      >
        <p className="text-sm">
          “{confirming?.originalPath}” will be removed from your disk. This cannot be undone.
        </p>
      </Dialog>
    </>
  );
}
