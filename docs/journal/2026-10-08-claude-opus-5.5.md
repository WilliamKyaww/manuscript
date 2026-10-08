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

## Session 8 — Phase 5: source library and ingestion pipeline

- **Date:** Thursday 8 October 2026
- **Time:** about 12:10–17:45
- **Agent model:** Claude Opus 5.5 (`claude-opus-5-5`)
- **Phase:** 5 — Source library and ingestion pipeline (branch `phase/05-sources`)
- **Work performed:** built and verified Phase 5 end to end and merged it.

### What was done

1. **Spike and dependencies (5.01).** pdfjs-dist and unpdf compared on real PDFs (Raft paper, CS224N
   lecture 1) in Node and Electron's Node: identical text, so pdf.js is used directly (ADR-0019). mammoth
   was dropped for a vulnerable transitive dependency; DOCX is read in-house like PPTX. Added
   pdfjs-dist, fflate, fast-xml-parser and a `shell-quote` override (TD-07).
2. **Core (5.05, 5.06, 5.12).** Source kinds, the shared `LocatorSchema`, `SourceParser` /
   `NormalisedDocument`; type detection by extension and magic bytes; the section-aware chunker; the
   `kind:` search filter; contracts for sources, jobs and the new events.
3. **Jobs (5.02, 5.03).** Migration `0005` and the SQLite job queue (`src/jobs/`): atomic claiming,
   retries with back-off for unexpected errors, permanent errors with user-facing reasons, time limits,
   cancellation, recovery after a crash or shutdown, `job.updated` events.
4. **Parsers (5.07–5.10).** Markdown/text (fence-aware headings), PDF (pages, missing text layers,
   password/damage/page limits, de-hyphenation), PPTX (presentation order, groups, tables, speaker
   notes, chrome left out), DOCX (headings by style name or outline level, lists, tables, tracked
   changes); a size-checked ZIP reader and an XML helper that refuses DOCTYPEs.
5. **Library (5.04, 5.13–5.15).** Import by upload or server path into `Sources/<module | Inbox>/`
   (byte for byte, SHA-256 de-duplication, safe unique names); idempotent ingestion in one
   transaction; the reconciler that follows the folder through the notes index (ADR-0028); the API.
6. **Search (5.16).** Source passages ranked with notes, one per page/slide/section, with locators.
7. **Web (5.17, 5.18).** Library page (modules, drag and drop, live progress, retry, delete) and the
   viewer (pdf.js pages with thumbnails, zoom and a text layer; slides with notes; documents by
   section) with deep links; source results in search; "Search for …" in the palette.
8. **Verification (5.19, 5.20).** `e2e/library.spec.ts`; security tests (zip bomb, 3,001-page PDF,
   size limit, traversal and unportable names, mismatched types, path-import rules); the smoke test
   imports and finds a PDF through the bundled server; the performance test adds a 10,000-page library.
9. **Docs (5.21).** `docs/guide/sources.md`; search guide, data model, architecture, tech stack,
   ADR-0028, backlog B-SE-04…06 and B-SO-01…06, TD-07…09, FEATURES, STATE, AGENTS.md pitfalls.

### Important decisions

- **ADR-0028:** the library follows the `Sources` folder — matched by path, then by hash; moves keep
  the id, deletions mark *missing*, trash restores revive, unknown supported files register, and the
  library rebuilds from the folder if `.skb/` is lost.
- A source is titled by its file name; module codes are folder names until Phase 6.
- Search shows one hit per page, slide or section (its best chunk); tags and types leave sources out;
  folder filters decide which index can match.
- Ingestion is a no-op when the content hash and parser version are unchanged, so enqueueing is
  always safe; a failed re-ingestion keeps the previous sections.

### Files changed

- `packages/core/src/sources/*`, `packages/core/src/api/{jobs,sources,search,vault}.ts`,
  `packages/core/src/search/query.ts`
- `apps/server/src/jobs/*`, `apps/server/src/db/migrations/0005_sources.sql`,
  `apps/server/src/modules/sources/**`, `apps/server/src/modules/search/{clauses,repository,service}.ts`,
  `apps/server/src/modules/notes/indexer.ts` (attachment events), `apps/server/src/modules/index.ts`
- `apps/web/src/features/library/**`, `apps/web/src/components/ProgressBar.tsx`,
  `apps/web/src/features/search/SearchPage.tsx`, `apps/web/src/router.tsx`, `apps/web/vite.config.ts`
- `e2e/library.spec.ts`, `e2e/axe.ts`, `scripts/smoke-server.mjs`, `apps/server/test/**`
- Docs listed above; `THIRD_PARTY_NOTICES.md` (pdf.js text-layer CSS).

### Tests run

| Command | Result |
|---|---|
| `npm run verify` | **Pass** — type-check, Biome, **424** Vitest tests, build, smoke (incl. a PDF import) |
| `npx playwright test` | **Pass** — **72/72** (2 new library tests; the library page in the sticky-header and axe checks) |
| `npm run test:perf` | **Pass** — search p95 **30 ms** at 10,000 notes; **105 ms** with 10,000 PDF pages (21,143 chunks) as well (budget 150 ms) |
| Manual | Imported the CS224N lecture (40 pages, 5.3 MB), the Raft paper and a DOCX in the browser; screenshots of the library, search, the PDF viewer (light and dark) and the document view checked |

### Problems encountered

- **pdf.js refuses Node `Buffer`s** (`readFileSync` returns one; `Buffer.slice()` is still one): the PDF
  parser now copies into a plain `Uint8Array`. Found by the first integration test.
- **Search was over budget after adding sources.** Ranking a `UNION` of notes and chunks in SQL sorted
  every match and ran the FTS MATCH again for snippets. Each index is now read in FTS5's own rank order
  with an early `LIMIT` and inline snippets, and merged in code; excluded words join the FTS5
  expression as `NOT` (210 → 25 ms for `lock -deadlock`); folder filters skip the index that cannot
  match (334 → 25 ms).
- **Noisy timings.** With chat, music and browsers running, the same code measured two to three times
  slower; the Phase 4 code itself measured p95 186 ms in that state. Comparing against a worktree of
  the previous gate showed what was real (now in AGENTS.md).
- **Thumbnails did not follow** a deep-linked page: the effect ran before the thumbnails existed.
- **A flaky Notes page test** (pre-existing): the first lazily loaded route can take more than
  Testing Library's one-second default on a busy machine; the timeout is now five seconds.
- Tooling: a commit message written with `Set-Content -Encoding utf8` began with a byte-order mark
  (amended before anything else was committed on top); PowerShell treats curly quotes as string
  delimiters.

### Unresolved issues

- Optional task 5.11 (web page import) moved to the backlog (B-SO-01).
- Slides are shown as text (B-SO-02); scanned pages need OCR (Phase 11); search hits are not grouped
  by source (B-SE-04).

### Next steps

Phase 6 — course structure and concepts (`phase/06-course-structure`).
