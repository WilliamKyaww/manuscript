# Phase 12 — Agent runtime, tool layer and MCP

**Status:** Not started · **Branch:** `phase/12-agent-tools`

## Objective
A typed tool registry over the domain services with risk levels, a policy engine mapped to AI SDK tool
approvals, an action log with snapshots and undo, the agent runner, and an MCP server adapter.

## Why it exists
The controlled action layer between models and data (ADR-0012, ADR-0013, ADR-0014).

## Dependencies
Phase 11.

## Atomic tasks
- [ ] **12.01** Migration: `agent_actions`
- [ ] **12.02** `ToolDefinition` contract, registry and input/output validation; tests
- [ ] **12.03** Policy engine (risk defaults, per-tool overrides, bulk escalation) → AI SDK `toolApproval`; tests
- [ ] **12.04** Action log, snapshot store (`.skb/history/`) and undo framework; tests
- [ ] **12.05** Knowledge tools: `search_knowledge`, `get_note`, `list_notes`, `create_note`, `update_note`, `link_notes`, `move_note`, `delete_note`; tests incl. undo
- [ ] **12.06** Concept/graph tools: `get_concept`, `search_graph`, `create_concept`, `propose_relations`, `merge_concepts`; tests
- [ ] **12.07** Source tools: `search_sources`, `get_source`, `read_source`, `extract_concepts`; tests
- [ ] **12.08** Learning tools: `list_modules`, `get_module`, `get_lecture`, `get_mastery`, `get_weak_areas`, `get_due_reviews`, `get_deadlines`, `create_flashcards`, `create_quiz`, `record_answer`, `delete_cards`; tests
- [ ] **12.09** File tools: `read_file`, `move_file` with vault containment; traversal tests
- [ ] **12.10** Agent runner (ToolLoopAgent, per-mode instructions, `prepareStep` context, step/time limits); tests with scripted mock models
- [ ] **12.11** MCP server adapter (stdio + localhost Streamable HTTP with token; non-destructive subset); tests with an MCP client
- [ ] **12.12** Settings page: recent agent actions with undo; per-tool permission overrides
- [ ] **12.13** Security tests: instructions injected in sources cannot run destructive tools without approval
- [ ] **12.14** Docs: tool catalogue (generated from the registry), MCP setup for Claude Code/Desktop; STATE/FEATURES/journal updated

## Acceptance criteria
Every write is undoable; destructive tools always pause for approval; MCP clients can search and read
the knowledge base.

## Gate
- [ ] All tasks `[x]` · [ ] verify green · [ ] docs updated · [ ] merged

## Recommended commit messages
```text
feat(server): add typed tool registry with risk policy and approvals
feat(server): add action log with snapshots and undo
feat(server): expose knowledge tools over MCP
```
