# Phase 5 — Source library and ingestion pipeline

**Status:** In progress (from 8 October 2026) · **Branch:** `phase/05-sources`

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
- [ ] **5.02** Migration: `sources`, `source_sections`, `chunks`, `chunks_fts`, `jobs`
- [ ] **5.03** Job queue: enqueue, worker loop, retry with back-off, cancellation, progress events (SSE); unit tests
- [ ] **5.04** Import service: copy original into `Sources/<module code | Inbox>/`, SHA-256 de-duplication, safe file names, metadata row; unit tests
- [ ] **5.05** Type detection by extension and magic bytes; unit tests
- [ ] **5.06** `SourceParser` interface and `NormalisedDocument` types in `@skb/core`

### Parsers (each with fixture-based tests)
- [ ] **5.07** Markdown and plain text
- [ ] **5.08** PDF: per-page sections; "no text layer" detection; size/page limits
- [ ] **5.09** PPTX: slide order from `presentation.xml`, titles, body text, speaker notes; zip-bomb guard
- [ ] **5.10** DOCX: in-house ``word/document.xml`` reader (fflate + fast-xml-parser) → Markdown-style text → heading sections (mammoth dropped: ADR-0019 "DOCX change")
- [ ] **5.11** *(optional)* Web page import with safe fetch (http/https only, size cap, timeout, redirect checks) and readable-content extraction

### Pipeline
- [ ] **5.12** Chunker: section-aware, token estimate, small overlap, context prefix, locators; unit tests
- [ ] **5.13** Ingestion job: parse → sections → chunks → FTS; status transitions; idempotent on SHA-256 + parser version; unit tests
- [ ] **5.14** Re-ingestion on file change or parser upgrade; move detection by hash; unit tests
- [ ] **5.15** Sources API: import (multipart and server-side path), list, get, sections, retry, soft delete; integration tests
- [ ] **5.16** Search includes source chunks with locators (extends Phase 4); unit tests

### UI
- [ ] **5.17** Library page: by module/status, drag-and-drop and picker import, live progress, errors with retry
- [ ] **5.18** Source viewer: PDF (pdf.js, thumbnails, page navigation, text selection), slide view (text + speaker notes), Markdown/DOCX view; deep links to a locator

### Verification
- [ ] **5.19** E2E: import a PDF and a PPTX → ready → search finds text → result opens the right page/slide
- [ ] **5.20** Security tests: zip bomb, oversized PDF, path traversal in file names, unsupported types
- [ ] **5.21** Docs: supported formats guide; STATE/FEATURES/journal updated

## Tests
Fixtures in `apps/server/test/fixtures/sources/` (small, licence-clean files created for the tests).

## Acceptance criteria
Originals are byte-identical after import; every chunk has a valid locator; a failed import is visible
and retryable; search hits open at the right place.

## Documentation requirements
`docs/guide/sources.md`.

## Gate
- [ ] All required tasks `[x]` · [ ] verify + E2E green · [ ] docs updated · [ ] merged

## Recommended commit messages
```text
feat(server): add SQLite-backed job queue with progress events
feat(server): add source import, PDF/PPTX/DOCX parsers and chunking
feat(web): add library and source viewer with locator deep links
```
