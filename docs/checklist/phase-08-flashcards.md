# Phase 8 — Flashcards and spaced repetition

**Status:** Complete (9 October 2026) · **Branch:** `phase/08-flashcards`

## Objective
Basic, reversed and cloze flashcards linked to concepts and sources, scheduled with FSRS-6, reviewed in
a fast keyboard-driven session, with statistics and Anki interoperability.

## Why it exists
Spaced retrieval practice is the highest-utility study technique (learning-science §1; ADR-0011).

## Dependencies
Phase 6 (concepts, modules, lectures).

## Atomic tasks
- [x] **8.01** Migration: `card_sets`, `cards`, `card_concepts`, `card_schedules`, `review_logs`, `study_sessions` — `0008_flashcards.sql`; one schedule per card face (ADR-0031); review logs append-only by trigger
- [x] **8.02** FSRS wrapper in `@skb/core` (configuration, interval previews, apply rating, retrievability, undo from log); deterministic tests with fixed dates — `learning/fsrs.ts` over ts-fsrs 5.4.2; checked rating by rating against ts-fsrs itself; undo restores the schedule stored in the log (ADR-0031)
- [x] **8.03** Card service + API (CRUD, kinds incl. cloze expansion, status, concept links, locators); tests — faces follow kind and cloze numbers (removed numbers retired with their history, restored when they return); cloze cards need a gap; bulk actions
- [x] **8.04** Review queue (due learning/relearning → due reviews by lowest retrievability → new within limits; bury); tests — new faces taken from sets in turn; learning faces due within 20 minutes shown early; days from 04:00; per-set and per-module queues
- [x] **8.05** Review service (rate → schedule + log in one transaction; undo last; sessions); tests — undo writes an `undo` row and restores exactly; sessions with summaries
- [x] **8.06** Card sets UI (by module/lecture; create; list cards; bulk suspend/move/delete) — `/review` and set pages; also bulk activate
- [x] **8.07** Card editor (Markdown + KaTeX preview, cloze helper, concept picker, quality hints) — Cloze button and Ctrl+Shift+C; drafts; actions in the dialogue footer
- [x] **8.08** Quick-add card (`Ctrl+Shift+A`) and "make card from selection" in notes and the source viewer — plus the command palette; locators back to the note's line or the source's page, slide or section
- [x] **8.09** Review session UI (`Space`, `1`–`4` with intervals, `Ctrl+Z`, `E`, `S`, `B`, `O`, focus mode) — also `Enter` and `F`; keys act only when they apply, so focused buttons keep working
- [x] **8.10** Session summary and review statistics (due forecast, reviews per day, true retention) — Review page charts readable as text; the Today widget with a time estimate
- [x] **8.11** Anki-compatible TSV/CSV import and export; round-trip tests — Anki's notes-in-plain-text format (headers, quoting, HTML to text); round trip in core and through the API
- [x] **8.12** Settings: desired retention, daily limits, learning steps — plus longest interval and fuzz; validated on the server
- [x] **8.13** E2E: create cards → review → schedule persists across restart → undo restores — `e2e/review.spec.ts` on a server of its own; axe on the set page and the session; Review in the shell's sticky-header and axe checks
- [x] **8.14** Docs: flashcards guide (card writing rules, FSRS settings); STATE/FEATURES/journal updated — `docs/guide/flashcards.md`; data model, learning-system PRD, ui.md, ADR-0031, backlog B-LE-18…23

## Acceptance criteria
- [x] Scheduling matches ts-fsrs reference outputs — `fsrs.test.ts` compares due dates review by review with ts-fsrs called directly
- [x] Review logs are append-only — triggers refuse updates and deletes (tested); undo is a new row
- [x] A 100-card session is fully keyboard-operable with < 50 ms between cards — measured in Chromium on mains power: median 7 ms, p95 10 ms, max 48 ms (the refill) from the rating key to the next card

## Gate
- [x] All tasks `[x]` · [x] verify (523 Vitest tests) + E2E (75 Playwright tests) green · [x] docs updated · [x] merged

## Recommended commit messages
```text
feat(core): wrap ts-fsrs scheduling with deterministic previews and undo
feat(server): add flashcards, review queue and review logs
feat(web): add card editor and keyboard review session
```
