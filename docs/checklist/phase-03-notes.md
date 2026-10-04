# Phase 3 — Notes and Markdown knowledge base

**Status:** Not started · **Branch:** `phase/03-notes`

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
- [ ] **3.01** Frontmatter split/parse (YAML) and extraction of wikilinks, embeds, tags and heading outline, ignoring code spans/blocks; unit tests with edge cases
- [ ] **3.02** Comment-preserving frontmatter editing (set `id`, update keys); unit tests

### Index
- [ ] **3.03** Migration: `notes`, `note_links`, `note_tags`, `notes_fts`
- [ ] **3.04** Vault scanner: walk `.md` files (excluding `.skb/`, `Sources/`, `.obsidian/`, ignore patterns); index new/changed files by mtime + hash; unit tests
- [ ] **3.05** Stable ID assignment on first index (setting); duplicate-ID resolution (copied files get new IDs); unit tests
- [ ] **3.06** Link resolution (notes by file name/title/alias; attachments; unresolved) and re-resolution on create/rename/delete; unit tests
- [ ] **3.07** File watcher (chokidar) for external create/change/delete/rename with debouncing and self-write suppression; integration tests

### Service and API
- [ ] **3.08** Notes service: tree, get (content, metadata, outline), create (optionally from template), update with base-hash conflict detection (`409`), rename/move with optional link rewriting (preview + apply), delete to trash, restore; unit tests
- [ ] **3.09** Notes routes with validation; integration tests
- [ ] **3.10** Templates: list `Templates/`, instantiate with `{{title}}`, `{{date}}`, `{{module}}`, `{{lecture}}`; unit tests
- [ ] **3.11** Attachments: upload into `Attachments/`, serve with correct content type, embed resolution; integration tests
- [ ] **3.12** Backlinks and unlinked mentions query; unit tests

### UI
- [ ] **3.13** Notes page: folder tree with create/rename/move/delete (context menu, keyboard), resizable panes
- [ ] **3.14** CodeMirror 6 editor: Markdown highlighting, wikilink and tag autocompletion, keymaps, `Ctrl+S` + debounced autosave, conflict banner (reload / keep mine / compare)
- [ ] **3.15** Preview renderer: GFM, KaTeX, Mermaid (lazy), code highlighting, wikilinks, embeds, callouts, highlights, tags
- [ ] **3.16** Edit / preview / split modes; outline panel
- [ ] **3.17** Frontmatter properties panel (typed editors for known keys, raw YAML for others)
- [ ] **3.18** Backlinks panel (linked with context lines; unlinked mentions with a "link" action)
- [ ] **3.19** "New note from template" dialogue

### Verification
- [ ] **3.20** E2E: create note → link to another → backlink appears; external file edit appears in the open editor; data persists after server restart
- [ ] **3.21** Obsidian compatibility check on a sample vault: no file changes other than added `id` keys
- [ ] **3.22** Performance: index 10,000 generated notes within the budget (`architecture.md` §14)

### Documentation
- [ ] **3.23** Markdown dialect reference in `docs/guide/markdown.md`; STATE/FEATURES/journal updated

## Tests
3.01–3.12 unit/integration; 3.20–3.22 E2E and performance.

## Acceptance criteria
- Notes survive deletion of `.skb/` (index rebuilds from files).
- Saving never silently overwrites an external edit.
- Links resolve as specified in `knowledge-system.md` §3.

## Documentation requirements
Markdown guide; ADR if the dialect deviates from Obsidian.

## Gate
- [ ] All tasks `[x]` · [ ] `npm run verify` + `npm run test:e2e` green · [ ] docs updated · [ ] merged

## Recommended commit messages
```text
feat(core): add Markdown frontmatter, link and tag extraction
feat(server): index vault notes with links, tags and full-text tables
feat(server): add notes API with conflict detection, trash and templates
feat(web): add CodeMirror note editor with live preview and backlinks
```
