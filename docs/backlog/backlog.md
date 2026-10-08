# Backlog items

_Last reviewed: 9 October 2026 (Phase 6)._

## Knowledge (KM)

| ID | Item | Why | Origin |
|---|---|---|---|
| B-KM-01 | Git integration for the vault (history viewer, optional commit on save) | Version history beyond agent snapshots | Brief: "version/history where appropriate" |
| B-KM-02 | Saved searches / collections (smart folders) | Quick access to recurring views | Brief: "collections" |
| B-KM-03 | Property views over frontmatter (table/board), Obsidian Bases-style | Structured browsing of notes | Research: Notion, Obsidian |
| B-KM-04 | Web clipper / browser extension | Capture articles while reading | Research: Recall, Heptabase |
| B-KM-05 | Whiteboards / concept maps with JSON Canvas import/export | Spatial thinking for revision | Research: Heptabase, Obsidian Canvas, AFFiNE |
| B-KM-06 | PDF highlights and annotations stored as linked notes | Heptabase-style reading workflow | Research: Heptabase, RemNote |
| B-KM-07 | Daily notes / study log | Low-friction capture and reflection | Research: Roam, Logseq, Reflect |
| B-KM-08 | Zotero integration and citation export for the dissertation | Research workflow | User profile |
| B-KM-09 | Setting to allow remote images in the preview (off by default) | Notes that embed images from the web show a link instead (ADR-0026) | Phase 3 |
| B-KM-10 | Block references: resolve `[[Note#^id]]` to the block and embed single blocks | Obsidian users link to paragraphs; today the note opens at the top | Phase 3, ADR-0026 |
| B-KM-11 | Toggle task-list checkboxes in the preview | Quicker revision checklists | Phase 3 |
| B-KM-12 | Scroll synchronisation between editor and preview in split view | Long notes are easier to proof-read | Phase 3 |
| B-KM-13 | Restore an id removed by hand from a note that other data refers to (warn in the editor first) | Ids are app-owned (ADR-0025); removing one by hand is the only way to lose it | Phase 3 |
| B-SE-01 | Date filters in search (`created:`, `updated:` before/after) | Listed in knowledge-system.md §4; not needed for the Phase 4 gate | Phase 4 |
| B-SE-02 | Highlight the search terms inside the opened note | Results open at the matching line; marking every occurrence would help scanning | Phase 4 |
| B-SE-03 | Search operators for a single field (`title:`, `heading:`) | Narrower searches in large vaults | Phase 4 |
| B-SE-04 | Group search hits by source (e.g. "Lecture 3 — 6 slides match") with a way to expand | A repeated slide (a lecture plan shown five times) fills the first page of results | Phase 5 |
| B-SE-05 | Highlight the search terms on the opened page or slide in the source viewer | The viewer opens at the right page; marking the words would make the passage obvious | Phase 5 |
| B-SE-06 | Sources in the quick switcher and the command palette | Jump to a lecture by name as quickly as to a note | Phase 5 |
| B-SO-01 | Web page import with safe fetch (http/https only, size cap, timeout, redirect checks) and readable-content extraction | Optional task 5.11, not needed for the Phase 5 gate | Phase 5 |
| B-SO-02 | Render PPTX slides as pictures (e.g. by converting to PDF with an installed LibreOffice) | Slides are shown as text; diagrams and layout need the original | Phase 5 |
| B-SO-03 | DOCX footnotes, endnotes, comments, headers and text boxes as sections | Only the body is read today | Phase 5 |
| B-SO-04 | Two-column PDF reading order and smarter de-hyphenation | Text comes in pdf.js order; only lower-case words broken at a line end are rejoined | Phase 5 |
| B-SO-05 | Desktop file picker importing by path (no upload) and a "Reveal in Explorer" action | `POST /api/sources/import-path` exists; the picker arrives with the desktop app | Phase 5 → 18 |
| B-SO-06 | Pre-read all PDF page sizes so jumps land exactly in documents with mixed page sizes | The viewer reserves space using the first page's size until a page renders (TD-09) | Phase 5 |

