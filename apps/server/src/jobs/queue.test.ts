import type { ServerEvent } from '@skb/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createTestContext, type TestContext } from '../../test/helpers';
import {
  createJobQueue,
  type JobHandler,
  type JobOutcome,
  type JobQueue,
  PermanentJobError,
} from './queue';
import { createJobsRepository } from './repository';

let test: TestContext;
let queue: JobQueue;
let events: ServerEvent[];

const Payload = z.object({ value: z.number() });
type Payload = z.infer<typeof Payload>;

function handler(
  run: JobHandler<Payload>['run'],
  extra: Partial<JobHandler<Payload>> = {},
): JobHandler<Payload> {
  return { kind: 'test.job', payload: Payload, run, ...extra };
}

beforeEach(() => {
  test = createTestContext();
  events = [];
  test.ctx.events.subscribe((event) => events.push(event));
  queue = createJobQueue({
    repo: createJobsRepository(test.ctx.db),
    clock: test.clock,
    ids: test.ctx.ids,
    logger: test.ctx.logger,
    events: test.ctx.events,
    retryBaseMs: 1_000,
    progressIntervalMs: 0,
  });
});

afterEach(async () => {
  await queue.close();
  test.cleanup();
});

const jobEvents = () =>
  events.flatMap((event) => (event.type === 'job.updated' ? [event.job] : []));

