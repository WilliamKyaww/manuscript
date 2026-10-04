# Product requirements (PRD)

**Version 0.1 — 4 October 2026 — Claude Opus 5.5.** Status: draft; the user should review
`product.md` §4 (assumed workflow) and the open questions in `docs/backlog/research-questions.md`.

A personal Knowledge & Learning OS for a final-year CS & AI student: a Markdown knowledge base, a source
library, a concept graph and an FSRS-based learning system sharing one data model, with a provider-
independent AI agent that acts through permissioned tools. Built as a local web app (Node server +
React SPA) and packaged with Electron.

| Document | Covers |
|---|---|
| [product.md](./product.md) | Vision, user, workflow, goals and success criteria, non-goals, use cases, release slices |
| [architecture.md](./architecture.md) | Processes and run modes, repository layout, server modules, flows, jobs, security, Electron, testing, performance budgets |
| [data-model.md](./data-model.md) | Vault layout, note format, entities with priorities, locators, relation vocabulary, portability, migrations |
| [knowledge-system.md](./knowledge-system.md) | Notes, Markdown dialect, links, search, ingestion, concepts, knowledge graph, import/export |
| [learning-system.md](./learning-system.md) | Course structure, flashcards and FSRS, questions, quizzes, adaptive practice, mastery, planning, FIRe |
| [agent-system.md](./agent-system.md) | Providers and roles, chat modes, grounding, tool layer, permissions, undo, activity UI, generation, MCP |
| [ui.md](./ui.md) | UI principles, layout and the sticky-header rule, information architecture, screens, states, accessibility |
| [tech-stack.md](./tech-stack.md) | Selected technologies with rationale and dependency policy |

Implementation is planned in `docs/checklist/` (gated phases). Durable decisions are in `/DECISIONS.md`.
