# Phase 14 — Tutor mode and study planning

**Status:** Not started · **Branch:** `phase/14-tutor-planning`

## Objective
A guardrailed Socratic tutor that ends in retrieval and records assisted answers; misconception checks
against the knowledge base; and a deadline-, weight-, mastery- and FSRS-aware rolling study planner with
exam-aware retention.

## Why it exists
Planning is the largest gap in existing tools and matters most for a final-year workload; tutoring must
avoid the "crutch" effect (learning-science §3).

## Dependencies
Phase 13.

## Atomic tasks
- [ ] **14.01** Tutor mode instructions and guardrails (diagnose → hint ladder → worked solution on request → check question); tests with mock transcripts
- [ ] **14.02** "Quiz me" flow using `record_answer` with the assisted flag; tests — `record_answer` is built here, not in Phase 12 (ADR-0035): answers are append-only evidence and cannot be undone, so it needs a tutor session to attach them to
- [ ] **14.03** Misconception check: explain from my knowledge base and flag where my notes are wrong (as proposals); tests (mock)
- [ ] **14.04** Migration: `study_plans`, `plan_items`; availability settings
- [ ] **14.05** Priority computation in `@skb/core` (`learning-system.md` §9); tests
- [ ] **14.06** Planner: review reservation, coursework blocks, interleaved practice blocks, learn items, mock exams, exam-day retention pass, reasons; deterministic tests
- [ ] **14.07** Exam-aware retention policy (0.93 within 14 days of an exam); tests
- [ ] **14.08** Plan API and planning tools (`get_study_plan`, `create_study_plan`, `update_study_plan`); tests
- [ ] **14.09** Plan UI (week view and list, reasons, done/skip, regenerate)
- [ ] **14.10** Today page: plan items, due reviews, weak areas, deadlines
- [ ] **14.11** Availability and preferences settings UI
- [ ] **14.12** E2E: generate a 7-day plan from fixtures; complete items; re-plan keeps completed items
- [ ] **14.13** Docs: planning guide (how priorities are computed); STATE/FEATURES/journal updated

## Acceptance criteria
Every plan item explains itself; the planner is deterministic for the same inputs and date; tutor
transcripts never open with a full solution.

## Gate
- [ ] All tasks `[x]` · [ ] verify + E2E green · [ ] docs updated · [ ] merged

## Recommended commit messages
```text
feat(server): add guardrailed tutor mode and assisted answer tracking
feat(core): add priority model and rolling study planner
feat(web): add study plan and Today dashboard
```
