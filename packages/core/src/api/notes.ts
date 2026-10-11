import { z } from 'zod';
import { idSchema } from '../ids';
import { defineEndpoint } from './contract';

/** Notes API (knowledge-system.md §1–3). Notes are addressed by id; vault entries by path (vault.ts). */

/** Largest note the editor and API accept (characters). Bigger files are indexed but read-only. */
export const MAX_NOTE_LENGTH = 5_000_000;

export const NoteIdSchema = idSchema('note');

/** A vault-relative, `/`-separated path. The server applies the full containment rules. */
export const VaultPathSchema = z.string().trim().min(1).max(1024);

export const NoteRefSchema = z.object({
  id: NoteIdSchema,
  path: z.string(),
  title: z.string(),
});
export type NoteRef = z.infer<typeof NoteRefSchema>;

export const NoteSummarySchema = NoteRefSchema.extend({
  type: z.string().nullable(),
  aliases: z.array(z.string()),
  updatedAt: z.string(),
});
export type NoteSummary = z.infer<typeof NoteSummarySchema>;

export const AttachmentSummarySchema = z.object({
  path: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  mediaType: z.string(),
  updatedAt: z.string(),
});
export type AttachmentSummary = z.infer<typeof AttachmentSummarySchema>;

export const IndexStatusSchema = z.object({
  state: z.enum(['starting', 'scanning', 'ready']),
  notes: z.number().int().nonnegative(),
  attachments: z.number().int().nonnegative(),
  /** Files processed / to process during a scan (both 0 when idle). */
  processed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  lastScanAt: z.string().nullable(),
  lastScanMs: z.number().nonnegative().nullable(),
});
export type IndexStatus = z.infer<typeof IndexStatusSchema>;

/** A note in the tree, with what the file list sorts by. */
export const TreeNoteSchema = NoteSummarySchema.extend({ createdAt: z.string() });
export type TreeNote = z.infer<typeof TreeNoteSchema>;

export const NoteTreeSchema = z.object({
  notes: z.array(TreeNoteSchema),
  /** Every folder, including empty ones, sorted. */
  folders: z.array(z.string()),
  attachments: z.array(AttachmentSummarySchema),
  index: IndexStatusSchema,
});
export type NoteTree = z.infer<typeof NoteTreeSchema>;

export const LinkResolutionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('note'),
    noteId: NoteIdSchema,
    path: z.string(),
    ambiguous: z.boolean(),
  }),
  z.object({ kind: z.literal('attachment'), path: z.string(), ambiguous: z.boolean() }),
  /** Phase 6: no note has the name, but a concept has it as its name or an alias. */
  z.object({ kind: z.literal('concept'), conceptId: idSchema('concept'), name: z.string() }),
  z.object({ kind: z.literal('unresolved') }),
]);
export type LinkResolutionDto = z.infer<typeof LinkResolutionSchema>;

export const NoteLinkSchema = z.object({
  syntax: z.enum(['wikilink', 'markdown']),
  embed: z.boolean(),
  target: z.string(),
  heading: z.string().nullable(),
  blockRef: z.string().nullable(),
  alias: z.string().nullable(),
  line: z.number().int().positive(),
  column: z.number().int().nonnegative(),
  resolution: LinkResolutionSchema,
});
export type NoteLink = z.infer<typeof NoteLinkSchema>;

export const NoteHeadingSchema = z.object({
  level: z.number().int().min(1).max(6),
  text: z.string(),
  slug: z.string(),
  line: z.number().int().positive(),
});
export type NoteHeading = z.infer<typeof NoteHeadingSchema>;

export const NoteWarningSchema = z.object({ code: z.string(), message: z.string() });
export type NoteWarning = z.infer<typeof NoteWarningSchema>;

export const NoteDetailSchema = NoteSummarySchema.extend({
  content: z.string(),
  /** SHA-256 of the file bytes; send it back as `baseHash` when saving. */
  hash: z.string(),
  frontmatter: z.record(z.string(), z.unknown()),
  module: z.string().nullable(),
  lecture: z.string().nullable(),
  tags: z.array(z.string()),
  createdAt: z.string(),
  wordCount: z.number().int().nonnegative(),
  sizeBytes: z.number().int().nonnegative(),
  /** Whether the id is stored in the file's frontmatter (and so survives an index rebuild). */
  idPersisted: z.boolean(),
  headings: z.array(NoteHeadingSchema),
  links: z.array(NoteLinkSchema),
  warnings: z.array(NoteWarningSchema),
});
export type NoteDetail = z.infer<typeof NoteDetailSchema>;

const NoteParams = z.object({ id: NoteIdSchema });

export const listNotesEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/notes',
  response: NoteTreeSchema,
});

export const getNoteEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/notes/:id',
  params: NoteParams,
  response: NoteDetailSchema,
});

