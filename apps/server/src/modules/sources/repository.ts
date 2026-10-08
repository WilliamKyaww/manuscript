import {
  type ChunkDraft,
  LocatorSchema,
  type NormalisedSection,
  type SourceKind,
  type SourceSection,
  type SourceStatus,
} from '@skb/core';
import { z } from 'zod';
import type { SqlDatabase } from '../../db/sqlite';

/** SQL for `sources`, `source_sections` and `chunks` (migration 0005). */

export interface SourceRow {
  id: string;
  kind: SourceKind;
  title: string;
  path: string;
  originalName: string;
  mediaType: string;
  sha256: string;
  sizeBytes: number;
  mtimeMs: number;
  pageCount: number | null;
  status: SourceStatus;
  error: string | null;
  moduleCode: string | null;
  metadataJson: string;
  warningsJson: string;
  parserVersion: string | null;
  ingestedSha256: string | null;
  createdAt: string;
  ingestedAt: string | null;
  missingAt: string | null;
  deletedAt: string | null;
}

export interface SourceListRow extends SourceRow {
  sectionCount: number;
  chunkCount: number;
}

/** Columns a service may change, with their SQL names. */
const UPDATABLE = {
  kind: 'kind',
  title: 'title',
  path: 'path',
  mediaType: 'media_type',
  sha256: 'sha256',
  sizeBytes: 'size_bytes',
  mtimeMs: 'mtime_ms',
  pageCount: 'page_count',
  status: 'status',
  error: 'error',
  moduleCode: 'module_code',
  metadataJson: 'metadata_json',
  warningsJson: 'warnings_json',
  parserVersion: 'parser_version',
  ingestedSha256: 'ingested_sha256',
  ingestedAt: 'ingested_at',
  missingAt: 'missing_at',
  deletedAt: 'deleted_at',
} as const satisfies Partial<Record<keyof SourceRow, string>>;

export type SourcePatch = Partial<Pick<SourceRow, keyof typeof UPDATABLE>>;

const COLUMNS = `s.id, s.kind, s.title, s.path, s.original_name, s.media_type, s.sha256, s.size_bytes,
  s.mtime_ms, s.page_count, s.status, s.error, s.module_code, s.metadata_json, s.warnings_json,
  s.parser_version, s.ingested_sha256, s.created_at, s.ingested_at, s.missing_at, s.deleted_at`;

type Raw = Record<string, unknown>;
const HeadingPathSchema = z.array(z.string());
const text = (value: unknown) => (value === null || value === undefined ? null : String(value));

function toRow(raw: Raw): SourceRow {
  return {
    id: String(raw.id),
    kind: raw.kind as SourceKind,
    title: String(raw.title),
    path: String(raw.path),
    originalName: String(raw.original_name),
    mediaType: String(raw.media_type),
    sha256: String(raw.sha256),
    sizeBytes: Number(raw.size_bytes),
    mtimeMs: Number(raw.mtime_ms),
    pageCount: raw.page_count === null ? null : Number(raw.page_count),
    status: raw.status as SourceStatus,
    error: text(raw.error),
    moduleCode: text(raw.module_code),
    metadataJson: String(raw.metadata_json),
    warningsJson: String(raw.warnings_json),
    parserVersion: text(raw.parser_version),
    ingestedSha256: text(raw.ingested_sha256),
    createdAt: String(raw.created_at),
    ingestedAt: text(raw.ingested_at),
    missingAt: text(raw.missing_at),
    deletedAt: text(raw.deleted_at),
  };
}

export type SourcesRepository = ReturnType<typeof createSourcesRepository>;

