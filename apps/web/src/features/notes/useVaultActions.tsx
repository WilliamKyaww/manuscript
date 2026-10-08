import { fileUrl, type MovePreview, type NoteTree } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { useApi } from '../../lib/api/context';
import { notifyError, notifySuccess } from '../../lib/notify';
import {
  trashQuery,
  useCreateFolder,
  useCreateNote,
  useMoveEntry,
  useMovePreview,
  useRestoreTrash,
  useTrashEntry,
} from './api';
import { LinkRewriteDialog, NewFolderDialog, TrashDialog } from './dialogs/EntryDialogs';
import { NewNoteDialog } from './dialogs/NewNoteDialog';
import { parentOf, type TreeNode } from './tree/buildTree';

/**
 * Vault operations behind the file tree and the notes page (task 3.13): create, rename, move (with a
 * link-rewrite preview whenever links would otherwise change meaning), trash with undo, copy link.
 */

const INVALID_NAME = /[<>:"/\\|?*#^[\]]|^\s|\s$|\.$/;

export interface VaultActions {
  openNewNote(folder: string, title?: string): void;
  createNoteNow(title: string, folder: string): void;
  openNewFolder(parent: string): void;
  rename(node: TreeNode, name: string): void;
  move(node: TreeNode, folder: string): void;
  remove(node: TreeNode): void;
  copyLink(node: TreeNode): void;
  open(node: TreeNode): void;
  /** Dialogues to render once on the page. */
  elements: ReactNode;
}

export function useVaultActions(
  tree: NoteTree | undefined,
  activePath: string | null,
): VaultActions {
  const api = useApi();
  const navigate = useNavigate();
  const createNote = useCreateNote();
  const createFolder = useCreateFolder();
  const movePreview = useMovePreview();
  const moveEntry = useMoveEntry();
  const trashEntry = useTrashEntry();
  const restore = useRestoreTrash();

  const [newNote, setNewNote] = useState<{ folder: string; title: string } | null>(null);
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<MovePreview | null>(null);
  const [trashTarget, setTrashTarget] = useState<TreeNode | null>(null);
  const trash = useQuery({ ...trashQuery(api), enabled: trashTarget !== null });

  const openNote = (id: string) => void navigate({ to: '/notes/$noteId', params: { noteId: id } });

  const applyMove = (from: string, to: string, rewriteLinks: boolean) => {
    moveEntry.mutate(
      { from, to, rewriteLinks },
      {
        onSuccess: (result) => {
          setPendingMove(null);
          const links = result.rewritten.links;
          notifySuccess(
            parentOf(from) === parentOf(to) ? 'Renamed' : 'Moved',
            links > 0
              ? `${links} ${links === 1 ? 'link' : 'links'} updated in ${result.rewritten.notes} ${result.rewritten.notes === 1 ? 'note' : 'notes'}.`
              : undefined,
          );
          for (const failure of result.failed)
            toast.warning(failure.path, { description: failure.reason });
        },
      },
    );
  };

  const requestMove = (from: string, to: string) => {
    if (from === to) return;
    movePreview.mutate(
      { from, to },
      {
        onSuccess: (preview) => {
          if (preview.rewrites.length === 0) applyMove(from, to, true);
          else setPendingMove(preview);
        },
      },
    );
  };

  const targetPath = (node: TreeNode, folder: string, name: string) => {
    const prefix = folder ? `${folder}/` : '';
    if (node.kind === 'note') return `${prefix}${name.replace(/\.md$/i, '')}.md`;
    if (node.kind === 'attachment' && !name.includes('.')) {
      const dot = node.name.lastIndexOf('.');
      return `${prefix}${name}${dot > 0 ? node.name.slice(dot) : ''}`;
    }
    return `${prefix}${name}`;
  };

  const notesInside =
    trashTarget?.kind === 'folder'
      ? (tree?.notes.filter((note) => note.path.startsWith(`${trashTarget.path}/`)).length ?? 0)
      : 0;

  const elements = (
    <>
      <NewNoteDialog
        open={newNote !== null}
        onOpenChange={(open) => !open && setNewNote(null)}
        folders={tree?.folders ?? []}
        defaultFolder={newNote?.folder ?? ''}
        defaultTitle={newNote?.title ?? ''}
        onCreated={(note) => openNote(note.id)}
      />
      <NewFolderDialog
        open={newFolderParent !== null}
        parent={newFolderParent ?? ''}
        busy={createFolder.isPending}
        onOpenChange={(open) => !open && setNewFolderParent(null)}
        onSubmit={(path) =>
          createFolder.mutate(path, {
            onSuccess: () => {
              setNewFolderParent(null);
              notifySuccess('Folder created', path);
            },
          })
        }
      />
      <LinkRewriteDialog
        preview={pendingMove}
        busy={moveEntry.isPending}
        onCancel={() => setPendingMove(null)}
        onConfirm={(rewriteLinks) =>
          pendingMove && applyMove(pendingMove.from, pendingMove.to, rewriteLinks)
        }
      />
      <TrashDialog
        target={trashTarget}
        notesInside={notesInside}
        retentionDays={trash.data?.retentionDays ?? 30}
        busy={trashEntry.isPending}
        onCancel={() => setTrashTarget(null)}
        onConfirm={() => {
          if (!trashTarget) return;
          const target = trashTarget;
          trashEntry.mutate(target.path, {
            onSuccess: (item) => {
              setTrashTarget(null);
              if (
                activePath &&
                (activePath === target.path || activePath.startsWith(`${target.path}/`))
              ) {
                void navigate({ to: '/notes' });
              }
              toast.success(`Moved “${target.name}” to the trash`, {
                action: {
                  label: 'Undo',
                  onClick: () =>
                    restore.mutate(item.id, {
                      onSuccess: (result) => notifySuccess('Restored', result.path),
                    }),
                },
              });
            },
          });
        }}
      />
    </>
  );

  return {
    openNewNote: (folder, title = '') => setNewNote({ folder, title }),
    createNoteNow: (title, folder) =>
      createNote.mutate({ title, folder }, { onSuccess: (note) => openNote(note.id) }),
    openNewFolder: (parent) => setNewFolderParent(parent),
    rename(node, name) {
      if (INVALID_NAME.test(name)) {
        notifyError(
          new Error(
            'Names cannot contain < > : " / \\ | ? * # ^ [ ], or start or end with a space or a full stop.',
          ),
        );
        return;
      }
      requestMove(node.path, targetPath(node, parentOf(node.path), name));
    },
    move(node, folder) {
      requestMove(
        node.path,
        folder
          ? `${folder}/${node.path.slice(node.path.lastIndexOf('/') + 1)}`
          : node.path.slice(node.path.lastIndexOf('/') + 1),
      );
    },
    remove: (node) => setTrashTarget(node),
    copyLink(node) {
      const text = node.kind === 'note' ? `[[${node.name}]]` : `![[${node.name}]]`;
      navigator.clipboard
        .writeText(text)
        .then(() => notifySuccess('Copied', text))
        .catch(notifyError);
    },
    open(node) {
      if (node.kind === 'note') openNote(node.id);
      else if (node.kind === 'attachment') window.open(fileUrl(node.path), '_blank', 'noopener');
    },
    elements,
  };
}
