# Phase 11 — AI generation and knowledge extraction

**Status:** Complete (9 October 2026) · **Branch:** `phase/11-ai-generation`

## Objective
Generate flashcards, questions, quizzes and lecture/summary notes from scoped material with
provenance; extract concepts and relations as proposals; de-duplicate concepts; grade free-text answers;
transcribe audio/video and OCR images — all reviewed before they enter the knowledge base.

## Why it exists
Turns sources into practice quickly (goal G1) without sacrificing quality or trust (AI proposes, user
decides).

## Dependencies
Phase 10.

## Atomic tasks
- [x] **11.01** Migration: `proposals` — `0011_proposals.sql` (kind, status, payload, evidence, origin, dedupe key, result) and `ai_usage` rebuilt with its rows to allow the `transcription` role (ADR-0034)
- [x] **11.02** Generation framework: structured output with Zod, validation/repair retries, cost estimate, job execution with progress — material by scope keyed S1…Sn within twice the context budget; `Output.object` with one repair attempt, every attempt recorded (tested with a scripted model); estimate endpoint (passages, tokens, cost, problems); `ai.generate` job with progress and a kept result message, never retried by itself
- [x] **11.03** Flashcard generation (scope: lecture, page/slide range, selection, note; count, difficulty, focus) → drafts with locators; atomicity and duplicate checks; tests — draft cards with the slide as locator, unusable cards and repeats dropped, writing advice and the closest existing card shown; a set named after the material
- [x] **11.04** Question and quiz generation → drafts; answer-key validation; tests — six kinds converted to answer keys and checked (one correct option, numbers, accepted answers, model answers); module and lecture kept; generated questions join quizzes once accepted
- [x] **11.05** Summary / lecture-notes generation → note with validated citations and concept links; tests — invented citations removed, the rest turned into wikilinks to the file and page, concepts linked at first mention, `sources:` and `generated_by: ai` frontmatter; proposed, then saved on acceptance
- [x] **11.06** Concept and relation extraction → proposals with Graphify confidence rubric and evidence; tests — EXTRACTED / INFERRED (0.55–0.95) / AMBIGUOUS with quotes and locators; relation ends may be proposed concepts (accepted with the relation); rejected proposals never made again; accepted concepts `covered_in` their lecture or source
- [x] **11.07** Concept de-duplication (normalise, alias, guarded fuzzy match, optional model tie-break); tests — `packages/core/src/ai/dedup.ts` adapted from Graphify (attributed): exact and plural forms, Jaro–Winkler 0.94 merge proposals, 0.88–0.94 judged by the fast model or shown with the likely match; numbers, short labels and added words guarded; "merge into" on acceptance
- [x] **11.08** AI grading for short/explain/derivation answers with rubric (`graded_by: ai`, overridable); tests — a suggestion (score, feedback, misconceptions) recorded only when accepted, with the feedback kept; the student can grade it themselves instead
- [x] **11.09** Link suggestions (unlinked mentions + semantic) → proposals; tests — names of notes and concepts written without a link, and notes close in meaning (embeddings); accepting writes the link (re-finding the words if the note changed) or lists the note under "Related"
- [x] **11.10** Transcription parser for audio/video (timed sections as locators); tests (mock) — a transcription role; sections of about a minute with media locators (estimated times for models without timestamps); imported unread without AI, with "Read again"; files over 25 MB explained (B-AI-13)
- [x] **11.11** OCR / vision description for images and scanned PDFs; tests (mock) — images read or described (image locator); PDF pages without a text layer read from the PDF by the chat model (≤ 100 pages, 30 MB)
- [x] **11.12** Generation dialogue UI (scope, counts, difficulty, focus, cost estimate) from lecture, source, note or selection — on lecture pages, the source viewer (with a page/slide range or the selection) and notes (the whole note or the selection); progress and a notification leading to the Inbox
- [x] **11.13** Draft review UI (batch accept / edit / reject) for cards and questions — the Inbox's Drafts tab with source links, advice and duplicates; auto-accept per kind in Settings → AI
- [x] **11.14** Inbox UI for proposals (concepts, relations, links, merges) with evidence quotes — the Suggestions tab with filters, inline edits, "merge into", batch decisions (concepts first); a count in the sidebar
- [x] **11.15** E2E (mock): "flashcards from the first three slides" → drafts → accept → study — `e2e/generation.spec.ts` (own server on port 4394), with axe on the dialogue and the Inbox
- [x] **11.16** Docs: generation guide and quality rules; STATE/FEATURES/journal updated — `docs/guide/generation.md`; ADR-0034; agent-system, knowledge-system and data-model PRDs; backlog B-AI-13…19; THIRD_PARTY_NOTICES

## Acceptance criteria
- [x] Every generated item has a valid locator — items whose passage cannot be found are dropped (tested for cards and questions); notes and proposals carry their passages' locators as evidence
- [x] Nothing generated becomes active without acceptance unless auto-accept is explicitly enabled — drafts are never reviewed or counted (tested: an empty review queue until accepted); proposals change nothing until accepted; auto-accept is per kind and off by default
- [x] Duplicates are flagged — repeats within a generation are dropped; drafts resembling existing cards or questions show "Like one you have" (tested); concept names matching existing ones are reused or proposed as merges (tested)

## Gate
- [x] All tasks `[x]` · [x] verify (636 Vitest tests) + E2E (82 Playwright tests) green · [x] docs updated · [x] merged
- Performance (not a gate item here, run because ingestion and search scope changed): on battery, four budgets over exactly as the Phase 10 code under the same conditions — no regression; to be re-run on mains power (STATE.md → Broken)

## Recommended commit messages
```text
feat(server): add structured generation of flashcards, questions and notes
feat(server): add concept extraction, de-duplication and proposals inbox
feat(web): add generation dialogue, draft review and inbox
```
