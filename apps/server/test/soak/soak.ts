/**
 * Soak test (Phase 21, task 21.03): the built server, as its own process, run for hours through the
 * loops a student repeats — importing material (read in the background), searching it, writing and
 * editing notes, adding cards and reviewing them, and now and then deleting a source — while its
 * memory, its database and every answer's time are recorded. A slow leak, a job queue that falls
 * behind or a request that starts failing after hour five shows here and nowhere else.
 *
 *   npm run build && npm run test:soak -- --minutes 480     (the eight hours of the checklist)
 *   npm run test:soak -- --minutes 10 --pace 500            (a short look)
 *
 * It is paced (a pause between rounds, `--pace` ms, default 2000) so that it runs beside other work
 * without heating the machine. Everything lives in a temporary folder — vault, data, and the home and
 * app-data folders too, so nothing can fall back to the real vault (AGENTS.md §5) — and is removed at
 * the end. The report is written to that folder's parent as `skb-soak-<time>.json` and summarised
 * here. Exit code 1 when a request failed, memory kept growing, or a budget was broken.
 */
import { execFileSync, fork } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { makePdf, makePptx } from '../fixtures/sources/builders';

const args = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 2)
  args.set(process.argv[index]?.replace(/^--/u, '') ?? '', process.argv[index + 1] ?? '');
const MINUTES = Number(args.get('minutes') ?? 480);
const PACE = Number(args.get('pace') ?? 2_000);
const PORT = Number(args.get('port') ?? 4_385);
const TOKEN = 'soak-token-0123456789abcdef0123456789abcdef';
const ORIGIN = `http://127.0.0.1:${PORT}`;
/** p95 budgets, in ms, for the requests a student waits on (architecture.md §14 where it sets one). */
const BUDGETS: Record<string, number> = { search: 150, review: 50, 'note:save': 200, queue: 200 };

const root = mkdtempSync(path.join(tmpdir(), 'skb-soak-'));
for (const folder of ['vault', 'data', 'home', 'appdata', 'localappdata'])
  mkdirSync(path.join(root, folder));
const server = fork(path.resolve('apps/server/dist/server.mjs'), ['--port', String(PORT)], {
  env: {
    ...process.env,
    SKB_VAULT: path.join(root, 'vault'),
    SKB_DATA_DIR: path.join(root, 'data'),
    USERPROFILE: path.join(root, 'home'),
    HOME: path.join(root, 'home'),
    APPDATA: path.join(root, 'appdata'),
    LOCALAPPDATA: path.join(root, 'localappdata'),
    SKB_AUTH_TOKEN: TOKEN,
    SKB_LOG_LEVEL: 'warn',
    SKB_NO_BROWSER: '1',
  },
  stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  // The built server runs as it does for a student: under plain Node. fork() would otherwise pass on
  // tsx's loader from this script, which more than sextupled the server's memory. The heap probe
  // reports the live heap after a collection, which tells what the server keeps from what the
  // operating system has not taken back yet.
  execArgv: ['--expose-gc', '-r', path.resolve('apps/server/test/soak/heap-probe.cjs')],
});

/** The live heap after a full collection, in MB. */
function liveHeapMegabytes(): Promise<number> {
  return new Promise((resolve) => {
    const answer = (message: { type?: string; heapUsed?: number }) => {
      if (message?.type !== 'skb:heap') return;
      server.off('message', answer);
      resolve((message.heapUsed ?? 0) / 1_048_576);
    };
    server.on('message', answer);
    server.send({ type: 'skb:heap' });
  });
}

const times = new Map<string, number[]>();
const failures: string[] = [];
const memory: { minute: number; rounds: number; mb: number; heapMb: number; dbMb: number }[] = [];
const started = Date.now();
const minute = () => (Date.now() - started) / 60_000;