## Learning (LE)

| ID | Item | Why | Origin |
|---|---|---|---|
| B-LE-01 | Past-paper import → question bank | Exam-style practice is the closest proxy for marks | Learning science §2 |
| B-LE-02 | Pre-lecture questions (pretesting) | Pretesting improves subsequent learning | Learning science |
| B-LE-03 | Calibration training (confidence before reveal, feedback) | Counter illusions of competence | Learning science §7 |
| B-LE-04 | Inline card syntax in notes (`Question :: Answer`) | Author cards while writing notes | Research: Logseq, RemNote |
| B-LE-05 | Image occlusion cards | Diagrams and architecture figures | Research: RemNote, Anki |
| B-LE-06 | Elo-style question difficulty estimation | Better adaptive selection | Learning science §6 |
| B-LE-07 | Code questions graded by tests in a sandbox | Programming practice | Learning science §2 |
| B-LE-08 | Focus timer integrated with study sessions | Time-on-task measurement | — |
| B-LE-09 | Podcast-style audio overviews | Review while commuting (low priority) | Research: NotebookLM, Turbo, Quizlet |
| B-LE-10 | Per-user FSRS parameter optimisation (≥ 1,000 reviews) | Fewer reviews for the same retention | Research: Anki manual |
| B-LE-11 | Rename a module code everywhere in one undoable step: move `Sources/<code>/` and `Modules/<code>/`, rewrite the notes' `module` and `lecture` properties | The code is locked while files use it (ADR-0029) | Phase 6 |
| B-LE-12 | Rename a lecture key with its notes' `lecture` properties rewritten | Keys are locked the same way | Phase 6 |
| B-LE-13 | Drag to reorder topics and lectures; rename topics in place | The API takes an `ordinal`; the module page only adds and deletes topics | Phase 6 |
| B-LE-14 | Delete a course from the Modules page | The API can; modules keep working without a course | Phase 6 |
| B-LE-15 | Degree classification across years (e.g. Year 2 : Year 3 weighted 1 : 3) with UK boundaries | The classification, not one year's average, is what finally counts | Phase 6 |
| B-LE-16 | Exam duration and room in the assessment dialog | The API stores `durationMinutes`; the dialog does not ask for it | Phase 6 |
| B-LE-17 | Lecture list grouped by week with a marker for the current week | Easier to see where the term is | Phase 6 |

## AI (AI)

| ID | Item | Why | Origin |
|---|---|---|---|
| B-AI-01 | LLM-written contextual chunk summaries | Fewer retrieval failures (Anthropic contextual retrieval) | Research |
| B-AI-02 | Reranking model support | Further retrieval gains | Research |
| B-AI-03 | Local embedding model (transformers.js / onnxruntime) | Offline semantic search with no API | Research |
| B-AI-04 | Research mode with web search and source discovery | Dissertation literature work | Research: NotebookLM 2.0 |
| B-AI-05 | Consume external MCP servers in the in-app agent | Timetable, library, calendar data | Research: MCP |
| B-AI-06 | Voice tutoring | Hands-free practice | Research: StudyFetch |
| B-AI-07 | Durable agent runs (AI SDK WorkflowAgent) | Very long tasks surviving restarts | Research: AI SDK 7 |

## Platform (PL)

| ID | Item | Why | Origin |
|---|---|---|---|
| B-PL-01 | Timetable and deadline import (ICS) | Avoid manual entry of lectures and deadlines | Research: Reflect |
| B-PL-02 | Multi-device sync | Review on another device | Research: Anytype, Logseq |
| B-PL-03 | Direct VLE (Moodle) integration | One-click import of lecture material | Research: Knowt; RQ-03 |
| B-PL-04 | Mobile-friendly review (PWA) | Reviews on the phone | UI §9 |
| B-PL-05 | Code-signed installer | Remove SmartScreen warnings | Phase 19 |
| B-PL-06 | Auto-update | Painless upgrades | Phase 19 |
