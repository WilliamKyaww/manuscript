# Phase 1 — Foundation: repository, tooling, server and web skeletons

**Status:** Complete (4 October 2026) · **Branch:** `phase/01-foundation`

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
- [x] **1.01** Root `package.json` (private, ESM, npm workspaces `apps/*` and `packages/*`, `engines.node >= 24`), `.nvmrc`
- [x] **1.02** `.gitignore`, `.gitattributes` (LF normalisation, CRLF for `.bat`, binary types), `.editorconfig`
- [x] **1.03** TypeScript 7: `tsconfig.base.json` (strict, ESNext, bundler resolution, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`) and per-package configs; `npm run typecheck` (core, server, web, web config files, E2E)
- [x] **1.04** Biome configuration (lint + format; config migrated to Biome 2.5's `preset` syntax); `npm run lint`, `npm run format`
- [x] **1.05** Vitest root configuration with one project per package (`core`, `server`, `web`); `npm run test`

### Shared core (`packages/core`)
- [x] **1.06** Package skeleton; prefixed ULID helpers (`createIdFactory`, `isId`, `idKind`, `idSchema`, `idTimestamp`), typed errors + problem-details schema, shared API contracts (`defineEndpoint`, ADR-0024), ping/health schemas; 14 unit tests incl. compile-time type tests

### Server (`apps/server`)
- [x] **1.07** Config resolution (flags > `SKB_*` > defaults; Windows/macOS/Linux data dirs; data dir refused inside the vault; dev web origin loopback-only); 8 tests
- [x] **1.08** Structured logger (levels, JSON/pretty, child bindings, deep secret redaction, error serialisation, local-time console output); 5 tests
- [x] **1.09** `node:sqlite` adapter (WAL, `synchronous=NORMAL`, foreign keys, busy timeout, statement LRU cache, positional/named parameters, savepoint-nested transactions that reject async callbacks, constraint detection) with a precise `ExperimentalWarning` filter; 11 tests
- [x] **1.10** Migration runner (ordered `NNNN_*.sql`, `_migrations` with SHA-256 checksums, per-migration transactions, edited/unknown/out-of-order detection) + `0001_init.sql` (`settings`, STRICT); 8 tests
- [x] **1.11** Vault service (`.skb/` layout, `vault.json` with layout version, exclusive lock with stale/unreadable recovery and foreign-host protection, `resolveInVault()` rejecting traversal, absolute/drive/UNC paths, NUL, Windows device names, non-portable characters, `.skb/` access and junction escapes); 32 tests
- [x] **1.12** Atomic file writes (temp + fsync + rename, Windows lock retry, POSIX mode); 4 tests
- [x] **1.13** Security: persistent per-user token (owner-only file), Host allowlist, Fetch-Metadata cross-site block, cookie (`skb_session_<port>`, HttpOnly, SameSite=Strict) or bearer auth, Origin check on cookie-authenticated writes, `/auth?token=&next=` bootstrap with safe redirects; 17 tests
- [x] **1.14** Errors → RFC 9457 problem details (`application/problem+json`; internal errors logged, never exposed); 404 for unknown API routes; 3 tests + integration
- [x] **1.15** `GET /api/ping` (public) and `GET /api/health` (vault, SQLite version, migrations, uptime) registered from shared contracts with input and (non-production) output validation; 8 integration tests
- [x] **1.16** Static SPA serving with immutable hashed assets, SPA fallback, real 404s for missing files, API never shadowed, traversal-safe; security headers incl. CSP on every response; 7 tests
- [x] **1.17** Entry point: `startServer()` (vault → DB → migrations → token → listen) + `main.ts` (ready line with sign-in link printed outside logs, IPC ready/shutdown messages for Electron and harnesses, signals, clear port-in-use/locked-vault messages); verified: 4 integration tests over real HTTP, manual crash-recovery and second-instance refusal, and graceful shutdown via IPC in the smoke test (exit 0, lock released)
- [x] **1.18** esbuild bundle → `apps/server/dist/server.mjs` (+ `migrations/`, `web/`); `npm run test:smoke` checks the bundle end to end

### Web (`apps/web`)
- [x] **1.19** Vite 8 + React 19 + TypeScript + Tailwind CSS 4 (`index.html` with `lang="en-GB"`)
- [x] **1.20** TanStack Router (code-based) + TanStack Query (no retries on 4xx) with a status page (healthy / sign-in required / unreachable + retry)
- [x] **1.21** Typed API client on the shared contracts (credentials, problem-details errors, unreachable detection, response validation); `ApiProvider` for dependency injection; 6 tests
- [x] **1.22** Vite dev proxy for `/api` and `/auth` on port 5317 (avoids clashing with other Vite projects on 5173); dev sign-in via proxy verified manually (401 → sign-in → HttpOnly cookie → 200)
- [x] **1.23** Component tests (Testing Library + happy-dom) for the status page: healthy, 401, unreachable with retry; 9 tests

### Orchestration
- [x] **1.24** `npm run dev`: server (`tsx watch`) + Vite via concurrently, using git-ignored `.dev-vault/` and `.dev-data/` (verified manually)
- [x] **1.25** `npm run build` (web then server bundle) and `npm start` (production server with source maps)
- [x] **1.26** `run-web.bat` + `scripts/run-web.mjs`: Node ≥ 24 check, install when needed, rebuild when sources are newer, reopen an already-running instance, start and open the browser, clear errors, UTF-8 console; verified manually with a temporary vault (fresh build + start; second launch detects the running app; cookie sign-in works)
- [x] **1.27** `npm run verify` (typecheck → lint → test → build → smoke)

### End-to-end
- [x] **1.28** Playwright configuration (production bundle, throwaway vault, fixed test token); 5 E2E tests: sign-in → Healthy with no console/CSP errors; no-session message; invalid link 403; API protection + SPA fallback + 404; security headers

### De-risking spike
- [x] **1.29** Electron 44.5.1 spike (scratchpad, not committed): `node:sqlite` (SQLite 3.53.4) with FTS5 + JSON1 in a `utilityProcess`; the unmodified server bundle ran in a `utilityProcess`, signalled ready over `parentPort`, served ping/health/SPA; recorded in ADR-0006 and the journal

### Documentation
- [x] **1.30** README (setup, running, configuration, security, testing, troubleshooting), AGENTS.md commands verified + environment pitfalls, ADR-0024, technical-debt register (TD-01…03), STATE/FEATURES/journal updated

## Tests
Totals at the gate: **136 unit/integration/component tests** (core 14, server 107, web 15), **5 E2E
tests**, bundle smoke test, type-check of 5 TypeScript projects, Biome on 80 files — all green.

## Acceptance criteria
- [x] Fresh clone → `run-web.bat` → browser opens the app showing a healthy status (launcher verified with a temporary vault; E2E verifies the signed-in page).
- [x] `npm run verify` passes.
- [x] The API rejects requests without the token, with a foreign `Host`, or with a foreign `Origin` on writes (unit + integration + E2E).
- [x] Killing the server mid-run never corrupts the vault: atomic writes for `vault.json`/token, WAL database; force-kill followed by restart recovered the stale lock with the database intact.
- [x] Spike result documented with evidence (ADR-0006).

## Documentation requirements
README development section; AGENTS.md command table; ADR-0006 consequences updated with the spike
result; journal entry — all done.

## Gate
- [x] All tasks `[x]`
- [x] `npm run verify` green
- [x] `npm run test:e2e` green
- [x] STATE.md, FEATURES.md, journal updated
- [x] Merged into `main` with `--no-ff`

## Recommended commit messages
```text
chore: initialise npm workspaces with TypeScript 7, Biome and Vitest
feat(core): add prefixed ULID helpers, typed errors and shared API contracts
feat(server): add node:sqlite adapter, migrations and vault service
feat(server): add localhost token, host and origin protection
feat(server): add health endpoint, problem details, static serving and startup
feat(web): add Vite React app with typed API client and status page
chore: add build, smoke-test and run-web launcher scripts
test: add Playwright end-to-end foundation checks
docs: record Phase 1 foundation, Electron spike and API contract decision
```
