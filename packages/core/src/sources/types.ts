import { z } from 'zod';

/**
 * Sources: imported originals (lecture PDFs, slides, documents) parsed into sections with locators
 * (data-model.md §5.2–5.3, ADR-0010, ADR-0019). A locator says exactly where a piece of text came
 * from — the page, slide (and whether body or speaker notes) or heading — so search hits, citations
 * and generated material can always point back to it.
 */

/** All planned kinds; Phase 5 parses the first five (URL, audio, video and images arrive later). */
export const SourceKindSchema = z.enum([
  'pdf',
  'pptx',
  'docx',
  'markdown',
  'text',
  'url',
  'audio',
  'video',
  'image',
]);
export type SourceKind = z.infer<typeof SourceKindSchema>;

/** Ingestion status. A file that has disappeared from the vault is flagged separately (`missingAt`). */
export const SourceStatusSchema = z.enum(['pending', 'processing', 'ready', 'failed']);
export type SourceStatus = z.infer<typeof SourceStatusSchema>;

/** Kinds Phase 5 can import and parse. */
export const IMPORTABLE_SOURCE_KINDS = [
  'pdf',
  'pptx',
  'docx',
  'markdown',
  'text',
] as const satisfies readonly SourceKind[];

const sourceId = z.string().min(1);
const headingPath = z.array(z.string());

export const LocatorSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('pdf'),
    sourceId,
    page: z.number().int().positive(),
    /** Character range within the page's extracted text. */
    charStart: z.number().int().nonnegative().optional(),
    charEnd: z.number().int().nonnegative().optional(),
  }),
  z.object({
    kind: z.literal('slides'),
    sourceId,
    slide: z.number().int().positive(),
    part: z.enum(['body', 'notes']),
  }),
  z.object({
    kind: z.literal('docx'),
    sourceId,
    headingPath,
    paragraph: z.number().int().nonnegative(),
  }),
  /** Markdown and plain-text sources. */
  z.object({ kind: z.literal('text'), sourceId, headingPath, line: z.number().int().positive() }),
  /** A note in the vault (used by later phases). */
  z.object({
    kind: z.literal('markdown'),
    noteId: z.string().min(1),
    headingPath,
    line: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal('media'),
    sourceId,
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
  }),
]);
export type Locator = z.infer<typeof LocatorSchema>;

export type SectionKind = 'page' | 'slide' | 'heading' | 'segment';

export interface NormalisedSection {
  kind: SectionKind;
  /** Short human label: "p. 12", "Slide 3", "Background". */
  label: string;
  /** The section's text (Markdown-style for documents; plain for pages and slides). */
  text: string;
  /** Speaker notes for slides. */
  notes: string | null;
  headingPath: string[];
  locator: Locator;
}

export interface ParseWarning {
  code: string;
  message: string;
}

export interface NormalisedDocument {
  title: string | null;
  /** Pages or slides, when the format has them. */
  pageCount: number | null;
  sections: NormalisedSection[];
  warnings: ParseWarning[];
  metadata: Record<string, string | number | boolean | null>;
}

export interface ParseInput {
  bytes: Uint8Array;
  fileName: string;
  sourceId: string;
  signal: AbortSignal;
  /** Reports progress between 0 and 1. */
  onProgress?: (fraction: number) => void;
}

/** A parser for one or more kinds. `version` changes whenever its output changes (re-ingestion). */
export interface SourceParser {
  readonly kinds: readonly SourceKind[];
  readonly version: string;
  parse(input: ParseInput): Promise<NormalisedDocument>;
}

/** A short label for a locator, e.g. "p. 12", "Slide 3 (notes)", "Background › Paxos". */
export function locatorLabel(locator: Locator): string {
  switch (locator.kind) {
    case 'pdf':
      return `p. ${locator.page}`;
    case 'slides':
      return `Slide ${locator.slide}${locator.part === 'notes' ? ' (notes)' : ''}`;
    case 'docx':
    case 'text':
    case 'markdown':
      return locator.headingPath.length > 0 ? locator.headingPath.join(' › ') : 'Start';
    case 'media': {
      const seconds = Math.floor(locator.startMs / 1000);
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const rest = String(seconds % 60).padStart(2, '0');
      return hours > 0
        ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}`
        : `${minutes}:${rest}`;
    }
  }
}