async function call(name: string, url: string, init: RequestInit = {}): Promise<unknown> {
  const begun = performance.now();
  const response = await fetch(`${ORIGIN}${url}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(init.headers ?? {}) },
  });
  const took = performance.now() - begun;
  times.set(name, [...(times.get(name) ?? []), took]);
  const text = await response.text();
  if (!response.ok) throw new Error(`${name}: ${response.status} ${text.slice(0, 200)}`);
  return text ? (JSON.parse(text) as unknown) : null;
}
const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/** The server's working set, in MB, from the operating system. */
function serverMegabytes(): number {
  const pid = String(server.pid);
  if (process.platform === 'win32') {
    const line = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
      encoding: 'utf8',
    });
    const kilobytes = Number(line.split('","').at(-1)?.replace(/[^\d]/gu, '') ?? 0);
    return kilobytes / 1024;
  }
  return Number(execFileSync('ps', ['-o', 'rss=', '-p', pid], { encoding: 'utf8' }).trim()) / 1024;
}

function databaseMegabytes(): number {
  let bytes = 0;
  for (const name of ['skb.db', 'skb.db-wal'])
    try {
      bytes += statSync(path.join(root, 'vault', '.skb', name)).size;
    } catch {
      // The WAL may not exist between checkpoints.
    }
  return bytes / 1_048_576;
}

const WORDS =
  'consensus quorum leader election replication term snapshot partition commit lease'.split(' ');

async function round(index: number, setId: string, sources: string[]) {
  const word = WORDS[index % WORDS.length] as string;
  // Material: a deck or a PDF, read in the background, then found by search.
  const file =
    index % 2 === 0
      ? {
          name: `Lecture ${index}.pptx`,
          type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          bytes: makePptx([{ title: `Round ${index}`, body: [`The ${word} of round ${index}`] }]),
        }
      : {
          name: `Reading ${index}.pdf`,
          type: 'application/pdf',
          bytes: makePdf([[`Round ${index}`, `About ${word}`]]),
        };
  const form = new FormData();
  form.append('file', new Blob([file.bytes], { type: file.type }), file.name);
  const imported = (await call('import', '/api/sources', { method: 'POST', body: form })) as {
    source: { id: string };
  };
  sources.push(imported.source.id);
  for (let wait = 0; ; wait += 1) {
    const source = (await call('source', `/api/sources/${imported.source.id}`)) as {
      status: string;
    };
    if (source.status === 'ready') break;
    if (source.status === 'failed') throw new Error(`import ${index}: the source failed`);
    if (wait > 120) throw new Error(`import ${index}: not read within a minute`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  await call('search', `/api/search?q=${word}`);

  // A note written, then edited twice.
  let note = (await call(
    'note:create',
    '/api/notes',
    json({ title: `Soak ${index}`, content: `# Round ${index}\n\nOn [[${word}]].\n` }),
  )) as { id: string; hash: string };
  for (const extra of ['A second line.', 'And a third.'])
    note = (await call('note:save', `/api/notes/${note.id}`, {
      ...json({ content: `# Round ${index}\n\nOn [[${word}]].\n${extra}\n`, baseHash: note.hash }),
      method: 'PUT',
    })) as { id: string; hash: string };

  // A card, then a short review session over whatever is due.
  await call(
    'card',
    '/api/cards',
    json({
      setId,
      kind: 'basic',
      front: `What is a ${word}? (${index})`,
      back: 'See the lecture.',
    }),
  );
  const session = (await call('session', '/api/review-sessions', json({}))) as { id: string };
  const queue = (await call('queue', '/api/review/queue')) as {
    items: { cardId: string; ordinal: number }[];
  };
  for (const item of queue.items.slice(0, 5))
    await call(
      'review',
      '/api/reviews',
      json({
        cardId: item.cardId,
        ordinal: item.ordinal,
        rating: 4,
        durationMs: 3_000,
        sessionId: session.id,
      }),
    );
  await call('session:end', `/api/review-sessions/${session.id}/end`, { method: 'POST' });

  // Now and then the oldest source goes to the trash.
  if (index % 10 === 9) {
    const oldest = sources.shift();
    if (oldest) await call('source:delete', `/api/sources/${oldest}`, { method: 'DELETE' });
  }
}

