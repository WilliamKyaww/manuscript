/**
 * Grounding evaluation (Phase 21, task 21.05): the evaluation set's material is imported into a
 * server of its own, each question is asked from the sources, and the answer is scored — did the
 * passage holding the answer reach the model (and how high), was it cited, how many citations point
 * to it, does the answer contain the words it should, and is a question the material does not answer
 * declined rather than answered from general knowledge?
 *
 *   npm run build && npm run eval:ai                       (the built-in test model: retrieval only)
 *   SKB_EVAL_PROVIDER=anthropic SKB_EVAL_MODEL=<model> SKB_EVAL_API_KEY=<key> npm run eval:ai
 *   SKB_EVAL_PROVIDER=openai-compatible SKB_EVAL_BASE_URL=http://localhost:11434/v1 SKB_EVAL_MODEL=<model> npm run eval:ai
 *
 * The key is read from the environment and sent only to the server on loopback, whose temporary data
 * folder is deleted at the end; it is never written to the report. Everything lives in a temporary
 * folder (vault, data, home and app-data folders), never the real vault. The report is written next
 * to it as `skb-eval-<time>.json`.
 */
import { fork } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { makePdf, makePptx } from '../fixtures/sources/builders';
import { DOCUMENTS, type EvalQuestion, QUESTIONS } from './grounding-set';

const PORT = 4_383;
const TOKEN = 'eval-token-0123456789abcdef0123456789abcdef';
const ORIGIN = `http://127.0.0.1:${PORT}`;
const provider = process.env.SKB_EVAL_PROVIDER;
const model = process.env.SKB_EVAL_MODEL;

const root = mkdtempSync(path.join(tmpdir(), 'skb-eval-'));
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
    ...(provider ? {} : { SKB_AI_PROVIDER: 'mock' }),
  },
  stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  execArgv: [],
});

async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${ORIGIN}${url}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(init.headers ?? {}) },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${url}: ${response.status} ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}
const send = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

interface Passage {
  key: string;
  locator: { kind: string; sourceId?: string; page?: number; slide?: number };
}
interface Answer {
  passages: Passage[];
  text: string;
  cited: string[];
  grounding: string;
  error?: string;
}

async function ask(question: string): Promise<Answer> {
  const response = await fetch(`${ORIGIN}/api/ai/ask`, {
    ...send('POST', { question, scope: 'sources' }),
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  });
  const answer: Answer = { passages: [], text: '', cited: [], grounding: 'none' };
  for (const line of (await response.text()).split('\n')) {
    if (!line.trim()) continue;
    const event = JSON.parse(line) as Record<string, unknown>;
    if (event.type === 'passages') answer.passages = event.passages as Passage[];
    if (event.type === 'done') {
      answer.text = String(event.text);
      answer.cited = event.cited as string[];
      answer.grounding = String(event.grounding);
    }
    if (event.type === 'error') answer.error = String(event.message);
  }
  return answer;
}

