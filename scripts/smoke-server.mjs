// Smoke test for the built server bundle: starts apps/server/dist/server.mjs as a child process with
// an IPC channel and a temporary vault, checks the ready message, the public ping, the authenticated
// health endpoint and the SPA, then asks for a graceful shutdown and verifies it released the vault.
import { fork } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const bundle = path.join(root, 'apps', 'server', 'dist', 'server.mjs');
if (!existsSync(bundle)) {
  console.error('Smoke test: build the server first (npm run build).');
  process.exit(1);
}

const temp = mkdtempSync(path.join(tmpdir(), 'skb-smoke-'));
const vault = path.join(temp, 'vault');
const token = randomBytes(32).toString('base64url');
const child = fork(
  bundle,
  ['--port', '0', '--vault', vault, '--data-dir', path.join(temp, 'data')],
  {
    env: { ...process.env, SKB_AUTH_TOKEN: token, SKB_LOG_LEVEL: 'warn' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  },
);
let output = '';
child.stdout.on('data', (chunk) => {
  output += chunk;
});
child.stderr.on('data', (chunk) => {
  output += chunk;
});

const cleanup = () => rmSync(temp, { recursive: true, force: true });
const fail = (message) => {
  console.error(`Smoke test FAILED: ${message}\n--- server output ---\n${output}`);
  child.kill();
  cleanup();
  process.exit(1);
};

const timeout = (ms, what) =>
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`timed out waiting for ${what}`)), ms),
  );

let origin;
try {
  const ready = await Promise.race([
    new Promise((resolve) =>
      child.on('message', (message) => message?.type === 'skb:ready' && resolve(message)),
    ),
    new Promise((_, reject) =>
      child.once('exit', (code) => reject(new Error(`server exited early (code ${code})`))),
    ),
    timeout(15_000, 'the ready message'),
  ]);
  origin = ready.origin;
} catch (error) {
  fail(error.message);
}

const ping = await fetch(`${origin}/api/ping`);
if (!ping.ok) fail(`/api/ping answered ${ping.status}`);

const unauthorised = await fetch(`${origin}/api/health`);
if (unauthorised.status !== 401) fail(`expected 401 without a token, got ${unauthorised.status}`);

const health = await fetch(`${origin}/api/health`, {
  headers: { authorization: `Bearer ${token}` },
});
const body = await health.json();
if (!health.ok || body.status !== 'ok' || body.database?.ok !== true) {
  fail(`unexpected health response ${JSON.stringify(body)}`);
}

// A PDF import exercises the bundled pdf.js and its in-process worker (ADR-0019) and the job queue.
const auth = { authorization: `Bearer ${token}` };
const form = new FormData();
form.append('file', new Blob([tinyPdf('Smoke test quorum page')]), 'smoke.pdf');
const imported = await fetch(`${origin}/api/sources`, {
  method: 'POST',
  headers: auth,
  body: form,
});
const importBody = await imported.json();
if (imported.status !== 201)
  fail(`PDF import answered ${imported.status}: ${JSON.stringify(importBody)}`);
let source;
for (let attempt = 0; attempt < 100; attempt += 1) {
  source = await (
    await fetch(`${origin}/api/sources/${importBody.source.id}`, { headers: auth })
  ).json();
  if (source.status === 'ready' || source.status === 'failed') break;
  await new Promise((resolve) => setTimeout(resolve, 200));
}
if (source?.status !== 'ready')
  fail(`the imported PDF did not become ready: ${JSON.stringify(source)}`);
const found = await (await fetch(`${origin}/api/search?q=quorum`, { headers: auth })).json();
if (!found.results?.some((result) => result.kind === 'source' && result.locator?.page === 1))
  fail(`searching the imported PDF found nothing: ${JSON.stringify(found)}`);

const hasWeb = existsSync(path.join(root, 'apps', 'server', 'dist', 'web', 'index.html'));
if (hasWeb) {
  const page = await fetch(`${origin}/`);
  if (!page.ok || !(await page.text()).includes('<div id="root">'))
    fail('the SPA was not served at /');
}

// Graceful shutdown over IPC must close the database and release the vault lock.
child.send({ type: 'skb:shutdown' });
let exitCode;
try {
  exitCode = await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    timeout(10_000, 'shutdown'),
  ]);
} catch (error) {
  fail(error.message);
}
if (exitCode !== 0) fail(`graceful shutdown exited with code ${exitCode}`);
if (existsSync(path.join(vault, '.skb', 'lock')))
  fail('the vault lock was not released on shutdown');

cleanup();
console.log(
  `Smoke test passed: server ${body.version} on ${origin} (SQLite ${body.database.sqliteVersion}` +
    `${hasWeb ? ', SPA served' : ''}, PDF imported and searchable, graceful shutdown released the vault).`,
);

/** A one-page PDF with one line of Helvetica text. */
function tinyPdf(text) {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}
