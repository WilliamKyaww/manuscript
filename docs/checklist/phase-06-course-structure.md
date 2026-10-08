# Phase 6 — Course structure and concepts

**Status:** Complete (9 October 2026) · **Branch:** `phase/06-course-structure`

## Objective
Model courses, modules, lectures, topics, assessments and concepts; link sources and notes to lectures;
resolve wikilinks to concepts; provide a mark calculator against the 85 % goal.

## Why it exists
The learning system needs structure (what belongs to which module, what is assessed when and with what
weight) and a concept model shared by knowledge and learning (ADR-0020).

## Dependencies
Phase 5 (lecture ↔ source links).

## Atomic tasks
- [x] **6.01** Migration: `courses`, `modules`, `lectures`, `lecture_sources`, `lecture_notes`, `topics`, `assessments`, `concepts`, `concept_aliases`, `concept_topics`, `concept_modules` — `0006_course_structure.sql`; **no `lecture_notes` table**: a note's lecture is read from its frontmatter (ADR-0029); `note_links` rebuilt with `target_concept`
- [x] **6.02** Course and module service + API (CRUD; unique module codes); tests — codes unique whatever the capitals (409); a code change is refused while notes or sources use it; archived modules still count towards their course
- [x] **6.03** Lecture service + API (CRUD; unique key per module; attach/detach sources and notes); tests — attaching a note writes its `module` and `lecture` properties, detaching removes `lecture`; a key change is refused while notes use it
- [x] **6.04** Topic service + API (hierarchy, ordering); tests — parents in the same module, no cycles, subtopics deleted with their parent, ordered by `ordinal` (new topics last)
- [x] **6.05** Assessment service + API (weights ≤ 100 % per module validated; achieved marks); tests — "would add up to 110 %" refused; a mark sets *marked*, clearing it reopens; submitted work leaves the deadlines; `/api/deadlines?days=`
- [x] **6.06** Mark calculator in `@skb/core` (module mark, required marks for a target, credit-weighted average); unit tests — `learning/marks.ts`: secured, average so far, best possible, unassigned weight as still to come; checked against hand calculations
- [x] **6.07** Concept service + API (CRUD, aliases, module/topic membership, slugs, case-folded uniqueness); tests — names and aliases share one namespace; unique slugs; a backing note gets its id written
- [x] **6.08** Wikilink resolution to concepts; "create concept from unresolved link"; tests — notes first, then concepts, then attachments (`LinkResolver`); links follow renames, alias changes and deletion, and survive an index rebuild and a restart; the preview's menu on an unresolved link creates a note or a concept
- [x] **6.09** Note frontmatter (`module`, `lecture`) ↔ lecture/module association sync (frontmatter wins); tests — the association *is* the frontmatter (`COC251/L03`, or `L03` with `module`), so a note edited elsewhere moves at once; the app's attach/detach edits only those keys
- [x] **6.10** Modules UI: list, create/edit (code, title, credits, semester, colour, target mark) — grouped by course with the credit-weighted course average, the next deadline per module, an archived section; course create/edit
- [x] **6.11** Module page: lectures timeline, topics and concepts, assessments with mark calculator, sources and notes — lectures in order with week and date; topic tree; assessments with inline marks, edit and the calculator; `Sources/<code>/` files and `module:` notes; concepts with quick add
- [x] **6.12** Lecture page: sources, notes (create lecture note from template), concepts — attach library sources, attach existing notes by title, "New lecture note" (optionally from a template) in `Modules/<code>/`; concepts linked from its notes
- [x] **6.13** Concepts index and concept page (summary, aliases, mentioning notes, covering sources) — filter by name, alias or module; mentions with their lines; source passages that open at the page or slide
- [x] **6.14** Today page: deadlines widget and progress towards the target average — next fortnight's planned work with days left and weight; the current course's average and requirement
- [x] **6.15** E2E: create module → lecture → attach source → create concept from an unresolved link → assessment and calculator — `e2e/course.spec.ts` (with the sticky header while the module page scrolls and axe on the module and concept pages); Modules and Concepts in the shell's sticky-header and axe checks
- [x] **6.16** Docs: course setup guide; STATE/FEATURES/journal updated — `docs/guide/course.md`; Markdown and sources guides, data model, ADR-0029, backlog B-LE-11…17

## Acceptance criteria
- [x] A semester's modules, lectures and assessments can be entered in minutes — one dialogue each, the next lecture key suggested, marks typed straight into the table; the E2E enters a module, two assessments and a lecture through the dialogues, and a two-module course (four assessments, three lectures, topics, a concept) was checked by screenshot
- [x] The mark calculator matches hand calculations — unit tests (e.g. 40 % at 78 → secured 31.2, 81.3 % needed for 80) and the API test of a two-module course
- [x] Wikilinks to concepts resolve — resolver, indexer, API and E2E tests

## Gate
- [x] All tasks `[x]` · [x] verify (452 Vitest tests) + E2E (73 Playwright tests) green · [x] docs updated · [x] merged

## Recommended commit messages
```text
feat(server): add modules, lectures, topics, assessments and concepts
feat(core): add mark calculator for module and year targets
feat(web): add module, lecture and concept pages
```
