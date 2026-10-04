# Phase 9 — Questions, quizzes and mastery

**Status:** Not started · **Branch:** `phase/09-quizzes-mastery`

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
- [ ] **9.01** Migration: `questions`, `question_concepts`, `quizzes`, `quiz_items`, `quiz_attempts`, `answers`, `mastery_cache`
- [ ] **9.02** Question service + API (per-kind validation); tests
- [ ] **9.03** Automatic grading in `@skb/core` (choice kinds, numeric tolerance, normalised short answers); tests
- [ ] **9.04** Quiz builder (scope, counts, kinds mix, difficulty; mock-exam configuration); tests
- [ ] **9.05** Attempt service (start, answer, self-grade, finish, score; confidence and assisted flags); tests
- [ ] **9.06** Mastery engine in `@skb/core` (formula, stages, confidence, coverage — `learning-system.md` §7); unit and property tests
- [ ] **9.07** Mastery service (evidence gathering, cache invalidation on events, topic/module/course roll-ups: mastery, readiness, coverage); tests
- [ ] **9.08** Weak-area detection (weak, slipping, lapsing, forgotten, no material); tests
- [ ] **9.09** Adaptive practice engine (priority, recognition → recall → production ladder, correct-twice, interleaving); tests
- [ ] **9.10** Question editor UI for each kind
- [ ] **9.11** Practice/quiz UI (inputs per kind, feedback, explanations, source links, self-grading)
- [ ] **9.12** Mock-exam UI (timer, submit, review)
- [ ] **9.13** Progress UI: mastery by module/topic/concept with components; weak areas with actions
- [ ] **9.14** Mastery panel on concept pages; readiness on module pages
- [ ] **9.15** E2E: create questions → quiz → attempt → mastery and explanation update
- [ ] **9.16** Docs: mastery explanation page (formula, thresholds, limitations); STATE/FEATURES/journal updated

## Acceptance criteria
Mastery numbers can be reproduced by hand from the displayed components; weak areas link to practice.

## Gate
- [ ] All tasks `[x]` · [ ] verify + E2E green · [ ] docs updated · [ ] merged

## Recommended commit messages
```text
feat(server): add question bank, quizzes, attempts and grading
feat(core): add transparent mastery model with roll-ups
feat(web): add practice, mock exam and progress views
```
