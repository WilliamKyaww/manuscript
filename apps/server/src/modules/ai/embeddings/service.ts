import { AiError, type EmbeddingStatus } from '@skb/core';
import { embed, embedMany } from 'ai';
import { z } from 'zod';
import { type JobQueue, PermanentJobError } from '../../../jobs/queue';
import type { Clock } from '../../../shared/clock';
import type { EventBus } from '../../../shared/events';
import type { Logger } from '../../../shared/logger';
import { describeProviderError } from '../errors';
import type { AiService } from '../service';
import type { EmbeddingOwner, EmbeddingsRepository, OwnerType } from './repository';
import { buildVectorIndex, type VectorHit, type VectorIndex } from './vector-index';

/**
 * Embeddings (task 10.05): when an embedding model is set, a background job embeds every source
 * chunk and note that has no vector for that model (or whose text changed), in batches, recording
 * what it used. Imports and note edits schedule it again; changing the model starts over. Semantic
 * search (10.06) loads the vectors into an in-memory index, rebuilt after each run.
 */

export const EMBED_JOB = 'ai.embed';
const SUBJECT = 'embeddings';
const BATCH = 64;

export interface EmbeddingDependencies {
  repo: EmbeddingsRepository;
  ai: AiService;
  queue: JobQueue;
  events: EventBus;
  clock: Clock;
  logger: Logger;
}

export type EmbeddingService = ReturnType<typeof createEmbeddingService>;

const modelKey = (provider: string, modelId: string) => `${provider}/${modelId}`;

export function createEmbeddingService(deps: EmbeddingDependencies) {
  const { repo, ai, queue, events, clock, logger } = deps;
  let index: { model: string; version: number; index: VectorIndex } | null = null;
  let version = 0;
  let lastError: string | null = null;

  const current = () => {
    try {
      const resolved = ai.embeddingModel();
      return resolved ? { resolved, key: modelKey(resolved.provider, resolved.modelId) } : null;
    } catch {
      // Over budget: semantic search pauses until next month, lexical search carries on.
      return null;
    }
  };

  function schedule(delayMs = 0): void {
    if (!ai.status().roles.embedding.ready) return;
    queue.enqueue(EMBED_JOB, {}, { subject: SUBJECT, coalesce: true, delayMs });
  }

  queue.register({
    kind: EMBED_JOB,
    payload: z.object({}),
    maxAttempts: 3,
    timeoutMs: 60 * 60_000,
    async run({ signal, progress }) {
      let resolved: ReturnType<AiService['embeddingModel']>;
      try {
        resolved = ai.embeddingModel();
      } catch (error) {
        if (error instanceof AiError) throw new PermanentJobError(error.message);
        throw error;
      }
      if (!resolved) return;
      const key = modelKey(resolved.provider, resolved.modelId);
      repo.prune(key);
      const pending = repo.owners(key).filter((owner) => owner.hash !== owner.storedHash);
      const batchSize = Math.min(
        BATCH,
        Number((await resolved.model.maxEmbeddingsPerCall) ?? BATCH),
      );
      for (let start = 0; start < pending.length; start += batchSize) {
        signal.throwIfAborted();
        const batch: EmbeddingOwner[] = pending.slice(start, start + batchSize);
        let result: Awaited<ReturnType<typeof embedMany>>;
        try {
          result = await embedMany({
            model: resolved.model,
            values: batch.map((owner) => owner.text),
            abortSignal: signal,
            maxRetries: 2,
          });
        } catch (error) {
          lastError = describeProviderError(error);
          throw new PermanentJobError(lastError, { cause: error });
        }
        repo.upsert(
          key,
          batch.map((owner, position) => ({
            type: owner.type,
            id: owner.id,
            hash: owner.hash,
            vector: result.embeddings[position] ?? [],
          })),
          clock.now().toISOString(),
        );
        ai.record(resolved, 'embed', result.usage.tokens);
        version += 1;
        progress(
          (start + batch.length) / pending.length,
          `Embedded ${start + batch.length} of ${pending.length}`,
        );
      }
      lastError = null;
      if (pending.length > 0)
        logger.info('ai.embed.done', { model: key, embedded: pending.length });
    },
  });

  // Imports and edits change what there is to embed.
  const unsubscribe = events.subscribe((event) => {
    if (event.type === 'sources.changed') schedule(5_000);
    else if (event.type === 'vault.changed') schedule(30_000);
  });

  function loadedIndex(key: string): VectorIndex {
    if (index && index.model === key && index.version === version) return index.index;
    index = { model: key, version, index: buildVectorIndex(repo.vectors(key)) };
    return index.index;
  }

  function status(): EmbeddingStatus {
    const model = current();
    if (!model) return { model: null, embedded: 0, total: 0, running: false, error: null };
    return {
      model: model.key,
      embedded: repo.count(model.key),
      total: repo.ownerCount(),
      running: queue.activeFor([SUBJECT]).has(SUBJECT),
      error: lastError,
    };
  }

  return {
    schedule,
    status,

    /** Forgets the current model's vectors and embeds everything again. */
    rebuild(): EmbeddingStatus {
      const model = current();
      if (model) {
        repo.clear(model.key);
        version += 1;
        schedule(0);
      }
      return status();
    },

    /** Whether semantic search can run now (a model is set and some vectors exist). */
    available(): boolean {
      const model = current();
      return model !== null && repo.count(model.key) > 0;
    },

    /** Owners most similar to a text, by cosine of their vectors; [] without embeddings. */
    async similar(
      text: string,
      options: { limit: number; type?: OwnerType; purpose: string; signal?: AbortSignal },
    ): Promise<VectorHit[]> {
      const model = current();
      if (!model || repo.count(model.key) === 0) return [];
      const result = await embed({
        model: model.resolved.model,
        value: text,
        abortSignal: options.signal,
        maxRetries: 1,
      });
      ai.record(model.resolved, options.purpose, result.usage.tokens);
      return loadedIndex(model.key).search(result.embedding, options);
    },

    /** Owners most like a stored one (no request to the provider). */
    neighbours(
      type: OwnerType,
      id: string,
      options: { limit: number; type?: OwnerType },
    ): VectorHit[] {
      const model = current();
      if (!model) return [];
      const loaded = loadedIndex(model.key);
      const vector = loaded.vectorOf(type, id);
      if (!vector) return [];
      return loaded
        .search(vector, { ...options, limit: options.limit + 1 })
        .filter((hit) => !(hit.type === type && hit.id === id))
        .slice(0, options.limit);
    },

    /** Notes closest in meaning to a note (task 10.11), or null when there is no vector for it. */
    relatedNotes(noteId: string, limit: number): VectorHit[] | null {
      const model = current();
      if (!model) return null;
      const loaded = loadedIndex(model.key);
      const vector = loaded.vectorOf('note', noteId);
      if (!vector) return null;
      return loaded
        .search(vector, { limit: limit + 1, type: 'note' })
        .filter((hit) => hit.id !== noteId)
        .slice(0, limit);
    },

    close: unsubscribe,
  };
}
