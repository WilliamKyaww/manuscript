import type { IdFactory, JobSummary } from '@skb/core';
import type { z } from 'zod';
import type { Clock } from '../shared/clock';
import type { EventBus } from '../shared/events';
import type { Logger } from '../shared/logger';
import { type JobRow, type JobsRepository, toJobSummary } from './repository';

/**
 * Persistent in-process job queue (ADR-0008, task 5.03). Jobs live in SQLite, so queued work
 * survives a restart; a worker loop runs due jobs (one at a time by default), retries failures with
 * exponential back-off, supports cancellation through an `AbortSignal`, and publishes progress as
 * `job.updated` server-sent events. Jobs interrupted by a shutdown or a crash are queued again.
 */

/** A failure that retrying cannot fix (a malformed file); its message is shown to the user. */
export class PermanentJobError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PermanentJobError';
  }
}

export type JobOutcome = 'succeeded' | 'failed' | 'cancelled' | 'retrying' | 'interrupted';

export interface JobContext<P> {
  readonly job: JobSummary;
  readonly payload: P;
  /** Aborted on cancellation, timeout or shutdown: stop promptly by throwing. */
  readonly signal: AbortSignal;
  /** Reports progress (0–1) and the current step; throttled before it reaches the database. */
  progress(fraction: number, message?: string | null): void;
  /** What the job achieved ("12 cards to review"), kept as its message once it has succeeded. */
  result(message: string): void;
}

export interface JobHandler<P> {
  readonly kind: string;
  readonly payload: z.ZodType<P>;
  /** Attempts before giving up on retryable errors (default 3). */
  readonly maxAttempts?: number;
  /** A run taking longer than this is stopped and fails permanently. */
  readonly timeoutMs?: number;
  run(context: JobContext<P>): Promise<void>;
  /** Called once the outcome of a run (or a cancellation while queued) is known. Must not throw. */
  settled?(job: JobSummary, outcome: JobOutcome, payload: P | null): void;
}

export interface EnqueueOptions {
  subject?: string;
  maxAttempts?: number;
  delayMs?: number;
  /**
   * Reuse a job of the same kind and subject that is still waiting, instead of adding another; a
   * shorter delay brings the waiting job forward.
   */
  coalesce?: boolean;
}

export interface JobQueue {
  register<P>(handler: JobHandler<P>): void;
  enqueue(kind: string, payload: unknown, options?: EnqueueOptions): JobSummary;
  /** Cancels a queued job, or asks a running one to stop. Returns the job, or null if unknown. */
  cancel(id: string): JobSummary | null;
  get(id: string): JobSummary | null;
  /** The newest queued or running job per subject. */
  activeFor(subjects: readonly string[]): Map<string, JobSummary>;
  /** Re-queues interrupted jobs, purges old finished ones and starts the worker loop. */
  start(): void;
  /** Runs due jobs one after another until none is due (tests and maintenance). */
  runDue(): Promise<number>;
  /** Resolves when no job is running. */
  whenIdle(): Promise<void>;
  /** Stops the loop; running jobs are interrupted and will run again after the next start. */
  close(): Promise<void>;
}

export interface JobQueueDependencies {
  repo: JobsRepository;
  clock: Clock;
  ids: IdFactory;
  logger: Logger;
  events: EventBus;
  concurrency?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
  /** Minimum time between progress writes for the same message. */
  progressIntervalMs?: number;
  /** Finished jobs are kept this long. */
  retentionDays?: number;
}

type StopReason = 'cancel' | 'shutdown' | 'timeout';

