# Phase 16 — Data portability: import, export and backup

**Status:** Not started · **Branch:** `phase/16-portability`

## Objective
Guarantee that no knowledge is hostage to the application: full export and restore, structured-data
exports in open formats, Obsidian in-place compatibility, Graphify graph import, and vault switching.

## Why it exists
Principle 2 ("files over app") and goal G6 (ADR-0004).

## Dependencies
Phase 15.

## Atomic tasks
- [ ] **16.01** Full export (zip): notes, sources, `data/*.json` for every canonical table, schema documentation, Anki TSV for cards
- [ ] **16.02** Restore a full export into a new vault; round-trip test (export → restore → export is equivalent)
- [ ] **16.03** Concepts → Markdown notes export (optional materialisation)
- [ ] **16.04** Graph export (JSON node-link, GraphML)
- [ ] **16.05** Quizzes and question banks → Markdown/JSON export
- [ ] **16.06** Graphify `graph.json` import (code entities as nodes; link to concepts); tests with a Graphify fixture
- [ ] **16.07** Open an existing Obsidian vault in place; verification that nothing but `id` keys is changed
- [ ] **16.08** Vault switching and recent vaults
- [ ] **16.09** Settings → Data page (export, import, rebuild index, reveal vault)
- [ ] **16.10** Docs: portability guide (what lives where, how to leave the app); STATE/FEATURES/journal updated

## Acceptance criteria
A user can stop using the app and keep everything in documented, open formats.

## Gate
- [ ] All tasks `[x]` · [ ] verify + E2E green · [ ] docs updated · [ ] merged

## Recommended commit messages
```text
feat(server): add full export and restore with open data formats
feat(server): import Graphify graphs for coursework repositories
```
