import { readFileSync, statSync } from 'node:fs';
import { chunkDocument, DETECT_HEAD_BYTES, detectSourceKind, type SourceParser } from '@skb/core';
import { z } from 'zod';
import { type JobHandler, type JobQueue, PermanentJobError } from '../../jobs/queue';
import type { Clock } from '../../shared/clock';
import type { Vault } from '../../vault/vault';
import { sha256Bytes } from './files';
import { parserFor, SourceParseError } from './parsers/index';
import type { SourcesRepository } from './repository';

/**
 * The ingestion job (task 5.13): read the original → parse into sections → chunk → store sections,
 * chunks and the full-text index in one transaction → `ready`. It is idempotent: a source that is
 * already `ready` for the same content (SHA-256) and parser version is left alone, so enqueueing it
 * again is always safe. Partial results are never visible — a failure leaves the previous content.
 */

export const INGEST_JOB = 'source.ingest';

const PayloadSchema = z.object({ sourceId: z.string().min(1) });

export interface IngestDependencies {
  repo: SourcesRepository;
  vault: Vault;
  clock: Clock;
  /** The parsers to use (those that read recordings, images and scans with AI, in the app). */
  parsers?: readonly SourceParser[];
  /** Announces that sources changed (SSE `sources.changed`). */
  notify(ids: string[]): void;
}

/** Queues ingestion of a source unless a run is already waiting. */
export function enqueueIngest(queue: JobQueue, sourceId: string) {
  return queue.enqueue(INGEST_JOB, { sourceId }, { subject: sourceId, coalesce: true });
}

export function createIngestHandler({
  repo,
  vault,
  clock,
  parsers,
  notify,
}: IngestDependencies): JobHandler<z.infer<typeof PayloadSchema>> {
  return {
    kind: INGEST_JOB,
    payload: PayloadSchema,
    maxAttempts: 3,
    timeoutMs: 10 * 60_000,

    async run({ payload, signal, progress }) {
      const source = repo.byId(payload.sourceId);
      if (!source || source.deletedAt) return;
      const parser = parserFor(source.kind, parsers);
      if (!parser) throw new PermanentJobError(`${source.kind} sources cannot be read yet.`);

      let bytes: Uint8Array;
      let mtimeMs: number;
      try {
        const file = vault.resolve(source.path);
        bytes = readFileSync(file);
        mtimeMs = Math.trunc(statSync(file).mtimeMs);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new PermanentJobError(
            `The original file is no longer at "${source.path}". Put it back, or delete this source.`,
          );
        }
        throw error;
      }
      const sha256 = sha256Bytes(bytes);
      if (
        source.status === 'ready' &&
        source.ingestedSha256 === sha256 &&
        source.parserVersion === parser.version
      ) {
        return;
      }
      const detected = detectSourceKind(
        source.path,
        bytes.subarray(0, DETECT_HEAD_BYTES),
        bytes.length <= DETECT_HEAD_BYTES,
      );
      if (!detected.ok) throw new PermanentJobError(detected.reason);

      repo.update(source.id, {
        status: 'processing',
        error: null,
        sha256,
        sizeBytes: bytes.length,
        mtimeMs,
      });
      notify([source.id]);
      progress(0, 'Reading the file');

      let document: Awaited<ReturnType<typeof parser.parse>>;
      try {
        document = await parser.parse({
          bytes,
          fileName: source.path,
          sourceId: source.id,
          signal,
          onProgress: (fraction) => progress(fraction * 0.9, 'Extracting text'),
        });
      } catch (error) {
        if (error instanceof SourceParseError)
          throw new PermanentJobError(error.message, { cause: error });
        throw error;
      }
      signal.throwIfAborted();
      progress(0.92, 'Indexing');
      const chunks = chunkDocument(document, source.title);

      repo.transaction(() => {
        const current = repo.byId(source.id);
        if (!current || current.deletedAt) return;
        repo.replaceContent(source.id, document.sections, chunks);
        repo.update(source.id, {
          status: 'ready',
          error: null,
          pageCount: document.pageCount,
          metadataJson: JSON.stringify({ ...document.metadata, documentTitle: document.title }),
          warningsJson: JSON.stringify(document.warnings),
          parserVersion: parser.version,
          ingestedSha256: sha256,
          ingestedAt: clock.now().toISOString(),
        });
      });
      notify([source.id]);
    },

    settled(job, outcome, payload) {
      const id = payload?.sourceId ?? job.subject;
      if (!id) return;
      const source = repo.byId(id);
      if (!source || source.deletedAt) return;
      if (outcome === 'failed') {
        repo.update(id, { status: 'failed', error: job.error ?? 'The import failed.' });
      } else if (outcome === 'cancelled') {
        repo.update(id, {
          status: 'failed',
          error: 'The import was cancelled. Retry to import it.',
        });
      } else if (outcome === 'retrying' || outcome === 'interrupted') {
        repo.update(id, { status: 'pending' });
      } else {
        return;
      }
      notify([id]);
    },
  };
}