interface RunningJob {
  controller: AbortController;
  stop: StopReason | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function createJobQueue(deps: JobQueueDependencies): JobQueue {
  const { repo, clock, ids, logger, events } = deps;
  const concurrency = Math.max(1, deps.concurrency ?? 1);
  const retryBaseMs = deps.retryBaseMs ?? 5_000;
  const retryMaxMs = deps.retryMaxMs ?? 5 * 60_000;
  const progressIntervalMs = deps.progressIntervalMs ?? 250;
  const retentionDays = deps.retentionDays ?? 14;

  // biome-ignore lint/suspicious/noExplicitAny: handlers of different payload types share one map; each validates its own payload.
  const handlers = new Map<string, JobHandler<any>>();
  const running = new Map<string, RunningJob>();
  const inFlight = new Set<Promise<void>>();
  let started = false;
  let closed = false;
  let timer: NodeJS.Timeout | undefined;

  const now = () => clock.now().toISOString();
  const kinds = () => [...handlers.keys()];
  const publish = (row: JobRow | null) => {
    if (row) events.publish({ type: 'job.updated', job: toJobSummary(row) });
  };
  const backoff = (attempts: number) =>
    Math.min(retryMaxMs, retryBaseMs * 2 ** Math.max(0, attempts - 1));
  const later = (ms: number) => new Date(clock.now().getTime() + ms).toISOString();

  const settle = (
    handler: JobHandler<unknown> | undefined,
    row: JobRow | null,
    outcome: JobOutcome,
    payload: unknown,
  ) => {
    if (!handler?.settled || !row) return;
    try {
      handler.settled(toJobSummary(row), outcome, payload);
    } catch (error) {
      logger.error('A job completion hook failed', { kind: row.kind, id: row.id, error });
    }
  };

  const execute = async (row: JobRow): Promise<void> => {
    const handler = handlers.get(row.kind);
    const entry: RunningJob = { controller: new AbortController(), stop: null };
    running.set(row.id, entry);
    publish(row);

    let lastWrite = 0;
    let lastMessage = row.message;
    const progress = (fraction: number, message: string | null = lastMessage) => {
      if (entry.controller.signal.aborted) return;
      const time = Date.now();
      if (message === lastMessage && time - lastWrite < progressIntervalMs) return;
      lastWrite = time;
      lastMessage = message;
      const clamped = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
      repo.progress(row.id, clamped, message, now());
      publish(repo.byId(row.id));
    };

    const timeout = handler?.timeoutMs
      ? setTimeout(() => {
          entry.stop = 'timeout';
          entry.controller.abort(new Error('The job took too long.'));
        }, handler.timeoutMs)
      : undefined;

    let payload: unknown = null;
    let outcome: JobOutcome;
    let resultMessage: string | null = null;
    try {
      if (!handler) throw new PermanentJobError(`No handler is registered for "${row.kind}" jobs.`);
      const parsed = handler.payload.safeParse(JSON.parse(row.payloadJson));
      if (!parsed.success) throw new PermanentJobError('The job’s stored data is not valid.');
      payload = parsed.data;
      await handler.run({
        job: toJobSummary(row),
        payload,
        signal: entry.controller.signal,
        progress,
        result: (message) => {
          resultMessage = message;
        },
      });
      if (entry.stop) throw new Error('Stopped');
      repo.finish(row.id, 'succeeded', null, now());
      if (resultMessage !== null) repo.progress(row.id, 1, resultMessage, now());
      outcome = 'succeeded';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (entry.stop === 'cancel') {
        repo.finish(row.id, 'cancelled', null, now());
        outcome = 'cancelled';
      } else if (entry.stop === 'shutdown') {
        repo.requeue(row.id, now(), null, now(), true);
        outcome = 'interrupted';
      } else if (entry.stop === 'timeout') {
        const minutes = Math.max(1, Math.round((handler?.timeoutMs ?? 0) / 60_000));
        repo.finish(
          row.id,
          'failed',
          `Stopped because it took longer than ${minutes} minute${minutes === 1 ? '' : 's'}.`,
          now(),
        );
        outcome = 'failed';
      } else if (!(error instanceof PermanentJobError) && row.attempts < row.maxAttempts) {
        logger.warn('A job failed and will be retried', { kind: row.kind, id: row.id, error });
        repo.requeue(row.id, later(backoff(row.attempts)), message, now(), false);
        outcome = 'retrying';
      } else {
        if (!(error instanceof PermanentJobError))
          logger.error('A job failed', { kind: row.kind, id: row.id, error });
        repo.finish(row.id, 'failed', message, now());
        outcome = 'failed';
      }
    } finally {
      if (timeout) clearTimeout(timeout);
      running.delete(row.id);
    }
    const final = repo.byId(row.id);
    publish(final);
    settle(handler, final, outcome, payload);
  };

  const track = (promise: Promise<void>) => {
    inFlight.add(promise);
    void promise.finally(() => inFlight.delete(promise));
  };

  const scheduleNext = () => {
    const next = repo.nextRunAfter(kinds());
    if (!next) return;
    const delay = Math.max(0, Date.parse(next) - clock.now().getTime());
    timer = setTimeout(pump, Math.min(delay, 2 ** 31 - 1));
    timer.unref?.();
  };

  function pump(): void {
    if (!started || closed) return;
    if (timer) clearTimeout(timer);
    timer = undefined;
    while (running.size < concurrency) {
      const row = repo.claimNext(now(), kinds());
      if (!row) break;
      track(
        execute(row)
          .catch((error) => logger.error('The job worker failed', { id: row.id, error }))
          .finally(() => setImmediate(pump)),
      );
    }
    if (running.size < concurrency) scheduleNext();
  }

  return {
    register(handler) {
      if (handlers.has(handler.kind))
        throw new Error(`A handler for "${handler.kind}" is already registered.`);
      handlers.set(handler.kind, handler);
    },

    enqueue(kind, payload, options = {}) {
      if (options.coalesce && options.subject) {
        const waiting = repo.queuedFor(kind, options.subject);
        if (waiting) {
          // Asked to run sooner than it waits (a rebuild after an edit): it runs sooner.
          repo.bringForward(waiting.id, later(options.delayMs ?? 0), now());
          if (started && !closed) setImmediate(pump);
          return toJobSummary(repo.byId(waiting.id) ?? waiting);
        }
      }
      const row = repo.insert({
        id: ids('job'),
        kind,
        subject: options.subject ?? null,
        payloadJson: JSON.stringify(payload ?? {}),
        maxAttempts: options.maxAttempts ?? handlers.get(kind)?.maxAttempts ?? 3,
        runAfter: later(options.delayMs ?? 0),
        now: now(),
      });
      publish(row);
      // After the caller's transaction (if any) has finished.
      if (started && !closed) setImmediate(pump);
      return toJobSummary(row);
    },

    cancel(id) {
      const entry = running.get(id);
      if (entry) {
        entry.stop = 'cancel';
        entry.controller.abort(new Error('Cancelled'));
      } else if (repo.cancelQueued(id, now())) {
        const row = repo.byId(id);
        publish(row);
        settle(row ? handlers.get(row.kind) : undefined, row, 'cancelled', null);
      }
      const row = repo.byId(id);
      return row ? toJobSummary(row) : null;
    },

    get(id) {
      const row = repo.byId(id);
      return row ? toJobSummary(row) : null;
    },

    activeFor(subjects) {
      return new Map(
        [...repo.activeFor(subjects)].map(([subject, row]) => [subject, toJobSummary(row)]),
      );
    },

    start() {
      if (started) return;
      const recovered = repo.recoverInterrupted(now());
      if (recovered > 0) logger.info('Resuming interrupted background jobs', { jobs: recovered });
      const purged = repo.purgeFinished(
        new Date(clock.now().getTime() - retentionDays * DAY_MS).toISOString(),
      );
      if (purged > 0) logger.debug('Removed old finished jobs', { jobs: purged });
      started = true;
      closed = false;
      pump();
    },

    async runDue() {
      let count = 0;
      for (;;) {
        const row = repo.claimNext(now(), kinds());
        if (!row) return count;
        const run = execute(row);
        track(run);
        await run;
        count += 1;
      }
    },

    async whenIdle() {
      while (inFlight.size > 0) await Promise.allSettled([...inFlight]);
    },

    async close() {
      closed = true;
      started = false;
      if (timer) clearTimeout(timer);
      timer = undefined;
      for (const entry of running.values()) {
        entry.stop = 'shutdown';
        entry.controller.abort(new Error('Shutting down'));
      }
      while (inFlight.size > 0) await Promise.allSettled([...inFlight]);
    },
  };
}
