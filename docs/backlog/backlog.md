# Backlog items

_Last reviewed: 4 October 2026 (Phase 0)._

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
