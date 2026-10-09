import type { SqlDatabase } from '../../../db/sqlite';

/**
 * SQL for embeddings (migration 0010, derived): one vector per source chunk or note and model.
 * Owners are found by joining what exists now, so vectors of removed chunks or notes are dropped
 * rather than searched.
 */

export type OwnerType = 'chunk' | 'note';

export interface EmbeddingOwner {
  type: OwnerType;
  id: string;
  /** What is embedded: the chunk with its context, or the note's title and opening. */
  text: string;
  hash: string;
  /** The hash stored with the current vector, if any. */
  storedHash: string | null;
}

export interface StoredVector {
  type: OwnerType;
  id: string;
  vector: Float32Array;
}

type Raw = Record<string, unknown>;

/** Notes are embedded by their title and opening: enough to say what a note is about. */
export const NOTE_EMBED_CHARS = 6_000;

/** FNV-1a over the text with its length: enough to notice that an owner's text changed. */
export function contentHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${text.length.toString(36)}-${hash.toString(36)}`;
}

const toVector = (blob: unknown): Float32Array => {
  const bytes = blob as Uint8Array;
  // Copy into an aligned buffer: SQLite hands back views that may not be 4-byte aligned.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Float32Array(copy.buffer);
};

export type EmbeddingsRepository = ReturnType<typeof createEmbeddingsRepository>;

export function createEmbeddingsRepository(db: SqlDatabase) {
  return {
    /** Every chunk of a ready source and every note, with the hash stored for `model`. */
    owners(model: string): EmbeddingOwner[] {
      const chunks = db
        .all<Raw>(
          `SELECT c.id, c.context_prefix, c.text, e.content_hash FROM chunks c
           JOIN sources s ON s.id = c.owner_id AND c.owner_type = 'source' AND s.status = 'ready' AND s.deleted_at IS NULL
           LEFT JOIN embeddings e ON e.owner_type = 'chunk' AND e.owner_id = CAST(c.id AS TEXT)
             AND e.model = ?`,
          [model],
        )
        .map((raw) => {
          const text = `${raw.context_prefix}\n${raw.text}`;
          return {
            type: 'chunk' as const,
            id: String(raw.id),
            text,
            hash: contentHash(text),
            storedHash: raw.content_hash === null ? null : String(raw.content_hash),
          };
        });
      const notes = db
        .all<Raw>(
          `SELECT n.id, n.title, substr(f.body, 1, ?) AS body, e.content_hash FROM notes n
           JOIN notes_fts f ON f.rowid = n.doc_id
           LEFT JOIN embeddings e ON e.owner_type = 'note' AND e.owner_id = n.id AND e.model = ?`,
          [NOTE_EMBED_CHARS, model],
        )
        .map((raw) => {
          const text = `${raw.title}\n\n${raw.body ?? ''}`.trim();
          return {
            type: 'note' as const,
            id: String(raw.id),
            text,
            hash: contentHash(text),
            storedHash: raw.content_hash === null ? null : String(raw.content_hash),
          };
        });
      return [...chunks, ...notes];
    },

    /** Drops vectors of other models and of owners that no longer exist. */
    prune(model: string): number {
      const other = db.run('DELETE FROM embeddings WHERE model != ?', [model]).changes;
      const chunks = db.run(
        `DELETE FROM embeddings WHERE owner_type = 'chunk' AND model = ?
           AND CAST(owner_id AS INTEGER) NOT IN (SELECT id FROM chunks)`,
        [model],
      ).changes;
      const notes = db.run(
        `DELETE FROM embeddings WHERE owner_type = 'note' AND model = ?
           AND owner_id NOT IN (SELECT id FROM notes)`,
        [model],
      ).changes;
      return Number(other) + Number(chunks) + Number(notes);
    },

    upsert(
      model: string,
      rows: readonly { type: OwnerType; id: string; hash: string; vector: readonly number[] }[],
      at: string,
    ): void {
      db.transaction(() => {
        for (const row of rows)
          db.run(
            `INSERT INTO embeddings (owner_type, owner_id, model, content_hash, dims, vector, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (owner_type, owner_id, model) DO UPDATE SET content_hash = excluded.content_hash,
               dims = excluded.dims, vector = excluded.vector, created_at = excluded.created_at`,
            [
              row.type,
              row.id,
              model,
              row.hash,
              row.vector.length,
              new Uint8Array(Float32Array.from(row.vector).buffer),
              at,
            ],
          );
      });
    },

    /** Chunks of ready sources plus notes: everything there is to embed. */
    ownerCount: (): number =>
      Number(
        db.get<{ n: number }>(
          `SELECT (SELECT count(*) FROM chunks c JOIN sources s ON s.id = c.owner_id
             AND c.owner_type = 'source' AND s.status = 'ready' AND s.deleted_at IS NULL) + (SELECT count(*) FROM notes) AS n`,
        )?.n ?? 0,
      ),

    clear: (model: string) => db.run('DELETE FROM embeddings WHERE model = ?', [model]),

    count: (model: string): number =>
      Number(
        db.get<{ n: number }>('SELECT count(*) AS n FROM embeddings WHERE model = ?', [model])?.n ??
          0,
      ),

    vectors: (model: string): StoredVector[] =>
      db
        .all<Raw>('SELECT owner_type, owner_id, vector FROM embeddings WHERE model = ?', [model])
        .map((raw) => ({
          type: raw.owner_type as OwnerType,
          id: String(raw.owner_id),
          vector: toVector(raw.vector),
        })),
  };
}
