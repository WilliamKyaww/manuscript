# Phase 15 — Knowledge–learning integration

**Status:** Not started · **Branch:** `phase/15-integration`

## Objective
Close the loop from the brief: lecture → concepts → graph → study materials → practice → mastery →
weak concepts → targeted learning → updated knowledge, with graph-aware (FIRe-inspired) evidence and
mastery shown on the graph.

## Why it exists
This deep integration is the product's differentiator (`docs/research/README.md`).

## Dependencies
Phase 14 (and Phase 7 graph).

## Atomic tasks
- [ ] **15.01** Lecture pipeline: on import, optionally generate summary note, extract concepts and links, draft cards and questions, assemble a quiz → drafts/Inbox; progress UI
- [ ] **15.02** Pipeline settings (steps on/off, auto-accept per kind)
- [ ] **15.03** FIRe-inspired implicit credit and at-risk propagation along accepted prerequisite edges (`learning-system.md` §10); tests
- [ ] **15.04** Mastery overlay on the graph (stage colours plus patterns); weak-concept highlighting
- [ ] **15.05** Cross-module connections view (shared concepts, surprising connections)
- [ ] **15.06** Weak concept → one-click targeted practice (generate material if none, otherwise practise)
- [ ] **15.07** Post-session updates: misconceptions → note-edit proposals
- [ ] **15.08** Proactive resurfacing before lectures/exams (related weak concepts and notes)
- [ ] **15.09** End-to-end workflow test (mock AI): upload lecture → proposals → accept → review → mastery → plan reflects changes
- [ ] **15.10** Docs: "the study loop" guide; STATE/FEATURES/journal updated

## Acceptance criteria
The full loop runs with the mock provider in CI and with a real provider in a recorded manual check;
implicit credit is visible in mastery explanations.

## Gate
- [ ] All tasks `[x]` · [ ] verify + E2E green · [ ] docs updated · [ ] merged

## Recommended commit messages
```text
feat: add lecture processing pipeline from import to study materials
feat(core): add graph-aware implicit credit for concept mastery
feat(web): add mastery overlay and cross-module connections
```