export function createSourcesRepository(db: SqlDatabase) {
  const one = (sql: string, params: (string | number)[]) => {
    const raw = db.get<Raw>(sql, params);
    return raw ? toRow(raw) : null;
  };

  return {
    transaction<T>(fn: () => T): T {
      return db.transaction(fn);
    },

    insert(row: Omit<SourceRow, 'missingAt' | 'deletedAt'>): void {
      db.run(
        `INSERT INTO sources (id, kind, title, path, original_name, media_type, sha256, size_bytes,
           mtime_ms, page_count, status, error, module_code, metadata_json, warnings_json,
           parser_version, ingested_sha256, created_at, ingested_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.kind,
          row.title,
          row.path,
          row.originalName,
          row.mediaType,
          row.sha256,
          row.sizeBytes,
          row.mtimeMs,
          row.pageCount,
          row.status,
          row.error,
          row.moduleCode,
          row.metadataJson,
          row.warningsJson,
          row.parserVersion,
          row.ingestedSha256,
          row.createdAt,
          row.ingestedAt,
        ],
      );
    },

    update(id: string, patch: SourcePatch): void {
      const entries = Object.entries(patch).filter(([key]) => key in UPDATABLE) as [
        keyof typeof UPDATABLE,
        string | number | null,
      ][];
      if (entries.length === 0) return;
      db.run(
        `UPDATE sources SET ${entries.map(([key]) => `${UPDATABLE[key]} = ?`).join(', ')} WHERE id = ?`,
        [...entries.map(([, value]) => value), id],
      );
    },

    byId(id: string): SourceRow | null {
      return one(`SELECT ${COLUMNS} FROM sources s WHERE s.id = ?`, [id]);
    },

    /** The live (not deleted) source at a path. */
    byPath(path: string): SourceRow | null {
      return one(`SELECT ${COLUMNS} FROM sources s WHERE s.path = ? AND s.deleted_at IS NULL`, [
        path,
      ]);
    },

    /** Sources with this content, live ones first, then the most recently deleted. */
    bySha(sha256: string): SourceRow[] {
      return db
        .all<Raw>(
          `SELECT ${COLUMNS} FROM sources s WHERE s.sha256 = ?
           ORDER BY s.deleted_at IS NOT NULL, s.deleted_at DESC, s.created_at`,
          [sha256],
        )
        .map(toRow);
    },

    /** Live sources with their section and chunk counts, newest first. */
    list(): SourceListRow[] {
      return db
        .all<Raw>(
          `SELECT ${COLUMNS},
             (SELECT count(*) FROM source_sections WHERE source_id = s.id) AS section_count,
             (SELECT count(*) FROM chunks WHERE owner_type = 'source' AND owner_id = s.id) AS chunk_count
           FROM sources s WHERE s.deleted_at IS NULL
           ORDER BY s.created_at DESC, s.id DESC`,
        )
        .map((raw) => ({
          ...toRow(raw),
          sectionCount: Number(raw.section_count),
          chunkCount: Number(raw.chunk_count),
        }));
    },

    counts(id: string): { sectionCount: number; chunkCount: number } {
      const raw = db.get<Raw>(
        `SELECT (SELECT count(*) FROM source_sections WHERE source_id = ?) AS section_count,
           (SELECT count(*) FROM chunks WHERE owner_type = 'source' AND owner_id = ?) AS chunk_count`,
        [id, id],
      );
      return {
        sectionCount: Number(raw?.section_count ?? 0),
        chunkCount: Number(raw?.chunk_count ?? 0),
      };
    },

    /** Replaces the derived sections and chunks of a source (call inside a transaction). */
    replaceContent(
      id: string,
      sections: readonly NormalisedSection[],
      chunks: readonly ChunkDraft[],
    ): void {
      db.run(`DELETE FROM chunks WHERE owner_type = 'source' AND owner_id = ?`, [id]);
      db.run(`DELETE FROM source_sections WHERE source_id = ?`, [id]);
      const sectionIds: number[] = [];
      sections.forEach((section, ordinal) => {
        sectionIds.push(
          db.run(
            `INSERT INTO source_sections (source_id, ordinal, kind, label, heading_path_json, locator_json, text, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              ordinal,
              section.kind,
              section.label,
              JSON.stringify(section.headingPath),
              JSON.stringify(section.locator),
              section.text,
              section.notes,
            ],
          ).lastInsertRowid,
        );
      });
      for (const chunk of chunks) {
        db.run(
          `INSERT INTO chunks (owner_type, owner_id, section_id, ordinal, text, context_prefix, token_estimate, locator_json)
           VALUES ('source', ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            sectionIds[chunk.sectionIndex] ?? null,
            chunk.ordinal,
            chunk.text,
            chunk.contextPrefix,
            chunk.tokenEstimate,
            JSON.stringify(chunk.locator),
          ],
        );
      }
    },

    clearContent(id: string): void {
      db.run(`DELETE FROM chunks WHERE owner_type = 'source' AND owner_id = ?`, [id]);
      db.run(`DELETE FROM source_sections WHERE source_id = ?`, [id]);
    },

    sections(id: string): SourceSection[] {
      return db
        .all<Raw>(
          `SELECT ordinal, kind, label, heading_path_json, locator_json, text, notes
           FROM source_sections WHERE source_id = ? ORDER BY ordinal`,
          [id],
        )
        .map((raw) => ({
          ordinal: Number(raw.ordinal),
          kind: raw.kind as SourceSection['kind'],
          label: String(raw.label),
          headingPath: HeadingPathSchema.parse(JSON.parse(String(raw.heading_path_json))),
          locator: LocatorSchema.parse(JSON.parse(String(raw.locator_json))),
          text: String(raw.text),
          notes: text(raw.notes),
        }));
    },

    /** Live sources (for reconciliation with the files on disk). */
    live(): SourceRow[] {
      return db.all<Raw>(`SELECT ${COLUMNS} FROM sources s WHERE s.deleted_at IS NULL`).map(toRow);
    },
  };
}
