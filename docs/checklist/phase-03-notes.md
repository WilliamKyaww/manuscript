# Phase 3 — Notes and Markdown knowledge base

**Status:** Complete (8 October 2026) · **Branch:** `phase/03-notes`

## Objective
Markdown notes stored as files in the vault, indexed in SQLite, edited with CodeMirror 6 and rendered
with maths, code and diagrams; wikilinks, tags, backlinks, templates and attachments; external edits
picked up live.

## Why it exists
Answers "What do I know?" at the most basic level and establishes the files-canonical model
(ADR-0004) every later phase builds on.

## Dependencies
Phase 2.

## Atomic tasks

### Markdown core (`@skb/core/markdown`)
- [x] **3.01** Frontmatter split/parse (YAML) and extraction of wikilinks, embeds, tags and heading outline, ignoring code spans/blocks; unit tests with edge cases — `scan.ts` masks code, maths and comments without moving offsets; 22 scan tests (fences, code spans, `$5 and $6`, CRLF + BOM, tables with `\|`, slugs, comment ranges), 15 frontmatter tests
- [x] **3.02** Comment-preserving frontmatter editing (set `id`, update keys); unit tests — minimal text edits from the parser's source ranges: only the edited key's lines change (fixed after the Obsidian check found whole-block reformatting); invalid YAML and flow-style blocks refused

### Index
- [x] **3.03** Migration: `notes`, `note_links`, `note_tags`, `notes_fts` — `0002_notes.sql`, plus `note_aliases` and `attachments`; all derived (data-model.md §5.1)
- [x] **3.04** Vault scanner: walk `.md` files (excluding `.skb/`, `Sources/`, `.obsidian/`, ignore patterns); index new/changed files by mtime + hash; unit tests — links not followed; hidden folders, `.git`, `.trash`, `node_modules` and temp files ignored; gitignore-like user patterns (6 tests); a re-scan skips unchanged files; scans run in chunks and can be stopped
- [x] **3.05** Stable ID assignment on first index (setting); duplicate-ID resolution (copied files get new IDs); unit tests — ids written into files on demand or for every note (`assignIds`, ADR-0025); foreign `id` → `skb-id`; copies get a new id written into the copy only; moves keep ids (persisted id, identical content, case-only renames, app moves, trash restores); 18 indexer tests
- [x] **3.06** Link resolution (notes by file name/title/alias; attachments; unresolved) and re-resolution on create/rename/delete; unit tests — shared `LinkResolver` (relative, root-absolute and suffix paths; same folder first, then shortest path; 11 tests); only links whose target name could be affected are re-resolved
- [x] **3.07** File watcher (chokidar) for external create/change/delete/rename with debouncing and self-write suppression; integration tests — throttled batches; deletions held for a second so renames are recognised; own writes are no-ops by hash; 3 real-file-system tests, run repeatedly without flakiness

### Service and API
- [x] **3.08** Notes service: tree, get (content, metadata, outline), create (optionally from template), update with base-hash conflict detection (`409`), rename/move with optional link rewriting (preview + apply), delete to trash, restore; unit tests — moves of notes, folders and attachments rewrite only links that would break (shortest wikilink, relative Markdown path); trash with manifests, retention and id-keeping restore (4 trash tests)
- [x] **3.09** Notes routes with validation; integration tests — 17 route tests incl. 409 with the current hash, BOM round trip, read-only non-UTF-8 notes, case-only rename, `.skb`/`.obsidian` never served; contracts may declare `201` (repays TD-02)
- [x] **3.10** Templates: list `Templates/`, instantiate with `{{title}}`, `{{date}}`, `{{module}}`, `{{lecture}}`; unit tests — plus `{{time}}` and Moment-style formats in British English; the template's own id removed (5 tests)
- [x] **3.11** Attachments: upload into `Attachments/`, serve with correct content type, embed resolution; integration tests — unique safe names, ranges, ETags, a sandboxing CSP (not for PDFs), 401 without a session
- [x] **3.12** Backlinks and unlinked mentions query; unit tests — backlinks with context lines; whole-word mentions in prose only (4 tests); one-step "link this mention" guarded by the source hash

