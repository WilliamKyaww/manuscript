# State — Manuscript

_Last updated: 8 October 2026 — Claude Opus 5.5._

## Current phase

**Phase 4 — Lexical search and quick navigation: next.** Phases 0 (research), 1 (foundation),
2 (application shell) and 3 (notes and Markdown knowledge base) are complete and merged into `main`.

## What works

- **Local server** (`apps/server`): Hono on `127.0.0.1` with token (cookie or bearer), Host allowlist,
  Origin and Fetch-Metadata checks; `/auth` sign-in link; RFC 9457 problem details (with `details`);
  CSP and security headers; production SPA serving; server-sent events at `/api/events`.
- **Storage:** `node:sqlite` adapter, checksummed migrations (`0001_init`, `0002_notes`), vault (`.skb/`
  layout, lock with crash recovery, strict path containment), atomic writes, vault-scoped settings.
- **Notes** (Phase 3): Markdown files are canonical. The index (notes, aliases, tags, links with
  context, attachments, FTS5 table) is rebuilt from the files; a chokidar watcher picks up edits made
  in other programs within about a second. Ids are written into files only when needed (ADR-0025).
  API: tree, read, create (templates), save with base-hash conflicts (409), backlinks, unlinked
  mentions and "link this mention", tags, folders, moves/renames with link-rewrite preview, trash with
  restore, attachment upload and file serving, notes settings.
- **Notes UI:** accessible file tree (keyboard, context menu, drag and drop), CodeMirror 6 editor
  (completions, autosave, Ctrl+S, conflict banner with Compare), preview (GFM, KaTeX, highlight.js,
  lazy Mermaid, wikilinks, transclusion, PDF/audio/video embeds, callouts, sanitised HTML), edit /
  split / preview, outline, backlinks, properties, new-note and trash dialogues, Settings › Notes.
- **Application shell:** sidebar, sticky page headers (per pane on paned pages), themes, command
  palette (`Ctrl+K`), shortcuts (`?`), session gate, toasts; every page is its own code chunk.
- **Commands:** `npm run dev`, `npm run build`, `npm start`, `npm run verify`, `npm run test:e2e`,
  `npm run test:perf` (10,000 notes), **`run-web.bat`**.
- **Tests:** 326 Vitest tests and 63 Playwright tests (incl. sticky headers on every route and pane,
  axe in both themes and all note views, an Obsidian-compatibility check) — all green. Performance:
  10,000 notes index in 23.6 s, start-up with an index 1.25 s, note open p95 2 ms.

## In progress

- Nothing; Phase 4 not yet started.

## Incomplete / not started

- Phases 4–22. Search, sources, learning and AI features do not exist yet; their sections show
  placeholders. Block references open the note but do not scroll to the block (B-KM-10).

## Broken

- Nothing known.

## Next steps

1. Create `phase/04-search` from `main`.
2. Phase 4: FTS5 search over the `notes_fts` table built in Phase 3 (BM25 weights, snippets, filters,
   operators), the quick switcher (`Ctrl+O`) and search from the command palette.

## Relevant decisions

ADR-0004 hybrid storage (Markdown canonical) · ADR-0005 localhost security · ADR-0006 `node:sqlite` ·
ADR-0007 plain SQL + prefixed ULIDs · ADR-0009 CodeMirror 6 + unified · ADR-0018 frontend stack ·
ADR-0023 git workflow (no AI trailers) · ADR-0024 shared Zod API contracts · **ADR-0025** note ids
written only when needed · **ADR-0026** Obsidian-compatible dialect with recorded differences · **ADR-0027** the product is called
Manuscript (internal identifiers keep `skb`).

## Technical debt

TD-01 launcher duplicates the data-directory logic · TD-05 npm override pins KaTeX 0.19 for three
packages · TD-06 the file tree is not virtualised. TD-02, TD-03 and TD-04 repaid.

## Environment notes for agents

`ELECTRON_RUN_AS_NODE=1` and `NoDefaultCurrentDirectoryInExePath=1` are set in the Claude Code/VS Code
environment; another local project uses port 5173 (see `AGENTS.md` §5). axe checks colour contrast
only inside the viewport (`fitViewportToContent` in `e2e/shell.spec.ts`). Scripts that write files on
Windows must write LF line endings, and shell here-documents may swallow backslashes — prefer the
editor tools for code containing escapes (`AGENTS.md` §5).

## Pending for the user

- Rename the local project folder `study-knowledge-base` to `manuscript` (GitHub is already renamed;
  `origin` points at `WilliamKyaww/manuscript`).
- Optional: rename `Documents\Study Knowledge Base` and `%APPDATA%\StudyKnowledgeBase` to `Manuscript`
  while the app is closed (`docs/guide/README.md`).

## Open questions for the user

`docs/backlog/research-questions.md` — most important: RQ-01 (workflow), RQ-02 (modules and
assessments), RQ-03 (VLE/recordings), RQ-04 (AI providers and budget), RQ-05 (existing notes to bring
in — the app can now open an Obsidian vault in place).