export const CreateNoteBodySchema = z.object({
  /** Folder to create the note in ('' or omitted for the vault root). */
  folder: z.string().max(1024).optional(),
  title: z.string().trim().max(200).optional(),
  content: z.string().max(MAX_NOTE_LENGTH).optional(),
  /** A note in the templates folder to instantiate. */
  templateId: NoteIdSchema.optional(),
  module: z.string().trim().max(100).optional(),
  lecture: z.string().trim().max(100).optional(),
});
export type CreateNoteBody = z.infer<typeof CreateNoteBodySchema>;
/** What a client sends (ids as plain strings, validated by the server). */
export type CreateNoteInput = z.input<typeof CreateNoteBodySchema>;

export const createNoteEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/notes',
  status: 201,
  body: CreateNoteBodySchema,
  response: NoteDetailSchema,
});

export const UpdateNoteBodySchema = z.object({
  content: z.string().max(MAX_NOTE_LENGTH),
  /** The `hash` the edit was based on; a different file on disk is a conflict (409). */
  baseHash: z.string().min(1),
});

export const updateNoteEndpoint = defineEndpoint({
  method: 'PUT',
  path: '/api/notes/:id',
  params: NoteParams,
  body: UpdateNoteBodySchema,
  response: NoteDetailSchema,
});

export const BacklinkMentionSchema = z.object({
  line: z.number().int().positive(),
  column: z.number().int().nonnegative(),
  embed: z.boolean(),
  /** The source line containing the link, trimmed for display. */
  context: z.string(),
});

export const BacklinkSchema = z.object({
  source: NoteRefSchema,
  mentions: z.array(BacklinkMentionSchema),
});
export type Backlink = z.infer<typeof BacklinkSchema>;

export const backlinksEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/notes/:id/backlinks',
  params: NoteParams,
  response: z.object({ linked: z.array(BacklinkSchema) }),
});

export const UnlinkedMentionSchema = z.object({
  source: NoteRefSchema,
  /** Hash of the source file the offsets refer to. */
  sourceHash: z.string(),
  matches: z.array(
    z.object({
      offset: z.number().int().nonnegative(),
      length: z.number().int().positive(),
      line: z.number().int().positive(),
      text: z.string(),
      context: z.string(),
    }),
  ),
});
export type UnlinkedMention = z.infer<typeof UnlinkedMentionSchema>;

export const unlinkedMentionsEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/notes/:id/unlinked-mentions',
  params: NoteParams,
  response: z.object({ mentions: z.array(UnlinkedMentionSchema), truncated: z.boolean() }),
});

export const linkMentionEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/notes/:id/link-mention',
  params: NoteParams,
  body: z.object({
    /** The note containing the plain-text mention. */
    sourceId: NoteIdSchema,
    sourceHash: z.string().min(1),
    offset: z.number().int().nonnegative(),
    text: z.string().min(1).max(500),
  }),
  response: z.object({ source: NoteSummarySchema, link: z.string() }),
});

export const TagCountSchema = z.object({ tag: z.string(), count: z.number().int().positive() });

export const listTagsEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/tags',
  response: z.object({ tags: z.array(TagCountSchema) }),
});

export const TemplateSchema = NoteRefSchema;

export const listTemplatesEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/templates',
  response: z.object({ folder: z.string(), templates: z.array(TemplateSchema) }),
});

// --- Merging and versions (Phase 23, ADR-0042) ---------------------------------------------------

export const mergeNoteEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/notes/:id/merge',
  params: NoteParams,
  body: z.object({
    /** The note that receives this note's text. */
    targetId: NoteIdSchema,
  }),
  response: z.object({
    target: NoteSummarySchema,
    /** Links elsewhere that pointed at the merged note and now point at the target. */
    retargeted: z.object({
      notes: z.number().int().nonnegative(),
      links: z.number().int().nonnegative(),
    }),
    failed: z.array(z.object({ path: z.string(), reason: z.string() })),
    /** The trash item holding the merged note, for undo. */
    trashId: z.string(),
  }),
});

export const VersionIdSchema = z
  .string()
  .regex(/^\d{8}T\d{9}Z-(save|merge|restore)$/, 'Not a version id.');

export const NoteVersionSchema = z.object({
  id: VersionIdSchema,
  savedAt: z.string(),
  /** Why it was kept: before a save, before a merge into this note, or before a restore. */
  reason: z.enum(['save', 'merge', 'restore']),
  sizeBytes: z.number().int().nonnegative(),
});
export type NoteVersion = z.infer<typeof NoteVersionSchema>;

export const listVersionsEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/notes/:id/versions',
  params: NoteParams,
  response: z.object({ versions: z.array(NoteVersionSchema), retentionDays: z.number().int() }),
});

export const getVersionEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/notes/:id/versions/:versionId',
  params: z.object({ id: NoteIdSchema, versionId: VersionIdSchema }),
  response: NoteVersionSchema.extend({ content: z.string() }),
});

/** Keeps the note's current text as a version now (before restoring an older one). */
export const keepVersionEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/notes/:id/versions',
  status: 201,
  params: NoteParams,
  response: z.object({ version: NoteVersionSchema.nullable() }),
});
