import {
  fileUrl,
  getNoteEndpoint,
  getVersionEndpoint,
  type NoteTree,
  updateNoteEndpoint,
} from '@skb/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { FileText, Folder } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useApi } from '../../lib/api/context';
import { desktopBridge } from '../../lib/desktop';
import { notifyError, notifySuccess } from '../../lib/notify';
import { invalidateStructure } from './api';
import { RenameDialog } from './dialogs/RenameDialog';
import { SuggestDialog } from './dialogs/SuggestDialog';
import { VersionHistoryDialog } from './dialogs/VersionHistoryDialog';
import {
  bookmarksQuery,
  useCopyEntry,
  useKeepVersion,
  useMergeNote,
  useSetBookmarks,
} from './files-api';
import { useNotesUi } from './notes-store';
import { baseName, type NoteNode, parentOf, type TreeNode } from './tree/buildTree';
import { useVaultActions, type VaultActions } from './useVaultActions';
import { systemPath, useCurrentVault } from './vault/current-vault';
import { useActiveNote } from './workspace/active-note';
import { type SplitDirection, useWorkspace } from './workspace/workspace-store';

/**
 * Everything the file menus can do (tasks 23.08–23.09), shared by the "More options" menu of an open
 * note and the file tree's right-click menu: where to open a note, copies, moves, bookmarks,
 * merging, paths, version history and the desktop's own file commands.
 */

export type PathKind = 'vault' | 'system' | 'wikilink' | 'embed';

export interface FileActions extends VaultActions {
  openInNewTab(node: TreeNode): void;
  openToTheRight(node: TreeNode): void;
  split(noteId: string, direction: SplitDirection): void;
  openInWindow(node: TreeNode): void;
  requestRename(node: TreeNode): void;
  requestMove(node: TreeNode): void;
  copy(node: TreeNode): void;
  isBookmarked(path: string): boolean;
  toggleBookmark(node: TreeNode): void;
  requestMerge(node: NoteNode): void;
  copyPath(node: TreeNode, kind: PathKind): void;
  openHistory(node: NoteNode): void;
  /** Whether the desktop app's file commands are available (not in a browser). */
  desktop: boolean;
  /** The vault's folder on this computer, once known. */
  vaultRoot: string | null;
  openInDefaultApp(node: TreeNode): void;
  showInExplorer(node: TreeNode): void;
  reveal(node: TreeNode): void;
}

/** A tree node for an open note, so that the note's menu acts on the same thing as the tree's. */
export function nodeForNote(note: { id: string; path: string; title: string }): NoteNode {
  return {
    kind: 'note',
    id: note.id,
    path: note.path,
    title: note.title,
    name: baseName(note.path).replace(/\.md$/i, ''),
    modified: 0,
    created: 0,
  };
}

/** Opens a note in a window of its own: the desktop app allows exactly these addresses. */
export function openNoteWindow(noteId: string): void {
  window.open(
    `/notes/${encodeURIComponent(noteId)}?window=note`,
    `note-${noteId}`,
    'popup,width=960,height=820',
  );
}

