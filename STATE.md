# State

_Last updated: 4 October 2026, 15:22 BST — Claude Opus 5.5._

## Current phase

**Phase 2 — Application shell and layout system: next.** Phases 0 (research) and 1 (foundation) are
complete and merged into `main`.

## What works

- **Local server** (`apps/server`): Hono on `127.0.0.1` with token (cookie or bearer), Host allowlist,
  Origin and Fetch-Metadata checks; `/auth` sign-in link; `GET /api/ping` and `GET /api/health`;
  RFC 9457 problem details; CSP and security headers; production SPA serving.
- **Storage:** `node:sqlite` adapter (WAL, savepoint transactions), checksummed forward-only migrations
  (`0001_init`), vault service (`.skb/` layout, `vault.json`, single-server lock with crash recovery,
  strict path containment), atomic file writes.
- **Web** (`apps/web`): React 19 + Vite 8 + Tailwind 4 + TanStack Router/Query; typed API client on
  shared contracts (`@skb/core`, ADR-0024); status page (healthy / sign-in required / unreachable).
- **Commands:** `npm run dev` (ports 4317 + 5317), `npm run build`, `npm start`, `npm run verify`,
  `npm run test:e2e`, **`run-web.bat`** (install/build when needed, reopen if running, sign-in, browser).
- **Tests:** 136 Vitest tests, 5 Playwright E2E tests, bundle smoke test (incl. graceful IPC shutdown) —
  all green.
- **Electron feasibility:** spike confirmed `node:sqlite` + FTS5 and the server bundle inside an
  Electron 44.5.1 `utilityProcess` (ADR-0006).

## In progress

- Nothing; Phase 2 not yet started.

## Incomplete / not started

- Phases 2–22. No notes, sources, learning or AI features exist yet.

## Broken

- Nothing known.

## Next steps

1. Create `phase/02-app-shell` from `main`.
2. Phase 2: design tokens and themes (2.01–2.02), sticky-header layout architecture (2.03–2.07),
   primitives and state components (2.08–2.11), shortcuts and command palette (2.12–2.13), settings and
   Today skeletons (2.14–2.15), accessibility (2.16), tests incl. the all-routes sticky-header and axe
   E2E checks (2.17–2.20).

## Relevant decisions

ADR-0003 local server · ADR-0004 hybrid storage · ADR-0005 localhost security · ADR-0006 `node:sqlite`
(spike confirmed) · ADR-0007 plain SQL + prefixed ULIDs · ADR-0017 tooling · ADR-0018 frontend ·
ADR-0023 git workflow (no AI trailers) · ADR-0024 shared Zod API contracts.

## Technical debt

TD-01 launcher duplicates the data-directory logic · TD-02 contracts only answer 200 · TD-03 Phase 1
status page lives outside a shell (`docs/backlog/technical-debt.md`).

## Environment notes for agents

`ELECTRON_RUN_AS_NODE=1` and `NoDefaultCurrentDirectoryInExePath=1` are set in the Claude Code/VS Code
environment; another local project uses port 5173 (see `AGENTS.md` §5).

## Open questions for the user

`docs/backlog/research-questions.md` — most important: RQ-01 (workflow), RQ-02 (modules and
assessments), RQ-03 (VLE/recordings), RQ-04 (AI providers and budget).
