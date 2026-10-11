import {
  ATTACHMENT_UPLOAD_PATH,
  backlinksEndpoint,
  type CreateNoteInput,
  createFolderEndpoint,
  createNoteEndpoint,
  getNoteEndpoint,
  linkMentionEndpoint,
  listNotesEndpoint,
  listTagsEndpoint,
  listTemplatesEndpoint,
  listTrashEndpoint,
  moveEntryEndpoint,
  movePreviewEndpoint,
  type NoteDetail,
  type NoteTree,
  purgeTrashEndpoint,
  restoreTrashEndpoint,
  trashEntryEndpoint,
  UploadedAttachmentSchema,
  unlinkedMentionsEndpoint,
} from '@skb/core';
import { type QueryClient, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApiClient } from '../../lib/api/client';
import { useApi } from '../../lib/api/context';
import { useNotesUi } from './notes-store';

/** Query keys for the notes feature (one factory per feature, architecture.md §4). */
export const notesKeys = {
  all: ['notes'] as const,
  tree: () => ['notes', 'tree'] as const,
  note: (id: string) => ['notes', 'note', id] as const,
  backlinks: (id: string) => ['notes', 'backlinks', id] as const,
  mentions: (id: string) => ['notes', 'mentions', id] as const,
  tags: () => ['notes', 'tags'] as const,
  templates: () => ['notes', 'templates'] as const,
  trash: () => ['notes', 'trash'] as const,
  versions: (id: string) => ['notes', 'versions', id] as const,
  version: (id: string, versionId: string) => ['notes', 'versions', id, versionId] as const,
  bookmarks: () => ['notes', 'bookmarks'] as const,
};

export function treeQuery(api: ApiClient) {
  return queryOptions({
    queryKey: notesKeys.tree(),
    queryFn: () => api.request(listNotesEndpoint),
    staleTime: 60_000,
  });
}

export function noteQuery(api: ApiClient, id: string) {
  return queryOptions({
    queryKey: notesKeys.note(id),
    queryFn: () => api.request(getNoteEndpoint, { params: { id } }),
    staleTime: 10_000,
  });
}

export function backlinksQuery(api: ApiClient, id: string) {
  return queryOptions({
    queryKey: notesKeys.backlinks(id),
    queryFn: () => api.request(backlinksEndpoint, { params: { id } }),
  });
}

export function mentionsQuery(api: ApiClient, id: string) {
  return queryOptions({
    queryKey: notesKeys.mentions(id),
    queryFn: () => api.request(unlinkedMentionsEndpoint, { params: { id } }),
  });
}

export function tagsQuery(api: ApiClient) {
  return queryOptions({ queryKey: notesKeys.tags(), queryFn: () => api.request(listTagsEndpoint) });
}

export function templatesQuery(api: ApiClient) {
  return queryOptions({
    queryKey: notesKeys.templates(),
    queryFn: () => api.request(listTemplatesEndpoint),
  });
}

export function trashQuery(api: ApiClient) {
  return queryOptions({
    queryKey: notesKeys.trash(),
    queryFn: () => api.request(listTrashEndpoint),
  });
}

/**
 * Updates the cached tree entry for a saved note in place. Saves happen every few seconds while
 * typing; refetching a 10,000-note tree each time would be wasteful.
 */
export function patchTreeNote(queryClient: QueryClient, note: NoteDetail): void {
  queryClient.setQueryData<NoteTree>(notesKeys.tree(), (tree) => {
    if (!tree) return tree;
    const summary = {
      id: note.id,
      path: note.path,
      title: note.title,
      type: note.type,
      aliases: note.aliases,
      updatedAt: note.updatedAt,
      createdAt: note.createdAt,
    };
    const index = tree.notes.findIndex((entry) => entry.id === note.id);
    const notes = [...tree.notes];
    if (index === -1) notes.push(summary);
    else notes[index] = summary;
    return { ...tree, notes };
  });
}

/** After anything that changes the vault's structure or links. */
export function invalidateStructure(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: notesKeys.all });
}

export function useCreateNote() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateNoteInput) => api.request(createNoteEndpoint, { body }),
    onSuccess: async (note) => {
      queryClient.setQueryData(notesKeys.note(note.id), note);
      // Wherever it was made from, a new note opens ready to write in.
      useNotesUi.getState().setJustCreated(note.id);
      await invalidateStructure(queryClient);
    },
  });
}

export function useCreateFolder() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => api.request(createFolderEndpoint, { body: { path } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notesKeys.tree() }),
  });
}

export function useMovePreview() {
  const api = useApi();
  return useMutation({
    mutationFn: (body: { from: string; to: string }) => api.request(movePreviewEndpoint, { body }),
  });
}

export function useMoveEntry() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { from: string; to: string; rewriteLinks: boolean }) =>
      api.request(moveEntryEndpoint, { body }),
    onSuccess: () => invalidateStructure(queryClient),
  });
}

export function useTrashEntry() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => api.request(trashEntryEndpoint, { body: { path } }),
    onSuccess: () => invalidateStructure(queryClient),
  });
}

export function useRestoreTrash() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.request(restoreTrashEndpoint, { params: { id } }),
    onSuccess: () => invalidateStructure(queryClient),
  });
}

export function usePurgeTrash() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.request(purgeTrashEndpoint, { params: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notesKeys.trash() }),
  });
}

export function useLinkMention(targetId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { sourceId: string; sourceHash: string; offset: number; text: string }) =>
      api.request(linkMentionEndpoint, { params: { id: targetId }, body }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: notesKeys.backlinks(targetId) }),
        queryClient.invalidateQueries({ queryKey: notesKeys.mentions(targetId) }),
      ]),
  });
}

export function useUploadAttachment() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, folder }: { file: File; folder?: string }) => {
      const form = new FormData();
      form.append('file', file);
      if (folder) form.append('folder', folder);
      return api.upload(ATTACHMENT_UPLOAD_PATH, form, UploadedAttachmentSchema);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notesKeys.tree() }),
  });
}
