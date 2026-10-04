# Phase 11 — AI generation and knowledge extraction

**Status:** Not started · **Branch:** `phase/11-ai-generation`

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
- [ ] **11.01** Migration: `proposals`
- [ ] **11.02** Generation framework: structured output with Zod, validation/repair retries, cost estimate, job execution with progress
- [ ] **11.03** Flashcard generation (scope: lecture, page/slide range, selection, note; count, difficulty, focus) → drafts with locators; atomicity and duplicate checks; tests
- [ ] **11.04** Question and quiz generation → drafts; answer-key validation; tests
- [ ] **11.05** Summary / lecture-notes generation → note with validated citations and concept links; tests
- [ ] **11.06** Concept and relation extraction → proposals with Graphify confidence rubric and evidence; tests
- [ ] **11.07** Concept de-duplication (normalise, alias, guarded fuzzy match, optional model tie-break); tests
- [ ] **11.08** AI grading for short/explain/derivation answers with rubric (`graded_by: ai`, overridable); tests
- [ ] **11.09** Link suggestions (unlinked mentions + semantic) → proposals; tests
- [ ] **11.10** Transcription parser for audio/video (timed sections as locators); tests (mock)
- [ ] **11.11** OCR / vision description for images and scanned PDFs; tests (mock)
- [ ] **11.12** Generation dialogue UI (scope, counts, difficulty, focus, cost estimate) from lecture, source, note or selection
- [ ] **11.13** Draft review UI (batch accept / edit / reject) for cards and questions
- [ ] **11.14** Inbox UI for proposals (concepts, relations, links, merges) with evidence quotes
- [ ] **11.15** E2E (mock): "flashcards from the first three slides" → drafts → accept → study
- [ ] **11.16** Docs: generation guide and quality rules; STATE/FEATURES/journal updated

## Acceptance criteria
Every generated item has a valid locator; nothing generated becomes active without acceptance unless
auto-accept is explicitly enabled; duplicates are flagged.

## Gate
- [ ] All tasks `[x]` · [ ] verify + E2E green · [ ] docs updated · [ ] merged

## Recommended commit messages
```text
feat(server): add structured generation of flashcards, questions and notes
feat(server): add concept extraction, de-duplication and proposals inbox
feat(web): add generation dialogue, draft review and inbox
```
