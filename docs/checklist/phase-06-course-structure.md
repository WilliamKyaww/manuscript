# Phase 6 — Course structure and concepts

**Status:** Not started · **Branch:** `phase/06-course-structure`

## Objective
Model courses, modules, lectures, topics, assessments and concepts; link sources and notes to lectures;
resolve wikilinks to concepts; provide a mark calculator against the 85 % goal.

## Why it exists
The learning system needs structure (what belongs to which module, what is assessed when and with what
weight) and a concept model shared by knowledge and learning (ADR-0020).

## Dependencies
Phase 5 (lecture ↔ source links).

## Atomic tasks
- [ ] **6.01** Migration: `courses`, `modules`, `lectures`, `lecture_sources`, `lecture_notes`, `topics`, `assessments`, `concepts`, `concept_aliases`, `concept_topics`, `concept_modules`
- [ ] **6.02** Course and module service + API (CRUD; unique module codes); tests
- [ ] **6.03** Lecture service + API (CRUD; unique key per module; attach/detach sources and notes); tests
- [ ] **6.04** Topic service + API (hierarchy, ordering); tests
- [ ] **6.05** Assessment service + API (weights ≤ 100 % per module validated; achieved marks); tests
- [ ] **6.06** Mark calculator in `@skb/core` (module mark, required marks for a target, credit-weighted average); unit tests
- [ ] **6.07** Concept service + API (CRUD, aliases, module/topic membership, slugs, case-folded uniqueness); tests
- [ ] **6.08** Wikilink resolution to concepts; "create concept from unresolved link"; tests
- [ ] **6.09** Note frontmatter (`module`, `lecture`) ↔ lecture/module association sync (frontmatter wins); tests
- [ ] **6.10** Modules UI: list, create/edit (code, title, credits, semester, colour, target mark)
- [ ] **6.11** Module page: lectures timeline, topics and concepts, assessments with mark calculator, sources and notes
- [ ] **6.12** Lecture page: sources, notes (create lecture note from template), concepts
- [ ] **6.13** Concepts index and concept page (summary, aliases, mentioning notes, covering sources)
- [ ] **6.14** Today page: deadlines widget and progress towards the target average
- [ ] **6.15** E2E: create module → lecture → attach source → create concept from an unresolved link → assessment and calculator
- [ ] **6.16** Docs: course setup guide; STATE/FEATURES/journal updated

## Acceptance criteria
A semester's modules, lectures and assessments can be entered in minutes; the mark calculator matches
hand calculations; wikilinks to concepts resolve.

## Gate
- [ ] All tasks `[x]` · [ ] verify + E2E green · [ ] docs updated · [ ] merged

## Recommended commit messages
```text
feat(server): add modules, lectures, topics, assessments and concepts
feat(core): add mark calculator for module and year targets
feat(web): add module, lecture and concept pages
```
