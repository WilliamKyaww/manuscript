import type { NoteTree } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ChevronRight, FileText, Folder, Paperclip, X } from 'lucide-react';
import { useState } from 'react';
import { useApi } from '../../../lib/api/context';
import { cn } from '../../../lib/cn';
import { bookmarksQuery } from '../files-api';
import { useNotesUi } from '../notes-store';
import { baseName, type TreeNode } from '../tree/buildTree';
import { type FileActions, nodeForNote } from '../useFileActions';

/**
 * Bookmarked notes, folders and attachments above the file tree (task 23.09). A note opens, a
 * folder is revealed in the tree, an attachment opens in its own tab; a bookmark whose file is
 * gone stays (restoring the file brings it back) and says so.
 */
export function Bookmarks({ tree, actions }: { tree: NoteTree; actions: FileActions }) {
  const api = useApi();
  const navigate = useNavigate();
  const bookmarks = useQuery(bookmarksQuery(api));
  const [open, setOpen] = useState(true);
  const items = bookmarks.data?.items ?? [];
  if (items.length === 0) return null;

  const notes = new Map(tree.notes.map((note) => [note.path, note]));
  const folders = new Set(tree.folders);
  const attachments = new Map(tree.attachments.map((attachment) => [attachment.path, attachment]));

  const nodeFor = (path: string, kind: string): TreeNode | null => {
    const note = notes.get(path);
    if (kind === 'note' && note) return nodeForNote(note);
    if (kind === 'folder' && folders.has(path))
      return { kind: 'folder', path, name: baseName(path), children: [] };
    const attachment = attachments.get(path);
    if (kind === 'attachment' && attachment)
      return {
        kind: 'attachment',
        path,
        name: baseName(path),
        mediaType: attachment.mediaType,
        modified: 0,
        created: 0,
      };
    return null;
  };

  return (
    <section aria-label="Bookmarks" className="border-b border-chrome-line py-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-7 w-full items-center gap-1 px-1.5 text-xs font-medium text-muted hover:text-text"
      >
        <ChevronRight
          aria-hidden="true"
          size={14}
          className={cn('transition-transform duration-(--skb-duration-fast)', open && 'rotate-90')}
        />
        Bookmarks
      </button>
      {open && (
        <ul className="text-sm">
          {items.map((item) => {
            const node = nodeFor(item.path, item.kind);
            const Icon =
              item.kind === 'folder' ? Folder : item.kind === 'note' ? FileText : Paperclip;
            const name = baseName(item.path).replace(/\.md$/i, '');
            return (
              <li
                key={item.path}
                className="group flex h-7 items-center pr-1 pl-6 hover:bg-surface-hover"
              >
                <button
                  type="button"
                  disabled={node === null}
                  title={node ? item.path : `${item.path} is not in the vault`}
                  onClick={() => {
                    if (!node) return;
                    if (node.kind === 'note')
                      void navigate({ to: '/notes/$noteId', params: { noteId: node.id } });
                    else if (node.kind === 'folder') useNotesUi.getState().reveal(node.path);
                    else actions.open(node);
                  }}
                  className="flex h-full min-w-0 flex-1 items-center gap-1.5 text-left disabled:text-subtle"
                >
                  <Icon aria-hidden="true" size={14} className="shrink-0 text-muted" />
                  <span className="truncate">{name}</span>
                  {node === null && <span className="shrink-0 text-xs">(missing)</span>}
                </button>
                <button
                  type="button"
                  aria-label={`Remove the bookmark of ${name}`}
                  title="Remove bookmark"
                  onClick={() =>
                    actions.toggleBookmark(
                      node ?? { kind: 'folder', path: item.path, name, children: [] },
                    )
                  }
                  className="flex size-6 shrink-0 items-center justify-center rounded-sm text-subtle opacity-0 group-hover:opacity-100 hover:text-text focus-visible:opacity-100"
                >
                  <X aria-hidden="true" size={13} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
