# Research

Phase 0 research, carried out 4 October 2026 (Claude Opus 5.5). Each document cites its sources and
classifies ideas as **Emulate · Improve upon · Borrow idea · Defer · Reject · Irrelevant**.

| Document | Scope |
|---|---|
| [knowledge-management.md](./knowledge-management.md) | Notion, Obsidian, Anytype, Capacities, Heptabase, Tana, Logseq, Roam, Mem, Reflect, AFFiNE, SiYuan, Recall, Obsidian AI plugins |
| [graphify.md](./graphify.md) | Deep study of the local Graphify repository: architecture, data model, algorithms, licence, reuse |
| [edtech.md](./edtech.md) | NotebookLM/Gemini Notebook, TurboLearn, Quizlet, Anki, RemNote, StudyFetch, Knowt, Gizmo, lab study modes, Math Academy |
| [learning-science.md](./learning-science.md) | Evidence for retrieval practice and spacing, AI-tutor guardrails, FSRS, FIRe, mastery modelling |
| [agent-architecture.md](./agent-architecture.md) | Tool calling, AI SDK 7, Mastra, LangGraph.js, OpenAI Agents SDK, Claude Agent SDK, OpenCode, DeepSeek Harness, MCP 2026-07-28, RAG, GraphRAG/LightRAG |
| [tech-stack.md](./tech-stack.md) | Library and platform evaluation with versions and risks |

## Synthesis: what the research says to build

### The gap in the market

PKM tools are good at *"What do I know?"* but have no model of learning. AI study tools are good at
turning sources into artefacts but treat each upload as a silo and rarely schedule what they generate.
Nothing found combines **a persistent, user-owned knowledge base**, **source-grounded AI with
provenance**, **FSRS-scheduled retrieval practice**, **explainable mastery** and **deadline-aware
planning** around **one shared concept model**. That combination is this product.

### Capabilities worth building (ordered by expected impact on marks)

1. **Retrieval practice on a schedule** — flashcards and questions with FSRS-6 (learning-science §1, §4).
2. **Source-grounded generation with provenance** — cards/questions/notes that link back to the exact
   slide or page (NotebookLM, Heptabase).
3. **Explainable mastery and weak-area detection** at concept → topic → module level (Quizlet Learn,
   Recall, Math Academy — made transparent).
4. **Deadline- and weight-aware study planning** — a gap in every surveyed tool.
5. **Guardrailed tutor** — hints before answers, ending in retrieval (Bastani 2025; Kestin 2025).
6. **Markdown knowledge base** compatible with Obsidian, with backlinks and fast search (Obsidian).
7. **Analysed knowledge graph** with provenance-tagged edges that generates study prompts (Graphify).
8. **Agentic chat** acting through typed, permissioned tools with undo (Mem 2.0, Notion 3.x, OpenCode).
9. **Lecture pipeline** — upload → process → propose notes/concepts/cards → review → study (TurboLearn,
   Quizlet audio recording) — built last because it composes everything above.

### Deliberately not building (with reasons in the documents)

General-purpose Notion-style databases · block references/transclusion · whiteboards (deferred) ·
plugin API · collaboration/sharing · games, leaderboards, mascots · podcast/video generation (deferred)
· cloud storage · an off-the-shelf agent framework (Mastra, LangGraph, DeepSeek Harness) · Graphify as
a Python sidecar.

### Key technical conclusions

- **Architecture**: one Node server (Hono) used by both the browser and Electron — validated by
  OpenCode's design.
- **Storage**: Markdown files canonical for notes; originals preserved for sources; SQLite (`node:sqlite`,
  FTS5) for structured learning data and the rebuildable index. Logseq's struggle with block-level
  identity in files argues against going further than page-level files.
- **AI**: AI SDK 7 for provider abstraction, tool loops and approvals; our own registry, policies and
  action log; MCP server adapter later.
- **Retrieval**: hybrid FTS5 + optional embeddings + graph expansion; citations carry locators.

Open questions are tracked in [`docs/backlog/research-questions.md`](../backlog/research-questions.md).
