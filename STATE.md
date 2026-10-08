# State — Manuscript

_Last updated: 8 October 2026 — Claude Opus 5.5._

## Current phase

**Phase 6 — Course structure and concepts: next.** Phases 0 (research), 1 (foundation), 2 (application
shell), 3 (notes and Markdown knowledge base), 4 (lexical search and quick navigation) and 5 (source
library and ingestion pipeline) are complete and merged into `main`.

## What works

- **Local server** (`apps/server`): Hono on `127.0.0.1` with token (cookie or bearer), Host allowlist,
  Origin and Fetch-Metadata checks; `/auth` sign-in link; RFC 9457 problem details (with `details`);
  CSP and security headers; production SPA serving; server-sent events at `/api/events`.
- **Storage:** `node:sqlite` adapter, checksummed migrations (`0001`–`0005`), vault (`.skb/` layout,
  lock with crash recovery, strict path containment), atomic writes, vault-scoped settings.
- **Notes** (Phase 3): Markdown files are canonical; the index (notes, aliases, tags, links,
  attachments, FTS5) is rebuilt from the files and follows edits made in other programs. Ids are
  written into files only when needed (ADR-0025). Editor, preview, backlinks, moves with link
  rewriting, trash, templates, attachments.
- **Search** (Phases 4–5): full-text search over notes **and source passages** (`/search`,
  `Ctrl+Shift+F`) with BM25 ranking, highlighted snippets, phrases, `OR`, exclusions and composable
  tag/type/folder/module/**kind** filters; notes open at the matching line, sources at their page,
  slide or section. Quick switcher (`Ctrl+O`) and "Search for …" in the command palette.
- **Source library** (Phase 5): import PDFs, PowerPoint (`.pptx`), Word (`.docx`), Markdown and text by
  picker or drag and drop into `Sources/<module | Inbox>/`, byte for byte and de-duplicated by
  SHA-256; a persistent **job queue** (retries, cancellation, time limits, restart recovery) extracts
  per-page / per-slide (with speaker notes) / per-heading sections and chunks with locators; the
  library follows the `Sources` folder (moves, edits, deletions, files dropped in by hand, rebuild
  after losing `.skb/` — ADR-0028). **Viewer**: pdf.js pages with thumbnails, zoom and selectable text;
  slides as text with notes; documents by section; deep links `?page=` / `?slide=&notes=` / `?section=`.
- **Application shell:** sidebar, sticky page headers (per pane on paned pages), themes, command
  palette (`Ctrl+K`), shortcuts (`?`), session gate, toasts; every page is its own code chunk.
- **Commands:** `npm run dev`, `npm run build`, `npm start`, `npm run verify` (smoke test now imports
  and finds a PDF through the bundle), `npm run test:e2e`, `npm run test:perf`, **`run-web.bat`**.
- **Tests:** 424 Vitest tests and 72 Playwright tests (incl. sticky headers on every route and pane,
  axe in both themes, the library and the slide viewer) — all green. Performance at 10,000 notes:
  search p95 30 ms; with 10,000 PDF pages as well, p95 105 ms (budget 150 ms; timings roughly double
  under heavy background load).

## In progress

- Nothing; Phase 6 not yet started.

## Incomplete / not started

- Phases 6–22. Course structure, concepts, learning and AI features do not exist yet; their sections
  show placeholders. Sources are filed by module *folder*; Phase 6 turns module codes into entities.
- Not in Phase 5 (backlog): web page import (B-SO-01), slide pictures (B-SO-02), DOCX footnotes and
  comments (B-SO-03), OCR for scanned pages (Phase 11), grouping search hits by source (B-SE-04),
  search-term highlighting in the viewer (B-SE-05). Search has no date filters yet (B-SE-01).

## Broken

- Nothing known.

## Next steps

1. Create `phase/06-course-structure` from `main`.
2. Phase 6: courses, modules (mapping the existing `Sources/<code>` folders and note `module:`
   properties onto module entities), lectures with attached sources and notes, topics, assessments with
   the mark calculator, and concepts with wikilink resolution.

## Relevant decisions

ADR-0004 hybrid storage · ADR-0005 localhost security · ADR-0006 `node:sqlite` · ADR-0007 plain SQL +
prefixed ULIDs · ADR-0008 SQLite job queue · ADR-0010 FTS5 first, locators always · ADR-0019 parsers
(pdf.js used directly; in-house PPTX and DOCX) · ADR-0024 shared Zod contracts · ADR-0025 note ids
written only when needed · ADR-0026 Obsidian-compatible dialect · ADR-0027 the product is called
Manuscript · **ADR-0028** the source library follows the `Sources` folder.

## Technical debt

TD-01 launcher duplicates the data-directory logic · TD-05 KaTeX override · TD-06 file tree not
virtualised · TD-07 `shell-quote` override (for `concurrently`) · TD-08 parsing on the main thread ·
TD-09 PDF viewer estimates page sizes from page 1.

## Environment notes for agents

`ELECTRON_RUN_AS_NODE=1` and `NoDefaultCurrentDirectoryInExePath=1` are set in the Claude Code/VS Code
environment; another local project uses port 5173. axe helpers live in `e2e/axe.ts`. On Windows
PowerShell 5.1, write commit-message files without a byte-order mark and avoid curly quotes in
PowerShell strings; timings vary with background load — compare against a worktree of the previous
gate (`AGENTS.md` §5).

## Pending for the user

- Rename the local project folder `study-knowledge-base` to `manuscript` (GitHub is already renamed;
  `origin` points at `WilliamKyaww/manuscript`).
- Optional: rename `Documents\Study Knowledge Base` and `%APPDATA%\StudyKnowledgeBase` to `Manuscript`
  while the app is closed (`docs/guide/README.md`).
- Push `main` and the phase branches when convenient (the agent never pushes).

## Open questions for the user

`docs/backlog/research-questions.md` — most important: RQ-01 (workflow), RQ-02 (modules and
assessments — needed for Phase 6), RQ-03 (VLE/recordings), RQ-04 (AI providers and budget), RQ-05
(existing notes to bring in).