export function useFileActions(tree: NoteTree | undefined): FileActions {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const vault = useVaultActions(tree);
  const current = useCurrentVault();
  const bridge = desktopBridge();
  const bookmarks = useQuery(bookmarksQuery(api));
  const setBookmarks = useSetBookmarks();
  const copyEntry = useCopyEntry();
  const merge = useMergeNote();
  const keepVersion = useKeepVersion();

  const [renaming, setRenaming] = useState<TreeNode | null>(null);
  const [moving, setMoving] = useState<TreeNode | null>(null);
  const [merging, setMerging] = useState<NoteNode | null>(null);
  const [mergeTarget, setMergeTarget] = useState<{ id: string; title: string } | null>(null);
  const [history, setHistory] = useState<NoteNode | null>(null);
  const [restoring, setRestoring] = useState(false);

  const root = current.vault?.path ?? null;
  const absolute = (path: string) => (root ? systemPath(root, path) : null);
  const bookmarked = useMemo(
    () => new Set((bookmarks.data?.items ?? []).map((item) => item.path)),
    [bookmarks.data],
  );

  const folders = useMemo(
    () => [
      { id: '', label: '/', detail: 'The top of the vault' },
      ...(tree?.folders ?? []).map((folder) => ({ id: folder, label: folder })),
    ],
    [tree],
  );
  const notes = useMemo(
    () =>
      (tree?.notes ?? [])
        .filter((note) => note.id !== merging?.id)
        .map((note) => ({
          id: note.id,
          label: baseName(note.path).replace(/\.md$/i, ''),
          detail: parentOf(note.path) || undefined,
          keywords: [note.title, ...note.aliases],
        })),
    [tree, merging],
  );

  /** Writes `content` over the note (the current text is kept as a version first). */
  const restoreContent = async (noteId: string, content: string) => {
    const view = useActiveNote.getState().view;
    if (view?.note.id === noteId) await view.flush();
    const kept = await keepVersion.mutateAsync(noteId);
    const detail = await api.request(getNoteEndpoint, { params: { id: noteId } });
    const bom = detail.content.startsWith('﻿') ? '﻿' : '';
    await api.request(updateNoteEndpoint, {
      params: { id: noteId },
      body: { content: bom + content, baseHash: detail.hash },
    });
    await invalidateStructure(queryClient);
    return kept.version;
  };

  const restore = (noteId: string, content: string) => {
    setRestoring(true);
    restoreContent(noteId, content)
      .then((previous) => {
        setHistory(null);
        toast.success('Version restored', {
          description: 'The text it replaced is kept in the version history.',
          action: previous
            ? {
                label: 'Undo',
                onClick: () =>
                  void api
                    .request(getVersionEndpoint, { params: { id: noteId, versionId: previous.id } })
                    .then((version) => restoreContent(noteId, version.content))
                    .then(() => notifySuccess('Restore undone'))
                    .catch(notifyError),
              }
            : undefined,
        });
      })
      .catch(notifyError)
      .finally(() => setRestoring(false));
  };

  const copyText = (text: string) =>
    navigator.clipboard
      .writeText(text)
      .then(() => notifySuccess('Copied', text))
      .catch(notifyError);

  const elements = (
    <>
      {vault.elements}
      <RenameDialog target={renaming} onCancel={() => setRenaming(null)} onRename={vault.rename} />
      <SuggestDialog
        open={moving !== null}
        onOpenChange={(open) => !open && setMoving(null)}
        title={`Move “${moving?.name ?? ''}” to a folder`}
        placeholder="Type a folder…"
        icon={<Folder size={16} />}
        items={folders.filter(
          (folder) =>
            moving === null ||
            (folder.id !== parentOf(moving.path) &&
              folder.id !== moving.path &&
              !folder.id.startsWith(`${moving.path}/`)),
        )}
        empty="No folder has that name."
        footer="↑↓ to choose · Enter to move · Esc to cancel"
        onChoose={(folder) => {
          if (moving) vault.move(moving, folder);
          setMoving(null);
        }}
      />
      <SuggestDialog
        open={merging !== null && mergeTarget === null}
        onOpenChange={(open) => !open && setMerging(null)}
        title={`Merge “${merging?.name ?? ''}” with another note`}
        placeholder="Type the note to merge it into…"
        icon={<FileText size={16} />}
        items={notes}
        empty="No note has that name."
        footer="Its text is added to the end of the note you choose."
        onChoose={(id) => {
          const note = tree?.notes.find((entry) => entry.id === id);
          if (note) setMergeTarget({ id, title: baseName(note.path).replace(/\.md$/i, '') });
        }}
      />
      <ConfirmDialog
        open={merging !== null && mergeTarget !== null}
        title={`Merge “${merging?.name ?? ''}” into “${mergeTarget?.title ?? ''}”?`}
        confirmLabel="Merge"
        busy={merge.isPending}
        onCancel={() => {
          setMerging(null);
          setMergeTarget(null);
        }}
        onConfirm={() => {
          if (!merging || !mergeTarget) return;
          const source = merging;
          merge.mutate(
            { sourceId: source.id, targetId: mergeTarget.id },
            {
              onSuccess: (result) => {
                setMerging(null);
                setMergeTarget(null);
                useWorkspace.getState().replaceNote(source.id, result.target.id);
                const links = result.retargeted.links;
                notifySuccess(
                  `Merged into “${result.target.title}”`,
                  links > 0
                    ? `${links} ${links === 1 ? 'link now points' : 'links now point'} at it. “${source.name}” is in the trash.`
                    : `“${source.name}” is in the trash.`,
                );
                for (const failure of result.failed)
                  toast.warning(failure.path, { description: failure.reason });
              },
              onError: notifyError,
            },
          );
        }}
      >
        <p>
          The text of “{merging?.name}” is added to the end of “{mergeTarget?.title}”, links to it
          are changed to point at “{mergeTarget?.title}”, and “{merging?.name}” moves to the trash.
        </p>
        <p className="text-muted">
          The text “{mergeTarget?.title}” had before is kept in its version history.
        </p>
      </ConfirmDialog>
      <VersionHistoryDialog
        noteId={history?.id ?? null}
        title={history?.name ?? ''}
        restoring={restoring}
        onClose={() => setHistory(null)}
        onRestore={(content) => history && restore(history.id, content)}
      />
    </>
  );

  const openNote = (id: string) => void navigate({ to: '/notes/$noteId', params: { noteId: id } });

  return {
    ...vault,
    elements,
    openInNewTab(node) {
      if (node.kind === 'note') useWorkspace.getState().openInNewTab(node.id);
      else vault.open(node);
    },
    openToTheRight(node) {
      if (node.kind === 'note') useWorkspace.getState().openInOtherPane(node.id, 'right');
    },
    split(noteId, direction) {
      useWorkspace.getState().openInOtherPane(noteId, direction);
    },
    openInWindow(node) {
      if (node.kind === 'note') openNoteWindow(node.id);
      else vault.open(node);
    },
    requestRename: setRenaming,
    requestMove: setMoving,
    copy(node) {
      copyEntry.mutate(node.path, {
        onSuccess: (result) =>
          toast.success('Copy made', {
            description: result.path,
            action: result.noteId
              ? { label: 'Open', onClick: () => result.noteId && openNote(result.noteId) }
              : undefined,
          }),
        onError: notifyError,
      });
    },
    isBookmarked: (path) => bookmarked.has(path),
    toggleBookmark(node) {
      const items = bookmarks.data?.items ?? [];
      const next = bookmarked.has(node.path)
        ? items.filter((item) => item.path !== node.path)
        : [...items, { path: node.path, kind: node.kind }];
      setBookmarks.mutate(next, {
        onSuccess: () =>
          notifySuccess(bookmarked.has(node.path) ? 'Bookmark removed' : 'Bookmarked', node.name),
        onError: notifyError,
      });
    },
    requestMerge: setMerging,
    copyPath(node, kind) {
      if (kind === 'vault') return void copyText(node.path);
      if (kind === 'system') {
        const path = absolute(node.path);
        if (path) void copyText(path);
        return;
      }
      const name = node.kind === 'note' ? node.name : baseName(node.path);
      void copyText(kind === 'embed' ? `![[${name}]]` : `[[${name}]]`);
    },
    openHistory: setHistory,
    desktop: bridge !== null,
    vaultRoot: root,
    openInDefaultApp(node) {
      const path = absolute(node.path);
      if (bridge && path) {
        void bridge.openPath(path).then((opened) => {
          if (!opened) toast.error('That file could not be opened', { description: path });
        });
      } else if (node.kind === 'attachment') {
        window.open(fileUrl(node.path), '_blank', 'noopener');
      }
    },
    showInExplorer(node) {
      const path = absolute(node.path);
      if (bridge && path) void bridge.revealInExplorer(path);
    },
    reveal(node) {
      useNotesUi.getState().reveal(node.path);
    },
  };
}
