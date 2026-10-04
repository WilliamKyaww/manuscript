import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { E2E_ORIGIN, E2E_PORT, E2E_TOKEN } from './e2e/constants';

const PREFIX = 'skb-e2e-';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Best-effort removal of vaults left by earlier runs (the server may still hold files while a run
// is in progress, so cleanup happens at the start of the next run instead of in teardown).
for (const entry of readdirSync(tmpdir())) {
  if (!entry.startsWith(PREFIX)) continue;
  const full = path.join(tmpdir(), entry);
  try {
    if (Date.now() - statSync(full).mtimeMs > ONE_DAY_MS)
      rmSync(full, { recursive: true, force: true });
  } catch {
    // Ignore folders still in use.
  }
}

// Workers re-evaluate this file; the environment variable keeps one directory per run.
process.env.SKB_E2E_DIR ??= mkdtempSync(path.join(tmpdir(), PREFIX));
const runDir = process.env.SKB_E2E_DIR;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list']],
  use: {
    baseURL: E2E_ORIGIN,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Runs the production bundle (built by `npm run test:e2e`) against a throwaway vault.
    command: `node apps/server/dist/server.mjs --port ${E2E_PORT}`,
    url: `${E2E_ORIGIN}/api/ping`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      SKB_VAULT: path.join(runDir, 'vault'),
      SKB_DATA_DIR: path.join(runDir, 'data'),
      SKB_AUTH_TOKEN: E2E_TOKEN,
      SKB_LOG_LEVEL: 'warn',
    },
  },
});
