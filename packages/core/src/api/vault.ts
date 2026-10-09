import { z } from 'zod';
import { defineEndpoint } from './contract';
import { JobSummarySchema } from './jobs';
import { IndexStatusSchema, NoteIdSchema, NoteRefSchema, VaultPathSchema } from './notes';

/**
 * Vault entries — notes, folders and attachments addressed by path: folders, moves (with link
 * rewriting), the trash, uploads, notes settings and the live event stream.
 */

export const createFolderEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/folders',
  status: 201,
  body: z.object({ path: VaultPathSchema }),
  response: z.object({ path: z.string() }),
});

export const MoveBodySchema = z.object({
  /** Current path of a note, folder or attachment. */
  from: VaultPathSchema,
  /** New path (for a note, including `.md`). */
  to: VaultPathSchema,
});

export const LinkRewriteSchema = z.object({
  source: NoteRefSchema,
  /** Links in this note that would no longer point at the same place without rewriting. */
  links: z.number().int().positive(),
});

export const MovePreviewSchema = z.object({
  from: z.string(),
  to: z.string(),
  kind: z.enum(['note', 'folder', 'attachment']),
  /** Notes (and attachments) that move. */
  entries: z.number().int().nonnegative(),
  rewrites: z.array(LinkRewriteSchema),
});
export type MovePreview = z.infer<typeof MovePreviewSchema>;

export const movePreviewEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/entries/move-preview',
  body: MoveBodySchema,
  response: MovePreviewSchema,
});

export const moveEntryEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/entries/move',
  body: MoveBodySchema.extend({ rewriteLinks: z.boolean() }),
  response: z.object({
    from: z.string(),
    to: z.string(),
    /** Set when a single note moved. */
    noteId: NoteIdSchema.nullable(),
    rewritten: z.object({
      notes: z.number().int().nonnegative(),
      links: z.number().int().nonnegative(),
    }),
    /** Notes whose links could not be rewritten (e.g. invalid frontmatter edits are never attempted). */
    failed: z.array(z.object({ path: z.string(), reason: z.string() })),
  }),
});

export const TrashIdSchema = z.string().regex(/^\d{8}T\d{6}Z-[0-9a-f]{8}$/, 'Not a trash item id.');

export const TrashItemSchema = z.object({
  id: TrashIdSchema,
  originalPath: z.string(),
  kind: z.enum(['note', 'folder', 'attachment']),
  deletedAt: z.string(),
  /** Number of notes inside (1 for a note, 0 for an attachment). */
  notes: z.number().int().nonnegative(),
  expiresAt: z.string(),
});
export type TrashItem = z.infer<typeof TrashItemSchema>;

export const trashEntryEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/entries/trash',
  body: z.object({ path: VaultPathSchema }),
  response: TrashItemSchema,
});

export const listTrashEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/trash',
  response: z.object({
    items: z.array(TrashItemSchema),
    retentionDays: z.number().int().positive(),
  }),
});

const TrashParams = z.object({ id: TrashIdSchema });

export const restoreTrashEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/trash/:id/restore',
  params: TrashParams,
  response: z.object({ path: z.string() }),
});

export const purgeTrashEndpoint = defineEndpoint({
  method: 'DELETE',
  path: '/api/trash/:id',
  params: TrashParams,
  response: z.object({ ok: z.literal(true) }),
});

/** Response of `POST /api/attachments` (multipart: `file`, optional `folder`). */
export const UploadedAttachmentSchema = z.object({
  path: z.string(),
  name: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  mediaType: z.string(),
  /** Ready-to-insert embed, e.g. `![[diagram.png]]`. */
  embed: z.string(),
});
export type UploadedAttachment = z.infer<typeof UploadedAttachmentSchema>;

export const ATTACHMENT_UPLOAD_PATH = '/api/attachments';
export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

/** Vault files are served (authenticated) under this prefix, e.g. `/api/files/Attachments/a.png`. */
export const FILES_PATH_PREFIX = '/api/files/';

export function fileUrl(path: string): string {
  return `${FILES_PATH_PREFIX}${path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;
}

export const NotesSettingsSchema = z.object({
  /**
   * `on-demand` (default): an `id` is written into a note's frontmatter only when other data must
   * refer to it. `on-index`: every note gets one when first indexed.
   */
  assignIds: z.enum(['on-demand', 'on-index']),
  /** Extra paths to leave out of the index (`*`, `**` and trailing `/` supported). */
  ignorePatterns: z.array(z.string().trim().min(1).max(200)).max(100),
  attachmentsFolder: z.string().trim().min(1).max(200),
  templatesFolder: z.string().trim().min(1).max(200),
  trashRetentionDays: z.number().int().min(1).max(3650),
});
export type NotesSettings = z.infer<typeof NotesSettingsSchema>;

export const DEFAULT_NOTES_SETTINGS: NotesSettings = {
  assignIds: 'on-demand',
  ignorePatterns: [],
  attachmentsFolder: 'Attachments',
  templatesFolder: 'Templates',
  trashRetentionDays: 30,
};

export const getNotesSettingsEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/settings/notes',
  response: NotesSettingsSchema,
});

export const updateNotesSettingsEndpoint = defineEndpoint({
  method: 'PUT',
  path: '/api/settings/notes',
  body: NotesSettingsSchema.partial(),
  response: NotesSettingsSchema,
});

export const NoteChangeSchema = z.object({
  kind: z.enum(['created', 'updated', 'deleted', 'moved']),
  id: NoteIdSchema,
  path: z.string(),
  /** Previous path for moves. */
  from: z.string().nullable(),
  /** File hash after the change (null for deletions). */
  hash: z.string().nullable(),
  /** `app` for changes made through this server, `external` for edits in other programs. */
  origin: z.enum(['app', 'external']),
});
export type NoteChange = z.infer<typeof NoteChangeSchema>;

/** Messages on the `GET /api/events` server-sent event stream. */
export const ServerEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), startedAt: z.string() }),
  z.object({
    type: z.literal('vault.changed'),
    notes: z.array(NoteChangeSchema),
    /** Folders or attachments changed (the tree should be refreshed). */
    structure: z.boolean(),
  }),
  z.object({ type: z.literal('index.status'), status: IndexStatusSchema }),
  /** Sources were imported, changed state, moved or were deleted: refetch them. */
  z.object({ type: z.literal('sources.changed'), ids: z.array(z.string()) }),
  /** A background job progressed or changed state (throttled while running). */
  z.object({ type: z.literal('job.updated'), job: JobSummarySchema }),
  /**
   * Data kept only in the database changed: the course structure, concepts, relations, or the
   * Inbox (generated drafts and proposals).
   */
  z.object({
    type: z.literal('data.changed'),
    area: z.enum(['course', 'concepts', 'relations', 'inbox']),
  }),
]);
export type ServerEvent = z.infer<typeof ServerEventSchema>;

export const EVENTS_PATH = '/api/events';
