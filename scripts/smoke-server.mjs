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
    `${hasWeb ? ', SPA served' : ''}, graceful shutdown released the vault).`,
);
