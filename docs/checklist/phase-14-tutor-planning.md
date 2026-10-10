# Phase 14 — Tutor mode and study planning

**Status:** Complete · **Branch:** `phase/14-tutor-planning`

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
- [x] **14.01** Tutor mode instructions and guardrails (diagnose → hint ladder → worked solution on request → check question); tests with mock transcripts — `tutorGuidance` (core) decides the rung from the conversation and the server adds it to the instructions; a guard logs a reply that breaks its step; tested with mock transcripts (`tutor.test.ts`, core and server)
- [x] **14.02** "Quiz me" flow using `record_answer` with the assisted flag; tests — `record_answer` is built here, not in Phase 12 (ADR-0035): answers are append-only evidence and cannot be undone, so it needs a tutor session to attach them to — `get_questions` (prompts only) and `record_answer`, a *permanent* write that always asks and may be approved for the chat (ADR-0037); assisted evidence in a hidden per-thread quiz
- [x] **14.03** Misconception check: explain from my knowledge base and flag where my notes are wrong (as proposals); tests (mock) — `propose_note_correction`: the exact wrong words, the fix and the lecture quote (verified) become an Inbox suggestion of the new kind `correction`; the note changes only on acceptance
- [x] **14.04** Migration: `study_plans`, `plan_items`; availability settings — migration `0014` (`study_plans`, `plan_items`, `tutor_sessions`, `assessments.remaining_hours`, wider proposals CHECK); availability in `/api/settings/plan`
- [x] **14.05** Priority computation in `@skb/core` (`learning-system.md` §9); tests — the Phase 9 priority (`priority.ts`) feeds the planner; each block's reason is built from its figures; tested in `planner.test.ts`
- [x] **14.06** Planner: review reservation, coursework blocks, interleaved practice blocks, learn items, mock exams, exam-day retention pass, reasons; deterministic tests — `planStudy` in core: reviews, mock exams, retention pass, coursework, learn items, practice; pure and deterministic; reasons; what does not fit is reported
- [x] **14.07** Exam-aware retention policy (0.93 within 14 days of an exam); tests — `examAwareRetention`: 0.93 within 14 days of an exam or test, applied when a card is rated and previewed; switchable
- [x] **14.08** Plan API and planning tools (`get_study_plan`, `create_study_plan`, `update_study_plan`); tests — `/api/plan`, `/api/plan/generate`, `/api/plan/items/:id`; tools `get_study_plan`, `create_study_plan` (undo restores the plan), `update_study_plan`
- [x] **14.09** Plan UI (week view and list, reasons, done/skip, regenerate) — `/plan`: week and list views, reasons, done / skip / put back, Plan again, what did not fit
- [x] **14.10** Today page: plan items, due reviews, weak areas, deadlines — Today: today's plan beside reviews, deadlines, the target and weak areas
- [x] **14.11** Availability and preferences settings UI — Settings → Study plan (minutes per weekday, days off, sitting length, exam retention); hours left and length on the assessment dialog
- [x] **14.12** E2E: generate a 7-day plan from fixtures; complete items; re-plan keeps completed items — `e2e/plan.spec.ts`: a 7-day plan, ticking and skipping, Today, planning again keeps them; and a tutored conversation that opens with a question and asks before recording an answer
- [x] **14.13** Docs: planning guide (how priorities are computed); STATE/FEATURES/journal updated — `docs/guide/planning.md`, tutor section in `docs/guide/chat.md`, ADR-0037, PRD updates, STATE, FEATURES, backlog, journal

## Acceptance criteria
Every plan item explains itself; the planner is deterministic for the same inputs and date; tutor
transcripts never open with a full solution.

## Gate
- [x] All tasks `[x]` · [x] verify + E2E green · [x] docs updated · [x] merged

## Recommended commit messages
```text
feat(server): add guardrailed tutor mode and assisted answer tracking
feat(core): add priority model and rolling study planner
feat(web): add study plan and Today dashboard
```