async function main() {
  await new Promise<void>((resolve, reject) => {
    server.on(
      'message',
      (message: { type?: string }) => message?.type === 'skb:ready' && resolve(),
    );
    server.once('exit', (code) => reject(new Error(`The server exited early (code ${code}).`)));
  });
  if (provider) {
    const created = await api<{ id: string }>(
      '/api/ai/providers',
      send('POST', {
        kind: provider,
        name: 'Evaluation',
        ...(process.env.SKB_EVAL_API_KEY ? { apiKey: process.env.SKB_EVAL_API_KEY } : {}),
        ...(process.env.SKB_EVAL_BASE_URL ? { baseUrl: process.env.SKB_EVAL_BASE_URL } : {}),
      }),
    );
    await api(
      '/api/ai/preferences',
      send('PATCH', { roles: { chat: { providerId: created.id, model } }, monthlyBudget: null }),
    );
  }

  // The material: a module per course, every file imported and read.
  const files = new Map<string, string>();
  for (const document of DOCUMENTS) {
    const pdf = document.file.endsWith('.pdf');
    const bytes = pdf
      ? makePdf(document.parts.map((part) => [part.title, ...part.lines]))
      : makePptx(document.parts.map((part) => ({ title: part.title, body: part.lines })));
    const form = new FormData();
    form.append(
      'file',
      new Blob([bytes], {
        type: pdf
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      }),
      document.file,
    );
    const imported = await api<{ source: { id: string } }>('/api/sources', {
      method: 'POST',
      body: form,
    });
    files.set(imported.source.id, document.file);
  }
  for (const id of files.keys())
    for (let wait = 0; ; wait += 1) {
      const source = await api<{ status: string }>(`/api/sources/${id}`);
      if (source.status === 'ready') break;
      if (wait > 120 || source.status === 'failed')
        throw new Error(`${files.get(id)} was not read`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

  const matches = (passage: Passage, target: NonNullable<EvalQuestion['source']>) =>
    files.get(passage.locator.sourceId ?? '') === target.file &&
    (passage.locator.slide ?? passage.locator.page) === target.part;
  const answerable: {
    question: string;
    rank: number | null;
    citedRight: boolean;
    citationPrecision: number | null;
    keywords: boolean;
    grounding: string;
    error: string | null;
  }[] = [];
  const unanswerable: {
    question: string;
    declined: boolean;
    grounding: string;
    error: string | null;
  }[] = [];
  for (const item of QUESTIONS) {
    const answer = await ask(item.question);
    if (!item.source) {
      unanswerable.push({
        question: item.question,
        declined: answer.grounding === 'not_found' || answer.cited.length === 0,
        grounding: answer.grounding,
        error: answer.error ?? null,
      });
      continue;
    }
    const target = item.source;
    const rank = answer.passages.findIndex((passage) => matches(passage, target));
    const cited = answer.cited.map((key) => answer.passages.find((passage) => passage.key === key));
    const right = cited.filter((passage) => passage && matches(passage, target)).length;
    const text = answer.text.toLowerCase();
    answerable.push({
      question: item.question,
      rank: rank === -1 ? null : rank + 1,
      citedRight: right > 0,
      citationPrecision: cited.length === 0 ? null : right / cited.length,
      keywords: (item.keywords ?? []).every((word) => text.includes(word.toLowerCase())),
      grounding: answer.grounding,
      error: answer.error ?? null,
    });
  }

  const share = (count: number, of: number) =>
    of === 0 ? null : Math.round((count / of) * 1000) / 10;
  const count = <T>(rows: readonly T[], test: (row: T) => boolean) => rows.filter(test).length;
  const precisions = answerable
    .map((row) => row.citationPrecision)
    .filter((value): value is number => value !== null);
  const summary = {
    model: provider ? `${provider}/${model}` : 'built-in test model (retrieval only)',
    questions: answerable.length + unanswerable.length,
    retrievedPercent: share(
      count(answerable, (row) => row.rank !== null),
      answerable.length,
    ),
    retrievedTop3Percent: share(
      count(answerable, (row) => row.rank !== null && row.rank <= 3),
      answerable.length,
    ),
    citedRightPercent: share(
      count(answerable, (row) => row.citedRight),
      answerable.length,
    ),
    citationPrecisionPercent: share(
      precisions.reduce((sum, value) => sum + value, 0),
      precisions.length,
    ),
    keywordsPercent: share(
      count(answerable, (row) => row.keywords),
      answerable.length,
    ),
    declinedPercent: share(
      count(unanswerable, (row) => row.declined),
      unanswerable.length,
    ),
    errors:
      count(answerable, (row) => row.error !== null) +
      count(unanswerable, (row) => row.error !== null),
  };
  const out = path.join(
    path.dirname(root),
    `skb-eval-${new Date().toISOString().replace(/[:.]/gu, '-')}.json`,
  );
  writeFileSync(out, `${JSON.stringify({ summary, answerable, unanswerable }, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  for (const row of answerable)
    if (row.rank === null || !row.citedRight)
      console.log(`  missed: ${row.question} (passage ${row.rank ?? 'not retrieved'})`);
  console.log(`Report: ${out}`);
  if (!provider)
    console.log('The test model cites what it is given: answers and declining need a real model.');
}

main()
  .then(async () => {
    server.send({ type: 'skb:shutdown' });
    await new Promise((resolve) => server.once('exit', resolve));
    rmSync(root, { recursive: true, force: true, maxRetries: 3 });
  })
  .catch((error: unknown) => {
    console.error(error);
    server.kill();
    process.exit(1);
  });
