# Phase 5 — Source library and ingestion pipeline

**Status:** Complete (8 October 2026) · **Branch:** `phase/05-sources`

## Objective
Import lecture material (PDF, PPTX, DOCX, Markdown, text; optionally web pages), preserve originals,
parse into page/slide/heading sections, chunk with locators, index for search, and view sources with
page/slide navigation — via a persistent job queue with progress.

## Why it exists
Sources are the ground truth for grounded answers and generated study material; locators make
citations possible (ADR-0010, ADR-0019).

## Dependencies
Phase 4.

## Atomic tasks

### De-risking
- [x] **5.01** Spike: PDF text extraction with `pdfjs-dist` vs `unpdf` in Node and Electron's Node using real lecture PDFs; decision recorded (ADR-0019 update) — identical text from both on a paper and a 40-slide lecture deck in Node 24.14 and Electron 44.5's Node; `pdfjs-dist` used directly (ADR-0019 spike result)

### Foundations
- [x] **5.02** Migration: `sources`, `source_sections`, `chunks`, `chunks_fts`, `jobs` — `0005_sources.sql`; `chunks_fts` is external-content over `chunks`, kept in step by triggers (also on cascade deletes), rank `bm25(2, 1)`
- [x] **5.03** Job queue: enqueue, worker loop, retry with back-off, cancellation, progress events (SSE); unit tests — `src/jobs/`; atomic claiming, permanent vs retryable errors, time limits, coalescing, recovery of interrupted jobs, `job.updated` events; 8 tests
- [x] **5.04** Import service: copy original into `Sources/<module code | Inbox>/`, SHA-256 de-duplication, safe file names, metadata row; unit tests — byte-identical copy checked; unique names (`week2 1.pptx`); a missing source is revived by re-importing its file
- [x] **5.05** Type detection by extension and magic bytes; unit tests — `@skb/core` `detectSourceKind`; legacy and macro formats refused with advice
- [x] **5.06** `SourceParser` interface and `NormalisedDocument` types in `@skb/core` — with the shared `LocatorSchema` (PDF page + character range, slide body/notes, DOCX heading path + paragraph, text line, media time)

### Parsers (each with fixture-based tests)
- [x] **5.07** Markdown and plain text — fence-aware heading sections with line locators (reusing the notes analyser); invalid UTF-8 and empty files reported
- [x] **5.08** PDF: per-page sections; "no text layer" detection; size/page limits — pages without text reported by number (and blanked); password and damage give reasons; 3,000-page limit; words hyphenated across lines rejoined; checked on real files (Raft paper, CS224N lecture 1)
- [x] **5.09** PPTX: slide order from `presentation.xml`, titles, body text, speaker notes; zip-bomb guard — groups, tables and indentation; slide numbers and other chrome left out; hidden slides counted; declared ZIP sizes checked before inflating; DOCTYPEs refused
- [x] **5.10** DOCX: in-house `word/document.xml` reader (fflate + fast-xml-parser) → Markdown-style text → heading sections (mammoth dropped: ADR-0019 "DOCX change") — heading levels by style *name* or outline level (translated style ids work), lists, pipe tables, tracked deletions left out
- [ ] **5.11** *(optional)* Web page import with safe fetch (http/https only, size cap, timeout, redirect checks) and readable-content extraction — not required for the gate; moved to backlog **B-SO-01**

### Pipeline
- [x] **5.12** Chunker: section-aware, token estimate, small overlap, context prefix, locators; unit tests — `@skb/core` `chunkDocument`; cuts at paragraph → line → sentence → word; every locator points at where its chunk starts
- [x] **5.13** Ingestion job: parse → sections → chunks → FTS; status transitions; idempotent on SHA-256 + parser version; unit tests — one transaction; a failure keeps the previous content; cancellation and retries reflected on the source
- [x] **5.14** Re-ingestion on file change or parser upgrade; move detection by hash; unit tests — reconciler over the notes index's new attachment events (ADR-0028): moves keep the id, edits re-ingest, deletions mark *missing*, trash restores revive, dropped-in files register, the library rebuilds from `Sources/` on a new database
- [x] **5.15** Sources API: import (multipart and server-side path), list, get, sections, retry, soft delete; integration tests — delete moves the original to the trash; path import refuses relative paths, folders and `.skb/`
- [x] **5.16** Search includes source chunks with locators (extends Phase 4); unit tests — one hit per page/slide/section ranked with notes; `kind:` filter; folder/module filters apply to sources; p95 105 ms with 10,000 notes plus 10,000 PDF pages (budget 150 ms)

### UI
- [x] **5.17** Library page: by module/status, drag-and-drop and picker import, live progress, errors with retry — module box for new imports, warnings shown, delete to the trash with confirmation; component tests
- [x] **5.18** Source viewer: PDF (pdf.js, thumbnails, page navigation, text selection), slide view (text + speaker notes), Markdown/DOCX view; deep links to a locator — `/library/<id>?page=` / `?slide=&notes=` / `?section=`; pages rendered lazily and released; zoom; search results link here

### Verification
- [x] **5.19** E2E: import a PDF and a PPTX → ready → search finds text → result opens the right page/slide — `e2e/library.spec.ts` (page 3 rendered with its text layer, a slide's speaker notes in view, sticky headers while the pages scroll, axe on the library and the slide view); unsupported files refused
- [x] **5.20** Security tests: zip bomb, oversized PDF, path traversal in file names, unsupported types — `security.test.ts`: 60 MB zip bomb, 3,001-page PDF, the 200 MB limit (service and declared HTTP length), traversal and unportable names, mismatched contents, path-import rules
- [x] **5.21** Docs: supported formats guide; STATE/FEATURES/journal updated — `docs/guide/sources.md`; search guide, data model, architecture, tech stack, ADR-0028, backlog and technical debt updated

## Tests
Fixtures are built in code (`apps/server/test/fixtures/sources/builders.ts`: PDF, PPTX, DOCX and zip
bombs), so no binary files are committed.

## Acceptance criteria
- [x] Originals are byte-identical after import — compared byte for byte in `sources.test.ts`
- [x] Every chunk has a valid locator — chunker and parser tests validate locators with `LocatorSchema`
- [x] A failed import is visible and retryable — reason on the row, Retry in the library and viewer
- [x] Search hits open at the right place — E2E (PDF page 3, slide notes) and component tests

## Documentation requirements
`docs/guide/sources.md`.

## Gate
- [x] All required tasks `[x]` · [x] verify (424 Vitest tests) + E2E (72 Playwright tests) green · [x] docs updated · [x] merged

## Recommended commit messages
```text
feat(server): add SQLite-backed job queue with progress events
feat(server): add source import, PDF/PPTX/DOCX parsers and chunking
feat(web): add library and source viewer with locator deep links
```
