# Phase 9 — Questions, quizzes and mastery

**Status:** Complete (9 October 2026) · **Branch:** `phase/09-quizzes-mastery`

## Objective
Question bank (MCQ, multi-select, true/false, numeric, short, explain, derivation, code), practice
quizzes, timed mock exams, adaptive practice sessions, and the transparent mastery model with roll-ups
and weak-area detection.

## Why it exists
Testing beyond flashcards (explanation, problem solving) and an honest picture of readiness per module
(ADR-0021).

## Dependencies
Phase 8.

## Atomic tasks
- [x] **9.01** Migration: `questions`, `question_concepts`, `quizzes`, `quiz_items`, `quiz_attempts`, `answers`, `mastery_cache` — `0009`; answers append-only by trigger except grading a pending answer once (tested); questions and quizzes deleted softly; attempts keep a deadline and a mock exam's draft (ADR-0032)
- [x] **9.02** Question service + API (per-kind validation); tests — the kind is the key's kind; one right option for multiple choice, at least one for multi-select, distinct option ids; places, tags and concepts checked
- [x] **9.03** Automatic grading in `@skb/core` (choice kinds, numeric tolerance, normalised short answers); tests — multi-select credit less wrong picks; absolute and relative tolerance with a floating-point margin; short answers that match nothing wait for a self-grade
- [x] **9.04** Quiz builder (scope, counts, kinds mix, difficulty; mock-exam configuration); tests — module, lectures, topics with subtopics, concepts and tags narrow the choice; a seeded shuffle makes quizzes reproducible; mock exams timed like their assessment and ordered recognition first; live match count; Markdown export; retakes
- [x] **9.05** Attempt service (start, answer, self-grade, finish, score; confidence and assisted flags); tests — one answer per question per attempt; mock exams answered only by submission (blanks 0); late answers refused after the deadline's grace; study sessions recorded
- [x] **9.06** Mastery engine in `@skb/core` (formula, stages, confidence, coverage — `learning-system.md` §7); unit and property tests — a hand-worked example and 200 random cases within 0–1; roll-ups separate mastery of practised material from readiness
- [x] **9.07** Mastery service (evidence gathering, cache invalidation on events, topic/module/course roll-ups: mastery, readiness, coverage); tests — one pass over all evidence (201 ms for a year of learning; budget 500 ms), stale after reviews, answers, links and data events or 15 minutes; answer ages in whole review days
- [x] **9.08** Weak-area detection (weak, slipping, lapsing, forgotten, no material); tests — each with its reason; priority from gap, stake, urgency and importance with documented defaults
- [x] **9.09** Adaptive practice engine (priority, recognition → recall → production ladder, correct-twice, interleaving); tests — replayed from answers with a seed; never three in a row for one concept while others wait; Learn asks questions only (cards in Learn: B-LE-24)
- [x] **9.10** Question editor UI for each kind — options with reasons, true/false, numeric with unit and tolerance, accepted short answers, model answers and rubrics; hint, difficulty, module, lecture, tags, concepts; the question bank page
- [x] **9.11** Practice/quiz UI (inputs per kind, feedback, explanations, source links, self-grading) — plus confidence, hints that mark answers as helped, Enter / Ctrl+Enter, results with retake
- [x] **9.12** Mock-exam UI (timer, submit, review) — every question on one page, drafts saved as you go, automatic submission at zero, results with self-grading
- [x] **9.13** Progress UI: mastery by module/topic/concept with components; weak areas with actions — every concept's sentence, sum and priority; Practise starts a Learn session; concepts without material offer a question; Today's Weak areas widget
- [x] **9.14** Mastery panel on concept pages; readiness on module pages — with the answers that count and their weights today; Learn from the module page
- [x] **9.15** E2E: create questions → quiz → attempt → mastery and explanation update — `e2e/practice.spec.ts` on its own server (port 4396), then a Learn session; axe on Practice, an attempt, Progress and Learn; the question bank in the shell's checks
- [x] **9.16** Docs: mastery explanation page (formula, thresholds, limitations); STATE/FEATURES/journal updated — `docs/guide/mastery.md` and `docs/guide/practice.md`; ADR-0032; learning-system, data-model, architecture and ui PRDs; backlog B-LE-24…32

## Acceptance criteria
- [x] Mastery numbers can be reproduced by hand from the displayed components — the concept page and Progress show the sentence and the sum with the concept's own numbers (`mastery = (0.00 × 0 + 1.5 × 0.75 × 2.00) / (0 + 1.5 × 2.00) = 0.75` in the E2E test) and every answer's weight today
- [x] Weak areas link to practice — Practise on Today, Progress and concept pages starts a Learn session for the concept; concepts without material offer to write a question

## Gate
- [x] All tasks `[x]` · [x] verify (574 Vitest tests) + E2E (76 Playwright tests) green · [x] docs updated · [x] merged

## Recommended commit messages
```text
feat(server): add question bank, quizzes, attempts and grading
feat(core): add transparent mastery model with roll-ups
feat(web): add practice, mock exam and progress views
```
