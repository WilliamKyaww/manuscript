# Phase 0 — Research and product discovery

**Status:** In progress · **Branch:** `phase/00-research`

## Objective
Understand the problem space and the local Graphify reference implementation, decide what is worth
building, and establish the PRD, architecture, roadmap and documentation workflow before any product
code is written.

## Why it exists
The brief forbids one-shotting the application. Architecture, data model and roadmap decisions are the
most expensive to reverse, so they are made with evidence first.

## Dependencies
None.

## Atomic tasks

### Inspection
- [x] **0.01** Inspect the target repository (empty: `.git` only, no commits; remote `WilliamKyaww/study-knowledge-base`)
- [x] **0.02** Inspect the local Graphify repository: architecture, data model, algorithms, visualisation, MCP server, licence
- [x] **0.03** Verify the development toolchain (Node 24.14, npm 11.9, no pnpm/Bun, VS 2022 present) and test `node:sqlite` FTS5 support

### Research
- [x] **0.04** Research the PKM ecosystem (Notion, Obsidian, Anytype, Capacities, Heptabase, Tana, Logseq, Roam, Mem, Reflect, AFFiNE + discovered SiYuan, Recall, Obsidian AI plugins)
- [x] **0.05** Research AI/EdTech tools (NotebookLM/Gemini Notebook, TurboLearn, Quizlet, Anki, RemNote, StudyFetch, Knowt, Gizmo, lab study modes, Math Academy)
- [x] **0.06** Research learning science (retrieval practice, spacing, AI-tutor guardrails, FSRS, FIRe, mastery models)
- [x] **0.07** Research agent architecture (tool calling, AI SDK 7, Mastra, LangGraph.js, OpenAI Agents SDK, Claude Agent SDK, OpenCode, DeepSeek Harness, MCP 2026-07-28, RAG, GraphRAG/LightRAG)
- [x] **0.08** Evaluate the technology stack with current versions and risks

### Documentation
- [x] **0.09** Write research documents in `docs/research/` with Emulate/Improve/Borrow/Defer/Reject/Irrelevant classifications
- [x] **0.10** Write the PRD (`docs/prd/`: product, architecture, data model, knowledge, learning, agent, UI, tech stack)
- [x] **0.11** Record architectural decisions ADR-0001 … ADR-0023 in `DECISIONS.md`
- [x] **0.12** Write the gated checklist for Phases 0–22 (`docs/checklist/`)
- [x] **0.13** Write `FEATURES.md` (inventory with statuses)
- [x] **0.14** Write `AGENTS.md` and `CLAUDE.md` (agent workflow, conventions, British English, git rules)
- [x] **0.15** Write `README.md`, `STATE.md`, `THIRD_PARTY_NOTICES.md`
- [x] **0.16** Create the backlog (`docs/backlog/`: backlog, technical debt, research questions)
- [x] **0.17** Write the first journal entry (`docs/journal/2026-10-04-claude-opus-5.5.md`)

### Review
- [x] **0.18** British English and consistency pass over all Phase 0 documents (spelling scan, phase/ADR/backlog cross-references, 61 relative links verified)
- [x] **0.19** Present the architecture and roadmap to the user (summarised in the session on 4 October 2026)

## Tests
Documentation phase — no code. Verification is a review: links resolve, phase numbering is consistent
across PRD/checklist/backlog, ADR references exist, British spelling.

## Acceptance criteria
- Every document listed in the brief exists and is internally consistent.
- Each research document cites sources and classifies ideas.
- The checklist covers the whole roadmap with atomic tasks, tests, acceptance criteria and gates.

## Documentation requirements
This phase *is* documentation. The journal entry records the research performed and decisions taken.

## Gate
- [ ] All tasks above `[x]`
- [ ] Documents committed on `phase/00-research` and merged into `main` (`--no-ff`)
- [ ] `STATE.md` shows Phase 1 as next

## Recommended commit messages
```text
docs: add research, PRD, decisions and gated roadmap for the knowledge and learning OS
```
