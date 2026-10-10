# Phase 15 — Knowledge–learning integration

**Status:** Complete · **Branch:** `phase/15-integration`

## Objective
Close the loop from the brief: lecture → concepts → graph → study materials → practice → mastery →
weak concepts → targeted learning → updated knowledge, with graph-aware (FIRe-inspired) evidence and
mastery shown on the graph.

## Why it exists
This deep integration is the product's differentiator (`docs/research/README.md`).

## Dependencies
Phase 14 (and Phase 7 graph).

## Atomic tasks
- [x] **15.01** Lecture pipeline: on import, optionally generate summary note, extract concepts and links, draft cards and questions, assemble a quiz → drafts/Inbox; progress UI — `ai.pipeline`: note, concepts, cards, questions, quiz as one job with a result per step; lecture page "Make study materials…" with progress; runs by itself on attaching material if switched on
- [x] **15.02** Pipeline settings (steps on/off, auto-accept per kind) — Settings → Lecture pipeline (steps, run by itself); auto-accept per kind stays under AI
- [x] **15.03** FIRe-inspired implicit credit and at-risk propagation along accepted prerequisite edges (`learning-system.md` §10); tests — `propagateCredit` and the mastery integration; `credit` and `atRisk` in the explanation; tests in core and server (ADR-0038)
- [x] **15.04** Mastery overlay on the graph (stage colours plus patterns); weak-concept highlighting — Colour by mastery: stage colours plus a shape per stage in the label and ⚠ for weak concepts; key in the legend
- [x] **15.05** Cross-module connections view (shared concepts, surprising connections) — `/api/graph/connections` and the "Between modules" panel beside the graph
- [x] **15.06** Weak concept → one-click targeted practice (generate material if none, otherwise practise) — a concept is a generation scope; ✨ beside concepts without material on Progress; Practise for the rest
- [x] **15.07** Post-session updates: misconceptions → note-edit proposals — wrong answers on a concept with a note become `addition` suggestions (Common mistakes) when an attempt finishes
- [x] **15.08** Proactive resurfacing before lectures/exams (related weak concepts and notes) — `/api/resurface` and "Before what's next" on Today (lectures within 2 days, exams and deadlines within a week)
- [x] **15.09** End-to-end workflow test (mock AI): upload lecture → proposals → accept → review → mastery → plan reflects changes — `loop.test.ts` (server) and `e2e/loop.spec.ts`: lecture → pipeline → accept → cards → review → mastery → plan → Today → graph
- [x] **15.10** Docs: "the study loop" guide; STATE/FEATURES/journal updated — `docs/guide/study-loop.md`, updates to the mastery, graph and generation guides, ADR-0038, PRD, FEATURES, STATE, backlog, journal

## Acceptance criteria
The full loop runs with the mock provider in CI and with a real provider in a recorded manual check _(the first half is automated and passes; the manual check with a real provider is the student's: the steps are at the end of `docs/guide/chat.md`, and for the pipeline, run Make study materials on a real lecture)_;
implicit credit is visible in mastery explanations.

## Gate
- [x] All tasks `[x]` · [x] verify + E2E green · [x] docs updated · [x] merged

## Recommended commit messages
```text
feat: add lecture processing pipeline from import to study materials
feat(core): add graph-aware implicit credit for concept mastery
feat(web): add mastery overlay and cross-module connections
```
