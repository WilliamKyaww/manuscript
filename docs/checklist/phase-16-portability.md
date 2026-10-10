# Phase 16 — Data portability: import, export and backup

**Status:** Complete · **Branch:** `phase/16-portability`

## Objective
Guarantee that no knowledge is hostage to the application: full export and restore, structured-data
exports in open formats, Obsidian in-place compatibility, Graphify graph import, and vault switching.

## Why it exists
Principle 2 ("files over app") and goal G6 (ADR-0004).

## Dependencies
Phase 15.

## Atomic tasks
- [x] **16.01** Full export (zip): notes, sources, `data/*.json` for every canonical table, schema documentation, Anki TSV for cards
- [x] **16.02** Restore a full export into a new vault; round-trip test (export → restore → export is equivalent)
- [x] **16.03** Concepts → Markdown notes export (optional materialisation)
- [x] **16.04** Graph export (JSON node-link, GraphML)
- [x] **16.05** Quizzes and question banks → Markdown/JSON export
- [x] **16.06** Graphify `graph.json` import (code entities as nodes; link to concepts); tests with a Graphify fixture — own tables and `code` graph nodes with computed edges (ADR-0039)
- [x] **16.07** Open an existing Obsidian vault in place; verification that nothing but `id` keys is changed
- [x] **16.08** Vault switching and recent vaults
- [x] **16.09** Settings → Data page (export, import, rebuild index, reveal vault) — "rebuild index" is **Read the files again** (a rescan: a true rebuild would drop ids that live only in the database); "reveal vault" copies the path until the desktop app (Phase 18)
- [x] **16.10** Docs: portability guide (what lives where, how to leave the app); STATE/FEATURES/journal updated

## Acceptance criteria
A user can stop using the app and keep everything in documented, open formats.

## Gate
- [x] All tasks `[x]` · [x] verify + E2E green · [x] docs updated · [x] merged

## Recommended commit messages
```text
feat(server): add full export and restore with open data formats
feat(server): import Graphify graphs for coursework repositories
```
