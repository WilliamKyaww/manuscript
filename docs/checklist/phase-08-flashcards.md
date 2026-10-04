# Phase 8 — Flashcards and spaced repetition

**Status:** Not started · **Branch:** `phase/08-flashcards`

## Objective
Basic, reversed and cloze flashcards linked to concepts and sources, scheduled with FSRS-6, reviewed in
a fast keyboard-driven session, with statistics and Anki interoperability.

## Why it exists
Spaced retrieval practice is the highest-utility study technique (learning-science §1; ADR-0011).

## Dependencies
Phase 6 (concepts, modules, lectures).

## Atomic tasks
- [ ] **8.01** Migration: `card_sets`, `cards`, `card_concepts`, `card_schedules`, `review_logs`, `study_sessions`
- [ ] **8.02** FSRS wrapper in `@skb/core` (configuration, interval previews, apply rating, retrievability, undo from log); deterministic tests with fixed dates
- [ ] **8.03** Card service + API (CRUD, kinds incl. cloze expansion, status, concept links, locators); tests
- [ ] **8.04** Review queue (due learning/relearning → due reviews by lowest retrievability → new within limits; bury); tests
- [ ] **8.05** Review service (rate → schedule + log in one transaction; undo last; sessions); tests
- [ ] **8.06** Card sets UI (by module/lecture; create; list cards; bulk suspend/move/delete)
- [ ] **8.07** Card editor (Markdown + KaTeX preview, cloze helper, concept picker, quality hints)
- [ ] **8.08** Quick-add card (`Ctrl+Shift+A`) and "make card from selection" in notes and the source viewer
- [ ] **8.09** Review session UI (`Space`, `1`–`4` with intervals, `Ctrl+Z`, `E`, `S`, `B`, `O`, focus mode)
- [ ] **8.10** Session summary and review statistics (due forecast, reviews per day, true retention)
- [ ] **8.11** Anki-compatible TSV/CSV import and export; round-trip tests
- [ ] **8.12** Settings: desired retention, daily limits, learning steps
- [ ] **8.13** E2E: create cards → review → schedule persists across restart → undo restores
- [ ] **8.14** Docs: flashcards guide (card writing rules, FSRS settings); STATE/FEATURES/journal updated

## Acceptance criteria
Scheduling matches ts-fsrs reference outputs; review logs are append-only; a 100-card session is fully
keyboard-operable with < 50 ms between cards.

## Gate
- [ ] All tasks `[x]` · [ ] verify + E2E green · [ ] docs updated · [ ] merged

## Recommended commit messages
```text
feat(core): wrap ts-fsrs scheduling with deterministic previews and undo
feat(server): add flashcards, review queue and review logs
feat(web): add card editor and keyboard review session
```
