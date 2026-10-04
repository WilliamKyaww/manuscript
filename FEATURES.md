# Features

Inventory of every planned, built, deferred and rejected capability. A feature is **Complete** only
when it works end to end, is tested and is documented — never because code exists.

Statuses: **Planned** · **In Progress** · **Partial** (say what is missing) · **Complete** ·
**Deferred** (see backlog ID) · **Rejected** (reason in research/ADR).

_Last updated: 4 October 2026 (Phase 0)._

## Platform and architecture

| ID | Feature | Status | Phase |
|---|---|---|---|
| F-PL-01 | npm workspaces monorepo with TypeScript 7, Biome, Vitest, Playwright | Planned | 1 |
| F-PL-02 | Local Hono server bound to loopback with token, Host and Origin protection | Planned | 1 |
| F-PL-03 | SQLite via `node:sqlite` with migrations and transactions | Planned | 1 |
| F-PL-04 | Vault folder with `.skb/` metadata, lock and atomic writes | Planned | 1 |
| F-PL-05 | React SPA with typed API client | Planned | 1 |
| F-PL-06 | `npm run dev`, `npm run build`, `npm start`, `npm run verify` | Planned | 1 |
| F-PL-07 | `run-web.bat` one-click Windows launcher | Planned | 1 |
| F-PL-08 | Persistent job queue with progress events | Planned | 5 |
| F-PL-09 | Automatic database backups and crash recovery | Planned | 17 |
| F-PL-10 | Diagnostics page and log viewer | Planned | 17 |

## Knowledge — notes and Markdown

| ID | Feature | Status | Phase |
|---|---|---|---|
| F-KN-01 | Markdown notes as files with frontmatter and stable IDs | Planned | 3 |
| F-KN-02 | CodeMirror 6 editor with preview/split modes | Planned | 3 |
| F-KN-03 | Maths (KaTeX), code highlighting, Mermaid diagrams, callouts | Planned | 3 |
| F-KN-04 | Wikilinks, embeds, tags (Obsidian-compatible) | Planned | 3 |
| F-KN-05 | Backlinks and unlinked mentions | Planned | 3 |
| F-KN-06 | Folder tree with rename/move (optional link rewriting) and trash | Planned | 3 |
| F-KN-07 | Templates | Planned | 3 |
| F-KN-08 | Attachments | Planned | 3 |
| F-KN-09 | Live pick-up of external edits (VS Code, Obsidian) | Planned | 3 |
| F-KN-10 | Live-preview editing decorations | Planned | 20 |

## Knowledge — search

| ID | Feature | Status | Phase |
|---|---|---|---|
| F-SE-01 | Full-text search (FTS5) with filters and operators | Planned | 4 |
| F-SE-02 | Quick switcher | Planned | 4 |
| F-SE-03 | Search across source chunks with locators | Planned | 5 |
| F-SE-04 | Semantic search and hybrid fusion (optional embeddings) | Planned | 10 |
| F-SE-05 | Related notes panel | Planned | 10 |

## Knowledge — sources and ingestion

| ID | Feature | Status | Phase |
|---|---|---|---|
| F-SO-01 | Source library with originals preserved | Planned | 5 |
| F-SO-02 | PDF ingestion (per-page) and viewer | Planned | 5 |
| F-SO-03 | PPTX ingestion (per-slide, speaker notes) | Planned | 5 |
| F-SO-04 | DOCX, Markdown and text ingestion | Planned | 5 |
| F-SO-05 | Web page import with safe fetch | Planned (optional) | 5 |
| F-SO-06 | Audio/video transcription | Planned | 11 |
| F-SO-07 | OCR / image understanding | Planned | 11 |
| F-SO-08 | Graphify `graph.json` import | Planned | 16 |

## Knowledge — concepts and graph

| ID | Feature | Status | Phase |
|---|---|---|---|
| F-GR-01 | Concepts with aliases, memberships and concept pages | Planned | 6 |
| F-GR-02 | Wikilinks resolving to concepts | Planned | 6 |
| F-GR-03 | Typed relations with confidence, status and evidence | Planned | 7 |
| F-GR-04 | Graph analytics (communities, core concepts, bridges, gaps, paths) | Planned | 7 |
| F-GR-05 | Study prompts generated from graph analytics | Planned | 7 |
| F-GR-06 | WebGL global graph and local graph panels | Planned | 7 |
| F-GR-07 | AI concept/relation extraction with de-duplication | Planned | 11 |
| F-GR-08 | Mastery overlay on the graph | Planned | 15 |

## Learning — course structure

| ID | Feature | Status | Phase |
|---|---|---|---|
| F-CS-01 | Courses, modules, lectures, topics | Planned | 6 |
| F-CS-02 | Assessments with weights and deadlines | Planned | 6 |
| F-CS-03 | Mark calculator against the 85 % target | Planned | 6 |

## Learning — flashcards and spaced repetition

| ID | Feature | Status | Phase |
|---|---|---|---|
| F-FC-01 | Basic, reversed and cloze cards with Markdown/KaTeX | Planned | 8 |
| F-FC-02 | FSRS-6 scheduling (ts-fsrs) with append-only review logs | Planned | 8 |
| F-FC-03 | Keyboard review session with undo, edit, suspend, bury | Planned | 8 |
| F-FC-04 | Make card from selection (notes and sources) | Planned | 8 |
| F-FC-05 | Review statistics and due forecast | Planned | 8 |
| F-FC-06 | Anki TSV/CSV import/export | Planned | 8 |
| F-FC-07 | AI flashcard generation with provenance and review | Planned | 11 |
| F-FC-08 | Exam-aware retention policy | Planned | 14 |

