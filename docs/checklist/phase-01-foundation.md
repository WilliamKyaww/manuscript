# Phase 1 — Foundation: repository, tooling, server and web skeletons

**Status:** Not started · **Branch:** `phase/01-foundation`

## Objective
A working monorepo with type-checking, linting, tests and builds; a secure local Hono server with
SQLite (`node:sqlite`), migrations and a vault; a React SPA talking to it through a typed client; dev
and local-run commands including `run-web.bat`; and evidence that `node:sqlite` works under Electron.

## Why it exists
Every later phase depends on these seams (config, DB, vault, security, API client, test harness).
Getting them right once avoids retrofitting security and data safety later.

## Dependencies
Phase 0 (architecture and ADRs 0002–0007, 0017).

## Atomic tasks

### Workspace and tooling
- [ ] **1.01** Root `package.json` (private, ESM, npm workspaces `apps/*` and `packages/*`, `engines.node >= 24`), `.nvmrc`
- [ ] **1.02** `.gitignore`, `.gitattributes` (LF normalisation, binary types), `.editorconfig`
- [ ] **1.03** TypeScript 7: `tsconfig.base.json` (strict, ESNext, bundler resolution, `verbatimModuleSyntax`) and per-package configs; `npm run typecheck`
- [ ] **1.04** Biome configuration (lint + format); `npm run lint`, `npm run format`
- [ ] **1.05** Vitest root configuration with one project per package; `npm run test`

### Shared core (`packages/core`)
- [ ] **1.06** Package skeleton with exports; prefixed ULID helpers (`newId('note')`, `isId(value, 'note')`), base error types, health/version schemas (Zod); unit tests

### Server (`apps/server`)
- [ ] **1.07** Config resolution (CLI flags > `SKB_*` env > defaults): port, vault path, app data dir, log level, dev mode; unit tests
- [ ] **1.08** Structured logger with level filtering and secret redaction; unit tests
- [ ] **1.09** `node:sqlite` adapter (`SqlDatabase`: open with WAL, `foreign_keys`, `busy_timeout`; `exec/run/get/all`; nested transactions via savepoints; close) with `ExperimentalWarning` suppression; unit tests
- [ ] **1.10** Migration runner (ordered `NNNN_*.sql`, `_migrations` with checksums, transactional apply, checksum-mismatch error) + `0001_init.sql` (`settings` table); unit tests
- [ ] **1.11** Vault service: create/open, `.skb/` layout, `vault.json` (vault id, schema version), single-server lock with stale-lock recovery, `resolveInVault()` path containment; unit tests incl. traversal attempts
- [ ] **1.12** Atomic file write helper (temp file + rename); unit tests
- [ ] **1.13** Security: persistent token in the app data dir; `Host` allowlist; `Origin` check on unsafe methods; cookie or bearer auth; `/auth?token=` bootstrap setting an HttpOnly `SameSite=Strict` cookie; unit/integration tests
- [ ] **1.14** Error handling: typed domain errors → RFC 9457 problem-details JSON; 404 for unknown API routes; integration tests
- [ ] **1.15** `GET /api/health` (status, version, vault id/path, db ok, uptime) and typed `AppType` export for the RPC client; integration tests
- [ ] **1.16** Production static serving of the built SPA with SPA fallback (non-API routes → `index.html`); integration test
- [ ] **1.17** `main.ts` entry: startup sequence, ready line with the bootstrap URL, graceful shutdown (close DB, release lock); manual verification recorded
- [ ] **1.18** Server bundle with esbuild → `apps/server/dist/server.mjs`; smoke test that the bundle starts and answers `/api/health`

### Web (`apps/web`)
- [ ] **1.19** Vite 8 + React 19 + TypeScript + Tailwind CSS 4 setup
- [ ] **1.20** TanStack Router (code-based routes) + TanStack Query with a status page showing server health
- [ ] **1.21** Typed API client (Hono RPC) with credentials, problem-details error normalisation; unit test
- [ ] **1.22** Vite dev proxy for `/api` and `/auth`; dev authentication flow works end to end
- [ ] **1.23** Component-test setup (Testing Library + happy-dom) with a first test of the status page

### Orchestration
- [ ] **1.24** `npm run dev`: server (`tsx watch`) + Vite together, using a git-ignored `.dev-vault/`
- [ ] **1.25** `npm run build` (web + server bundle) and `npm start` (local production server)
- [ ] **1.26** `run-web.bat`: checks Node ≥ 24, installs dependencies if missing, builds if stale, starts the server, opens the bootstrap URL, prints clear errors
- [ ] **1.27** `npm run verify` (typecheck → lint → test → build)

### End-to-end
- [ ] **1.28** Playwright configuration; E2E: built server on a random port with a temp vault, bootstrap auth, status page shows "Healthy"; unauthenticated API call returns 401

### De-risking spike
- [ ] **1.29** Electron 44 spike (outside the product tree): `node:sqlite` + FTS5 inside a `utilityProcess`; result recorded in `DECISIONS.md` (ADR-0006) and the journal

### Documentation
- [ ] **1.30** README (setup, dev, build, test, run-web), AGENTS.md commands verified, STATE/FEATURES/journal updated

## Tests
Unit: ids, config, logger redaction, SQL adapter (transactions, savepoints, rollback), migrations
(order, checksum mismatch, idempotency), vault (layout, lock, traversal), atomic writes, security
(token, host, origin, cookie/bearer). Integration: health, problem details, auth bootstrap, static
fallback. Component: status page. E2E: health via browser; 401 without auth.

## Acceptance criteria
- Fresh clone → `run-web.bat` → browser opens the app showing a healthy status.
- `npm run verify` passes from a clean checkout.
- API rejects requests without the token, with a foreign `Host`, or with a foreign `Origin` on writes.
- Killing the server mid-write never corrupts `vault.json` or the database (atomic writes + WAL).
- Spike result documented with evidence.

## Documentation requirements
README development section; AGENTS.md command table; ADR-0006 consequences updated with the spike
result; journal entry.

## Gate
- [ ] All tasks `[x]`
- [ ] `npm run verify` green
- [ ] `npm run test:e2e` green
- [ ] STATE.md, FEATURES.md, journal updated
- [ ] Merged into `main` with `--no-ff`

## Recommended commit messages
```text
chore: initialise npm workspaces with TypeScript 7, Biome and Vitest
feat(core): add prefixed ULID helpers and shared schemas
feat(server): add node:sqlite adapter, migrations and vault service
feat(server): add localhost token, host and origin protection
feat(server): add health endpoint, problem details and static serving
feat(web): add Vite React shell with typed API client and status page
chore: add dev, build, verify scripts and run-web.bat launcher
test: add Playwright end-to-end health check
docs: record Electron node:sqlite spike and foundation state
```