### UI
- [x] **3.24** Route-level code splitting (TanStack Router lazy routes) and lazy loading of heavy libraries (CodeMirror, KaTeX, Mermaid) before they are added — repays TD-04; the initial bundle must not grow with the editor — initial bundle 625 kB → 466 kB (196 → 148 kB gzip); notes page 480 kB; preview 783 kB loaded when first shown; Mermaid and code-block grammars on demand
- [x] **3.13** Notes page: folder tree with create/rename/move/delete (context menu, keyboard), resizable panes — accessible tree (5 component tests), drag and drop, trash view, `<Page layout="panes">`
- [x] **3.14** CodeMirror 6 editor: Markdown highlighting, wikilink and tag autocompletion, keymaps, `Ctrl+S` + debounced autosave, conflict banner (reload / keep mine / compare) — save session: 8 tests (autosave base hash, 409, keep mine, reload, external edits clean/dirty/deleted, own save ignored, server-added id, BOM, read-only)
- [x] **3.15** Preview renderer: GFM, KaTeX, Mermaid (lazy), code highlighting, wikilinks, embeds, callouts, highlights, tags — plus transclusion, PDF/audio/video, comments removed, currency not maths, sanitised HTML with an allow-list of classes (13 tests)
- [x] **3.16** Edit / preview / split modes; outline panel
- [x] **3.17** Frontmatter properties panel (typed editors for known keys, raw YAML for others)
- [x] **3.18** Backlinks panel (linked with context lines; unlinked mentions with a "link" action)
- [x] **3.19** "New note from template" dialogue — folder, template, module and lecture

### Verification
- [x] **3.20** E2E: create note → link to another → backlink appears; external file edit appears in the open editor; data persists after server restart — `e2e/notes.spec.ts` (7 tests) also covers the conflict path with Compare, rename with link updates, trash and restore, pane headers while scrolling and axe in all three views
- [x] **3.21** Obsidian compatibility check on a sample vault: no file changes other than added `id` keys — `apps/server/test/obsidian-compatibility.test.ts`: no change at all by default; one id line per note with `assignIds: on-index`; links resolve as in Obsidian
- [x] **3.22** Performance: index 10,000 generated notes within the budget (`architecture.md` §14) — `npm run test:perf`: full index 23.6 s (< 60 s), start-up with an index 1.25 s (< 3 s), note open p95 2 ms (< 100 ms)

### Documentation
- [x] **3.23** Markdown dialect reference in `docs/guide/markdown.md`; STATE/FEATURES/journal updated — plus ADR-0025 (note ids), ADR-0026 (dialect differences), PRD updates (data model, link resolution, save flow, panes)

## Tests
3.01–3.12 unit/integration; 3.20–3.22 E2E and performance.

## Acceptance criteria
- [x] Notes survive deletion of `.skb/` (index rebuilds from files) — `apps/server/test/rebuild.test.ts`
- [x] Saving never silently overwrites an external edit — base-hash 409 (route test), session tests, E2E conflict test
- [x] Links resolve as specified in `knowledge-system.md` §3 — resolver tests and the Obsidian check

## Documentation requirements
Markdown guide; ADR if the dialect deviates from Obsidian (ADR-0026).

## Gate
- [x] All tasks `[x]` · [x] `npm run verify` (326 Vitest tests) + `npm run test:e2e` (63 Playwright tests) green · [x] docs updated · [x] merged

## Recommended commit messages
```text
feat(core): add Markdown frontmatter, link and tag extraction
feat(server): index vault notes with links, tags and full-text tables
feat(server): add notes API with conflict detection, trash and templates
feat(web): add CodeMirror note editor with live preview and backlinks
```
