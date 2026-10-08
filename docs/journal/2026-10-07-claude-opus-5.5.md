# 7 October 2026 — Claude Opus 5.5

- **Date:** Wednesday 7 October 2026
- **Time:** session 4, evening (commits 22:43–23:40 BST)
- **Agent model:** Claude Opus 5.5 (`claude-opus-5-5`)
- **Phase:** 3 — Notes and Markdown knowledge base (branch `phase/03-notes`)
- **Work performed:** built Phase 3 end to end: the shared Markdown core, the SQLite notes index, the
  file watcher, the notes and vault-entries API, the notes UI (tree, CodeMirror editor, preview,
  panels, dialogues), code splitting, the end-to-end, Obsidian-compatibility and performance checks.

## What was done

1. **Markdown core (`@skb/core/markdown`, 3.01, 3.02, 3.06).** Completed and tested the module drafted
   at the end of 4 October: frontmatter splitting/parsing, a scanner that masks code, maths and
   comments without moving offsets (links, embeds, tags, headings, word count, search text, exact
   target spans for rewriting), an updatable link resolver (relative, root-absolute and suffix paths;
   file name → title → alias → attachment; same folder first, then shortest path), link formatting
   and text edits. Exposed as a subpath so the YAML parser stays out of the initial web bundle.
2. **Contracts.** Notes and vault-entries endpoints, the event stream schema and notes settings in
   `@skb/core`; `defineEndpoint` accepts `status` (repays TD-02).
3. **Index (3.03–3.06).** Migration `0002_notes` (notes, aliases, tags, links with context lines,
   attachments, FTS5). The indexer reconciles by size/mtime then content hash, runs scans in chunks
   (stoppable), keeps ids across moves (persisted id, identical content, case-only renames, app
   moves, trash restores), gives copies new ids and re-resolves only links whose target name could
   be affected. Ids are written into files only on demand or when configured (ADR-0025).
4. **Watcher (3.07).** chokidar, throttled batches, deletions held for a second so renames are seen as
   moves; own writes are recognised by hash.
5. **Service and API (3.08–3.12).** Tree, read (re-indexing changed files first), create (safe unique
   names, templates, course fields), save with base-hash conflicts, moves/renames with a link-rewrite
   preview, folders, trash with manifests and restore, templates, backlinks, unlinked mentions,
   "link this mention", tags, attachment upload and authenticated file serving (ranges, ETags,
   sandboxing CSP), notes settings and server-sent events.
6. **UI (3.13–3.19, 3.24).** Lazy routes; `<Page layout="panes">` and `<Pane>`; an accessible file
   tree with context menu and drag and drop; the CodeMirror editor with completions and a save
   session (autosave, Ctrl+S, conflict banner with Compare, quiet reload, BOM/CRLF kept, server
   edits applied on top of typing); the preview (GFM, KaTeX, highlight.js, lazy Mermaid, wikilinks,
   transclusion, file embeds, callouts, highlights, tags, sanitised HTML); outline, backlinks and
   properties panels; new-note, new-folder, link-rewrite, trash and trash-view dialogues;
   Settings › Notes.
7. **Verification (3.20–3.22).** `e2e/notes.spec.ts`, `apps/server/test/obsidian-compatibility.test.ts`
   and `npm run test:perf` (10,000 notes).

## Important decisions

- **ADR-0025** — note ids are written into files only when needed (default), or into every note by
  setting; a foreign `id` is kept and `skb-id` used.
- **ADR-0026** — Obsidian-compatible dialect with recorded differences (title as a link target,
  same-folder preference, no remote images, block references point at the note).
- Self-write suppression by content hash instead of write tokens (simpler, idempotent).
- Unresolved links in the preview are buttons that create the note (an action, not a link).
- An npm override pins KaTeX to 0.19.0 (TD-05) — npm audit now reports no vulnerabilities.

## Files changed

`packages/core/src/markdown/*`, `packages/core/src/api/{notes,vault,contract}.ts`, `errors.ts`;
`apps/server/src/db/migrations/0002_notes.sql`, `src/modules/{notes,settings,events}/**`,
`src/modules/index.ts`, `src/shared/events.ts`, `src/vault/move.ts`, `app.ts`, `server.ts`,
`context.ts`, `http/{endpoint,problem}.ts`; `apps/server/test/{notes-helpers,obsidian-compatibility.test,
fixtures/obsidian-vault}.ts`, `test/perf/notes-perf.ts`; `apps/web/src/features/notes/**`,
`features/settings/NotesSettingsSection.tsx`, `features/errors/PagePending.tsx`,
`components/{Pane,ContextMenu,Page}.tsx`, `lib/{events,diff,format}.ts`, `lib/api/client.ts`,
`app/AppShell.tsx`, `router.tsx`; `e2e/{notes,shell}.spec.ts`; package manifests and lockfile.

## Tests run

| Command | Result |
|---|---|
| `npx vitest run` (during the session) | **Pass** — 325 tests by the end of the evening |
| `npx playwright test` | **Pass** — 62, then 63 with the trash test |
| `npm run verify` | **Pass** — type-check, Biome, tests, build, smoke |
| `npm run test:perf` | **Pass** — full index 23.6 s, start-up 1.25 s, note open p95 2 ms |
| Watcher tests run four times in a row | **Pass** each time (no flakiness seen) |

## Problems encountered

- **Renames split across watcher batches.** chokidar delays `add` until a write settles but reports
  `unlink` at once, so a rename looked like delete + create and the note lost its id. Fixed by holding
  deletions for a second.
- **Move planner bug (found by E2E).** A note titled by its file name keeps its old title in the
  simulated post-move resolver, so `[[Old name]]` seemed to still resolve and was not rewritten.
- **YAML re-serialisation (found by the Obsidian check).** The "comment-preserving" library rewrote
  `[a, b]` as `[ a, b ]` and re-indented lists when one key was added. Replaced by minimal text
  edits based on source ranges.
- **Sanitiser stripped our classes.** GitHub's schema restricts `className` per element; replaced with
  an explicit allow-list of class prefixes on every element.
- **Windows tooling.** Python wrote CRLF files; shell here-documents swallowed backslashes in generated
  code. Both recorded in `AGENTS.md` §5.
- **KaTeX duplicates** with a low-severity advisory under rehype-katex, micromark-extension-math and
  Mermaid → npm override (TD-05).

## Unresolved issues

- TD-01, TD-05, TD-06; backlog B-KM-09…13 (remote images setting, block references, task toggles,
  split-view scroll sync, restoring a removed id).

## Next steps

Finish 3.23 (guide, ADRs, PRD updates), check the remaining acceptance criterion (deleting `.skb/`),
run the gate and merge Phase 3.