## Learning — questions, quizzes and mastery

| ID | Feature | Status | Phase |
|---|---|---|---|
| F-QZ-01 | Question bank (8 kinds) with explanations and locators | Planned | 9 |
| F-QZ-02 | Practice quizzes and timed mock exams | Planned | 9 |
| F-QZ-03 | Adaptive practice sessions (ladder, correct-twice, interleaving) | Planned | 9 |
| F-QZ-04 | Transparent mastery with roll-ups, readiness and coverage | Planned | 9 |
| F-QZ-05 | Weak-area detection with actions | Planned | 9 |
| F-QZ-06 | AI question generation and AI rubric grading | Planned | 11 |
| F-QZ-07 | FIRe-inspired implicit credit along prerequisite edges | Planned | 15 |

## Learning — tutoring and planning

| ID | Feature | Status | Phase |
|---|---|---|---|
| F-PN-01 | Guardrailed Socratic tutor mode | Planned | 14 |
| F-PN-02 | Misconception check against the knowledge base | Planned | 14 |
| F-PN-03 | Rolling study planner with reasons | Planned | 14 |
| F-PN-04 | Today dashboard | Planned | 14 |

## AI and agent

| ID | Feature | Status | Phase |
|---|---|---|---|
| F-AI-01 | Role-based provider registry (Anthropic, OpenAI, OpenAI-compatible, mock) | Planned | 10 |
| F-AI-02 | Secure key storage, usage tracking and spend caps | Planned | 10 |
| F-AI-03 | Grounded Q&A with citations and grounding badges | Planned | 10 |
| F-AI-04 | Prompt-injection defences for source content | Planned | 10 |
| F-AI-05 | Generation of notes, summaries, cards and questions | Planned | 11 |
| F-AI-06 | Proposals Inbox (AI proposes, user decides) | Planned | 11 |
| F-AI-07 | Typed tool registry with risk levels and approvals | Planned | 12 |
| F-AI-08 | Action log with snapshots and undo | Planned | 12 |
| F-AI-09 | MCP server for external agents | Planned | 12 |
| F-AI-10 | Agentic chat with activity timeline, approvals and result cards | Planned | 13 |
| F-AI-11 | Chat side panel with page context and @mentions | Planned | 13 |

## Integration

| ID | Feature | Status | Phase |
|---|---|---|---|
| F-IN-01 | Lecture pipeline (import → notes, concepts, cards, quiz proposals) | Planned | 15 |
| F-IN-02 | Cross-module connections view | Planned | 15 |
| F-IN-03 | Weak concept → targeted practice in one click | Planned | 15 |
| F-IN-04 | Proactive resurfacing before lectures and exams | Planned | 15 |

## Portability

| ID | Feature | Status | Phase |
|---|---|---|---|
| F-PO-01 | Full export and restore | Planned | 16 |
| F-PO-02 | Concepts as Markdown, graph as JSON/GraphML, quizzes as Markdown | Planned | 16 |
| F-PO-03 | Open an Obsidian vault in place | Planned | 16 |
| F-PO-04 | Vault switching | Planned | 16 |

## Desktop and packaging

| ID | Feature | Status | Phase |
|---|---|---|---|
| F-DE-01 | Electron app with server in a utility process | Planned | 18 |
| F-DE-02 | Native pickers and Explorer integration | Planned | 18 |
| F-DE-03 | Encrypted secrets with `safeStorage` | Planned | 18 |
| F-DE-04 | Windows NSIS installer | Planned | 19 |

## UI/UX

| ID | Feature | Status | Phase |
|---|---|---|---|
| F-UI-01 | App shell with sticky-header page architecture | Planned | 2 |
| F-UI-02 | Light/dark/system themes on design tokens | Planned | 2 |
| F-UI-03 | Command palette and keyboard shortcut registry | Planned | 2 |
| F-UI-04 | Accessible primitives and state components | Planned | 2 |
| F-UI-05 | Final visual polish across all screens | Planned | 20 |

## Deferred

| ID | Feature | Backlog |
|---|---|---|
| F-X-01 | General-purpose databases / property views (Notion, Obsidian Bases) | B-KM-03 |
| F-X-02 | Whiteboards / concept maps (JSON Canvas) | B-KM-05 |
| F-X-03 | Daily notes / study log | B-KM-07 |
| F-X-04 | Inline card syntax inside notes | B-LE-04 |
| F-X-05 | Image occlusion cards | B-LE-05 |
| F-X-06 | Test-based grading for code questions | B-LE-07 |
| F-X-07 | Podcast/audio overviews | B-LE-09 |
| F-X-08 | Per-user FSRS parameter optimisation | B-LE-10 |
| F-X-09 | Research mode with web search (dissertation) | B-AI-04 |
| F-X-10 | Voice tutoring | B-AI-06 |
| F-X-11 | Timetable/deadline import (ICS) | B-PL-01 |
| F-X-12 | Multi-device sync | B-PL-02 |
| F-X-13 | Direct VLE (Moodle) integration | B-PL-03 |

## Rejected

| Feature | Reason |
|---|---|
| Collaboration, sharing, comments | Single-user product |
| Gamification (leaderboards, XP, mascots) | No evidence it improves marks; distracting |
| Block references / transclusion in Markdown | Fragile identity in files (Logseq lesson); ADR-0004 |
| Third-party plugin API | Security and maintenance cost; internal extension points suffice |
| Cloud storage service of our own | Data portability; the user can sync the vault folder |
| Agent tool that sets mastery directly | Mastery is computed from evidence only (ADR-0021) |
| Graphify as a Python sidecar | Packaging cost; algorithms ported instead (ADR-0015) |