const p95 = (values: readonly number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length * 0.95)] ?? 0;
const median = (values: readonly number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

async function main(): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.on(
      'message',
      (message: { type?: string }) => message?.type === 'skb:ready' && resolve(),
    );
    server.once('exit', (code) => reject(new Error(`The server exited early (code ${code}).`)));
  });
  const set = (await call('set', '/api/card-sets', json({ title: 'Soak' }))) as { id: string };
  const sources: string[] = [];
  let rounds = 0;
  let lastSample = -1;
  console.log(
    `Soak: ${MINUTES} min, a round every ~${PACE} ms, server pid ${server.pid}, in ${root}`,
  );
  while (minute() < MINUTES) {
    try {
      await round(rounds, set.id, sources);
    } catch (error) {
      failures.push(`${minute().toFixed(1)} min, round ${rounds}: ${String(error)}`);
      if (failures.length > 20) break;
    }
    rounds += 1;
    if (Math.floor(minute()) !== lastSample) {
      lastSample = Math.floor(minute());
      memory.push({
        minute: lastSample,
        rounds,
        mb: serverMegabytes(),
        heapMb: await liveHeapMegabytes(),
        dbMb: databaseMegabytes(),
      });
      if (lastSample % 15 === 0)
        console.log(
          `  ${lastSample} min: ${rounds} rounds, ${memory.at(-1)?.mb.toFixed(0)} MB (live heap ${memory.at(-1)?.heapMb.toFixed(0)} MB), ${failures.length} failures`,
        );
    }
    await new Promise((resolve) => setTimeout(resolve, PACE));
  }

  // The live heap after a collection "kept growing" when the last quarter's median is half again the
  // second quarter's (the first quarter is warm-up). Every round adds a source, a note and a card, so
  // some growth is the content itself: the report gives it per round, to judge against that.
  const quarter = Math.max(1, Math.floor(memory.length / 4));
  const window = (from: number, to?: number) => memory.slice(from, to);
  const early = median(window(quarter, quarter * 2).map((sample) => sample.heapMb));
  const late = median(window(-quarter).map((sample) => sample.heapMb));
  const roundsBetween =
    median(window(-quarter).map((sample) => sample.rounds)) -
    median(window(quarter, quarter * 2).map((sample) => sample.rounds));
  const heapKbPerRound = roundsBetween > 0 ? ((late - early) * 1024) / roundsBetween : 0;
  const growing = memory.length >= 8 && late > early * 1.5;
  const latencies = Object.fromEntries(
    [...times].map(([name, values]) => [
      name,
      {
        count: values.length,
        medianMs: Math.round(median(values)),
        p95Ms: Math.round(p95(values)),
      },
    ]),
  );
  const broken = Object.entries(BUDGETS).filter(
    ([name, budget]) => (latencies[name]?.p95Ms ?? 0) > budget,
  );
  const report = {
    minutes: Number(minute().toFixed(1)),
    rounds,
    failures,
    memory,
    liveHeapEarlyMb: Math.round(early),
    liveHeapLateMb: Math.round(late),
    heapKbPerRound: Math.round(heapKbPerRound),
    growing,
    latencies,
    budgets: BUDGETS,
    broken: broken.map(([name]) => name),
  };
  const out = path.join(
    path.dirname(root),
    `skb-soak-${new Date().toISOString().replace(/[:.]/gu, '-')}.json`,
  );
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `\n${rounds} rounds in ${report.minutes} min; ${failures.length} failures; live heap ${report.liveHeapEarlyMb} → ${report.liveHeapLateMb} MB (${report.heapKbPerRound} KB a round)${growing ? ' (GROWING)' : ''}; working set ${memory.at(-1)?.mb.toFixed(0)} MB; database ${memory.at(-1)?.dbMb.toFixed(1)} MB`,
  );
  for (const [name, value] of Object.entries(latencies))
    console.log(
      `  ${name.padEnd(14)} ${String(value.count).padStart(6)}  median ${value.medianMs} ms  p95 ${value.p95Ms} ms${BUDGETS[name] ? ` (budget ${BUDGETS[name]})` : ''}`,
    );
  for (const failure of failures.slice(0, 5)) console.log(`  failure: ${failure}`);
  console.log(`Report: ${out}`);
  return failures.length > 0 || growing || broken.length > 0 ? 1 : 0;
}

main()
  .then(async (code) => {
    server.send({ type: 'skb:shutdown' });
    await new Promise((resolve) => server.once('exit', resolve));
    rmSync(root, { recursive: true, force: true, maxRetries: 3 });
    process.exit(code);
  })
  .catch((error: unknown) => {
    console.error(error);
    server.kill();
    process.exit(1);
  });
