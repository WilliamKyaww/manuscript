# State

_Last updated: 4 October 2026, 19:15 BST — Claude Opus 5.5._

## Current phase

**Phase 3 — Notes and Markdown knowledge base: next.** Phases 0 (research), 1 (foundation) and
2 (application shell) are complete and merged into `main`.

## What works

- **Local server** (`apps/server`): Hono on `127.0.0.1` with token (cookie or bearer), Host allowlist,
  Origin and Fetch-Metadata checks; `/auth` sign-in link; `GET /api/ping`, `GET /api/health`;
  RFC 9457 problem details; CSP and security headers; production SPA serving.
- **Storage:** `node:sqlite` adapter (WAL, savepoint transactions), checksummed migrations (`0001_init`),
  vault (`.skb/` layout, lock with crash recovery, strict path containment), atomic writes.
- **Application shell** (`apps/web`): sidebar with all 13 sections (collapsible, remembered), fixed page
  headers with a single scrolling body on every route, sticky section headers, light/dark/system themes
  with no flash on load, command palette (`Ctrl+K`), shortcut registry and cheat sheet (`?`), session
  gate (sign-in required / server unreachable), toasts, accessible primitives and state components.
- **Pages:** Today (honest placeholders naming their phases), Settings (vault, appearance, keyboard,
  about), placeholders for every unbuilt section, not-found and route-error pages.
- **Commands:** `npm run dev` (ports 4317 + 5317), `npm run build`, `npm start`, `npm run verify`,
  `npm run test:e2e`, **`run-web.bat`**.
- **Tests:** 169 Vitest tests and 56 Playwright tests (incl. sticky headers on every route and axe scans
  in both themes) — all green.

## In progress

- Nothing; Phase 3 not yet started.

## Incomplete / not started

- Phases 3–22. No notes, sources, learning or AI features exist yet; their sections show placeholders.

## Broken

- Nothing known.

## Next steps

1. Create `phase/03-notes` from `main`.
2. Phase 3 begins with route-level code splitting (3.24, repays TD-04), then Markdown parsing in
   `@skb/core` (3.01–3.02), the notes index and migrations (3.03–3.07), the notes service and API
   (3.08–3.12), and the CodeMirror editor UI (3.13–3.19).

## Relevant decisions

ADR-0004 hybrid storage (Markdown canonical) · ADR-0005 localhost security · ADR-0006 `node:sqlite` ·
ADR-0007 plain SQL + prefixed ULIDs · ADR-0009 CodeMirror 6 · ADR-0018 frontend stack ·
ADR-0023 git workflow (no AI trailers) · ADR-0024 shared Zod API contracts.

## Technical debt

TD-01 launcher duplicates the data-directory logic · TD-02 contracts only answer 200 · TD-04 single JS
bundle (scheduled as task 3.24). TD-03 repaid in Phase 2.

## Environment notes for agents

`ELECTRON_RUN_AS_NODE=1` and `NoDefaultCurrentDirectoryInExePath=1` are set in the Claude Code/VS Code
environment; another local project uses port 5173 (see `AGENTS.md` §5). axe checks colour contrast
only inside the viewport — use the `fitViewportToContent` approach in `e2e/shell.spec.ts`.

## Open questions for the user

`docs/backlog/research-questions.md` — most important: RQ-01 (workflow), RQ-02 (modules and
assessments), RQ-03 (VLE/recordings), RQ-04 (AI providers and budget), RQ-05 (existing notes to bring in).