describe('job queue', () => {
  it('runs a job, validates its payload and reports progress', async () => {
    const seen: number[] = [];
    queue.register(
      handler(async ({ payload, progress }) => {
        seen.push(payload.value);
        progress(0.5, 'Half way');
      }),
    );
    const job = queue.enqueue('test.job', { value: 7 }, { subject: 'src_1' });
    expect(job).toMatchObject({ status: 'queued', subject: 'src_1', attempts: 0 });
    expect(queue.activeFor(['src_1']).get('src_1')?.id).toBe(job.id);

    expect(await queue.runDue()).toBe(1);
    expect(seen).toEqual([7]);
    expect(queue.get(job.id)).toMatchObject({ status: 'succeeded', progress: 1, attempts: 1 });
    expect(jobEvents().map((event) => [event.status, event.message])).toEqual([
      ['queued', null],
      ['running', null],
      ['running', 'Half way'],
      ['succeeded', null],
    ]);
    expect(queue.activeFor(['src_1']).size).toBe(0);

    const invalid = queue.enqueue('test.job', { value: 'nope' });
    await queue.runDue();
    expect(queue.get(invalid.id)).toMatchObject({ status: 'failed' });
  });

  it('retries failures with exponential back-off, then gives up', async () => {
    const outcomes: JobOutcome[] = [];
    let calls = 0;
    queue.register(
      handler(
        async () => {
          calls += 1;
          throw new Error(`Disk busy (${calls})`);
        },
        { maxAttempts: 3, settled: (_job, outcome) => outcomes.push(outcome) },
      ),
    );
    const job = queue.enqueue('test.job', { value: 1 });
    expect(await queue.runDue()).toBe(1);
    expect(queue.get(job.id)).toMatchObject({
      status: 'queued',
      error: 'Disk busy (1)',
      attempts: 1,
    });
    // Not due yet.
    expect(await queue.runDue()).toBe(0);
    test.clock.advance(1_000);
    expect(await queue.runDue()).toBe(1);
    test.clock.advance(1_999);
    expect(await queue.runDue()).toBe(0);
    test.clock.advance(1);
    expect(await queue.runDue()).toBe(1);
    expect(queue.get(job.id)).toMatchObject({
      status: 'failed',
      error: 'Disk busy (3)',
      attempts: 3,
    });
    expect(outcomes).toEqual(['retrying', 'retrying', 'failed']);
  });

  it('does not retry permanent errors', async () => {
    queue.register(
      handler(async () => {
        throw new PermanentJobError('The PDF is damaged.');
      }),
    );
    const job = queue.enqueue('test.job', { value: 1 });
    await queue.runDue();
    expect(queue.get(job.id)).toMatchObject({ status: 'failed', error: 'The PDF is damaged.' });
  });

  it('cancels queued and running jobs', async () => {
    const outcomes: JobOutcome[] = [];
    let release: () => void = () => {};
    queue.register(
      handler(
        ({ signal }) =>
          new Promise<void>((resolve, reject) => {
            release = resolve;
            signal.addEventListener('abort', () => reject(signal.reason));
          }),
        { settled: (_job, outcome) => outcomes.push(outcome) },
      ),
    );
    const queued = queue.enqueue('test.job', { value: 1 });
    expect(queue.cancel(queued.id)).toMatchObject({ status: 'cancelled' });

    const running = queue.enqueue('test.job', { value: 2 });
    const run = queue.runDue();
    await vi.waitFor(() => expect(queue.get(running.id)?.status).toBe('running'));
    queue.cancel(running.id);
    await run;
    expect(queue.get(running.id)).toMatchObject({ status: 'cancelled' });
    expect(outcomes).toEqual(['cancelled', 'cancelled']);
    release();
    expect(queue.cancel('job_unknown')).toBeNull();
  });

  it('reuses a waiting job for the same subject when asked to coalesce', () => {
    queue.register(handler(async () => {}));
    const first = queue.enqueue('test.job', { value: 1 }, { subject: 'src_1', coalesce: true });
    const second = queue.enqueue('test.job', { value: 1 }, { subject: 'src_1', coalesce: true });
    const other = queue.enqueue('test.job', { value: 1 }, { subject: 'src_2', coalesce: true });
    expect(second.id).toBe(first.id);
    expect(other.id).not.toBe(first.id);
  });

  it('brings a coalesced job forward when asked to run it sooner', async () => {
    const ran: number[] = [];
    queue.register(handler(async ({ payload }) => void ran.push(payload.value)));
    const later = queue.enqueue(
      'test.job',
      { value: 1 },
      { subject: 's', coalesce: true, delayMs: 30_000 },
    );
    expect(await queue.runDue()).toBe(0);
    const now = queue.enqueue('test.job', { value: 1 }, { subject: 's', coalesce: true });
    expect(now.id).toBe(later.id);
    expect(await queue.runDue()).toBe(1);
    expect(ran).toEqual([1]);
    // A request for later never delays a job already due sooner.
    queue.enqueue('test.job', { value: 2 }, { subject: 't', coalesce: true });
    queue.enqueue('test.job', { value: 2 }, { subject: 't', coalesce: true, delayMs: 60_000 });
    expect(await queue.runDue()).toBe(1);
    expect(ran).toEqual([1, 2]);
  });

  it('stops jobs that exceed their time limit', async () => {
    queue.register(
      handler(
        ({ signal }) =>
          new Promise<void>((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason));
          }),
        { timeoutMs: 20 },
      ),
    );
    const job = queue.enqueue('test.job', { value: 1 });
    await queue.runDue();
    expect(queue.get(job.id)).toMatchObject({ status: 'failed' });
    expect(queue.get(job.id)?.error).toMatch(/took longer than 1 minute/);
  });

  it('runs jobs by itself once started, and resumes interrupted ones', async () => {
    const repo = createJobsRepository(test.ctx.db);
    const done: number[] = [];
    queue.register(
      handler(async ({ payload }) => {
        done.push(payload.value);
      }),
    );
    // A job left running by a crashed process, and one of a kind this version cannot run.
    const crashed = queue.enqueue('test.job', { value: 1 });
    repo.claimNext(test.clock.now().toISOString(), ['test.job']);
    const foreign = repo.insert({
      id: test.ctx.ids('job'),
      kind: 'future.kind',
      subject: null,
      payloadJson: '{}',
      maxAttempts: 3,
      runAfter: test.clock.now().toISOString(),
      now: test.clock.now().toISOString(),
    });

    queue.start();
    await vi.waitFor(() => expect(queue.get(crashed.id)?.status).toBe('succeeded'));
    expect(queue.get(crashed.id)?.attempts).toBe(1);
    queue.enqueue('test.job', { value: 2 });
    await vi.waitFor(() => expect(done).toEqual([1, 2]));
    expect(queue.get(foreign.id)?.status).toBe('queued');
  });

  it('interrupts running jobs on close so that they run again later', async () => {
    queue.register(
      handler(
        ({ signal }) =>
          new Promise<void>((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason));
          }),
      ),
    );
    const job = queue.enqueue('test.job', { value: 1 });
    queue.start();
    await vi.waitFor(() => expect(queue.get(job.id)?.status).toBe('running'));
    await queue.close();
    expect(queue.get(job.id)).toMatchObject({ status: 'queued', attempts: 0 });
  });
});
