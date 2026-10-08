# 8 October 2026 — Claude Opus 5.5

- **Date:** Thursday 8 October 2026
- **Time:** session 5, from 11:00 BST
- **Agent model:** Claude Opus 5.5 (`claude-opus-5-5`)
- **Phase:** 3 — Notes and Markdown knowledge base: documentation, gate and merge
- **Work performed:** added the missing acceptance test, wrote the Markdown guide and the Phase 3
  ADRs, updated the PRD and project documents, passed the gate and merged Phase 3 into `main`.

## What was done

1. **Acceptance criterion "notes survive deletion of `.skb/`"** had no direct test (only index rows
   were deleted, or the server restarted). Added `apps/server/test/rebuild.test.ts`: after deleting
   the whole folder, a fresh index recovers every note, the links between them and persisted ids.
2. **Task 3.23.** `docs/guide/markdown.md` (dialect, link resolution, properties, ids, templates,
   attachments, saving and conflicts, renaming and the trash, indexed files, differences from
   Obsidian, keyboard) and `docs/guide/README.md`; ADR-0025 and ADR-0026; PRD updates in
   `data-model.md` (id rule, notes schema), `knowledge-system.md` §3 (resolution), `architecture.md`
   §6.1 (save flow and events) and `ui.md` §2 (panes); STATE, FEATURES, README, AGENTS, the checklist
   and the backlog/technical-debt registers.
3. **Gate.** All Phase 3 tasks and acceptance criteria `[x]`; verify and E2E green; merged with
   `--no-ff`.

## Important decisions

None new beyond ADR-0025/0026 (recorded with yesterday's work).

## Files changed

`apps/server/test/rebuild.test.ts`; `docs/guide/{README,markdown}.md`; `DECISIONS.md`;
`docs/prd/{data-model,knowledge-system,architecture,ui}.md`; `docs/checklist/{README,phase-03-notes}.md`;
`docs/backlog/{backlog,technical-debt}.md`; `docs/README.md`; `STATE.md`; `FEATURES.md`; `README.md`;
`AGENTS.md`; this journal and yesterday's.

## Tests run

| Command | Result |
|---|---|
| `npx vitest run --project server test/rebuild` | **Pass** — 1 test |
| `npm run verify` | **Pass** — type-check, Biome, **326** Vitest tests (45 files), build, smoke test |
| `npx playwright test` | **Pass** — **63/63** (sticky headers on every route and pane, navigation, axe on every route × 2 themes and all note views, notes flows, restart persistence) |

## Problems encountered

- A shell here-document mangled the very `AGENTS.md` note about here-documents mangling backslashes;
  fixed with the editor tool.

## Unresolved issues

- TD-01, TD-05, TD-06; backlog B-KM-09…13; research questions RQ-01…RQ-12 (RQ-05 can now be answered
  by opening an existing Obsidian vault in place).

## Next steps

Phase 4 — lexical search and quick navigation on top of the `notes_fts` table: create
`phase/04-search` from `main`.

## Session 6 — renaming the project to Manuscript

- **Date:** Thursday 8 October 2026
- **Time:** afternoon (after the Phase 3 merge)
- **Agent model:** Claude Opus 5.5 (`claude-opus-5-5`)
- **Phase:** between phases (housekeeping before Phase 4)
- **Work performed:** renamed the product from "Study Knowledge Base" to **Manuscript** in the
  application, the documentation and on GitHub, without disturbing the folders the user already uses.

### What was done

1. **Application.** `APP_NAME = 'Manuscript'`, `APP_ID = 'manuscript'`; page titles, sidebar, sign-in
   and error messages, favicon title, launcher (`run-web.bat`, `scripts/run-web.mjs`), package names and
   descriptions. Default folders are now `Documents\Manuscript` and `%APPDATA%\Manuscript`.
2. **No orphaned data.** The user had already run the app (a vault with `Test1.md` in
   `Documents\Study Knowledge Base`, a token in `%APPDATA%\StudyKnowledgeBase`, and the server still
   running). When only the old folders exist they keep being used (server and launcher), the server
   says so at start-up, and the launcher still recognises a running instance from before the rename.
   Nothing was moved or stopped.
3. **GitHub.** The private repository `WilliamKyaww/study-knowledge-base` was renamed to
   `WilliamKyaww/manuscript` through the GitHub API (the GitHub CLI is not installed; the call used the
   credential git already stores, without printing it) and `origin` was updated. GitHub redirects the
   old URL. Nothing has been pushed yet; the repository has no branches.
4. **Documentation.** ADR-0027 (supersedes ADR-0022), README, AGENTS, the architecture PRD, the guides
   (with how to rename the folders), RQ-11 marked answered, the Phase 0 checklist annotated.

### Important decisions

- **ADR-0027:** everything users see says Manuscript; internal identifiers keep the `skb` prefix
  (`.skb/`, `skb-id`, `skb.db`, `@skb/*`, `SKB_*`, cookie names, problem URNs) so existing vaults and
  configuration need no migration.

### Files changed

`packages/core/src/app.ts`; `apps/server/src/{config/config,main,vault/vault,security/guards}.ts` and
tests; `apps/web/{index.html,public/favicon.svg}`, `src/app/{SessionGate,Sidebar}.tsx`,
`src/lib/{notify,api/client}.ts`, `src/components/Page.test.tsx`; `run-web.bat`, `scripts/run-web.mjs`;
package manifests and lockfile; `DECISIONS.md`, `README.md`, `AGENTS.md`, `STATE.md`,
`docs/prd/architecture.md`, `docs/guide/*`, `docs/backlog/research-questions.md`,
`docs/checklist/phase-00-research.md`.

### Tests run

| Command | Result |
|---|---|
| `npx vitest run` | **Pass** — 327 tests (new: legacy-folder fallback) |
| `npm run verify` | **Pass** — type-check, Biome, 327 tests, build, smoke |
| `npx playwright test` | **Pass** — 63/63 |

### Unresolved issues

- The local project folder is still called `study-knowledge-base`; the user will rename it (renaming it
  from inside the running session would break the session).
- The user's vault and settings are still in the old folders; renaming them is optional
  (`docs/guide/README.md`).

### Next steps

Phase 4 — lexical search and quick navigation.

## Session 7 — Phase 4: lexical search and quick navigation

- **Date:** Thursday 8 October 2026
- **Time:** afternoon (after the rename)
- **Agent model:** Claude Opus 5.5 (`claude-opus-5-5`)
- **Phase:** 4 — Lexical search and quick navigation (branch `phase/04-search`)
- **Work performed:** built and verified Phase 4 end to end and merged it.

### What was done

1. **Core (4.01, 4.04).** `search/query.ts`: the search syntax → a safe FTS5 expression plus filters
   (every term quoted; input and terms capped); `withFilter`/`withoutFilter`. `search/fuzzy.ts`: quick-
   switcher ranking (exact > prefix > word prefix > substring > subsequence, accents and case ignored,
   recency boost, highlight ranges). Contracts for search and recent items.
2. **Server (4.02, 4.03, 4.05).** `modules/search`: BM25 with column weights set as the FTS5 rank
   (migration `0004`), text-part highlights and snippets, composable and negatable filters, filter-only
   searches, paging, counts capped at 1,000, the first matching line; recent items (migration `0003`).
3. **Web (4.06–4.08).** Search section with the query in the address, filter menus and chips, syntax
   help; quick switcher (`Ctrl+O`) with recent notes and note creation; notes and "Search notes for …"
   in the command palette; pages can name the control to focus after navigation (`data-autofocus`).
4. **Verification (4.09, 4.10).** Search added to `npm run test:perf`; `e2e/search.spec.ts`.
5. **Docs (4.11).** `docs/guide/search.md`, the checklist, FEATURES, STATE, README, PRD (search and
   data model), backlog B-SE-01…03.

### Important decisions

- Results carry highlighted text as parts (`{ text, match }`), never HTML.
- Several `tag:` filters must all apply; several `type:`, `folder:` or `module:` filters are
  alternatives (a note has one of each).
- Counting stops at 1,000 matches: exact totals of very common words are not worth a full count.

### Tests run

| Command | Result |
|---|---|
| `npm run verify` | **Pass** — type-check, Biome, **357** Vitest tests, build, smoke |
| `npx playwright test` | **Pass** — **70/70** (4 new search tests; `/search` in the sticky-header and axe checks) |
| `npm run test:perf` | **Pass** — search p95 **47 ms** over 200 mixed queries at 10,000 notes (budget 150 ms) |

### Problems encountered

- **Slow tag-filtered searches.** With `tag:` the planner looped over the tagged notes and ran the FTS
  MATCH once per note (330 ms at 10,000 notes). `CROSS JOIN` keeps the FTS table as the outer loop
  (21 ms); configuring the rank in FTS5 removed the temporary sort.
- **Command palette ordering.** "Search notes for …" outranked sections, so typing "settings" and
  pressing Enter searched instead of navigating. Notes and search now rank after sections and commands.
- **Focus after navigation** moved to the page title, taking it away from the search box; pages can now
  mark the control to focus.
- Test-only: a miscounted line number, and a keyboard shortcut pressed before the app had loaded.

### Unresolved issues

- B-SE-01 date filters, B-SE-02 highlight terms in the opened note, B-SE-03 field operators.

### Next steps

Phase 5 — source library and ingestion pipeline (`phase/05-sources`).
