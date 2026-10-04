# Agent and AI application architecture research

> Researched 4 October 2026 by Claude Opus 5.5. The question: *what runtime should sit between the chat
> box and the application's data, and how should it stay provider-independent, safe and testable?*

## 1. Requirements recap (from the brief)

```text
Chat → Model → Tool selection → Application tools → Application state/data → Result → Chat + UI update
```

- Model provider replaceable (Anthropic, OpenAI, local/open-weight).
- The model never touches internals directly — only a controlled tool/action layer.
- Permission levels: read-only, safe writes, potentially destructive (needs confirmation).
- Activity UI ("✓ Found Lecture 1 … ✓ Created 24 flashcards").
- Not a coding assistant; do not clone a coding-agent harness without need.

## 2. Model-native tool calling and structured outputs

All major providers now support function/tool calling with JSON-Schema-described inputs, multiple tool
calls per step, and schema-constrained structured outputs. The portable abstraction is therefore
*"tools with JSON-Schema inputs + a loop that executes them and feeds results back"*, which every
framework below implements. Structured outputs (Zod → JSON Schema) are the right mechanism for
generating cards, questions and extracted concepts: validated, typed, and repairable on failure.

## 3. Options surveyed

### 3.1 Vercel AI SDK (TypeScript) — **current major version 7** (`ai@7.0.127`)

- **AI SDK 6** (Dec 2025) made agents first-class (`ToolLoopAgent`), added tool execution approval,
  stable MCP client support, DevTools and reranking ([Vercel blog: AI SDK 6](https://vercel.com/blog/ai-sdk-6)).
- **AI SDK 7** ([changelog](https://vercel.com/changelog/ai-sdk-7),
  [migration guide](https://ai-sdk.dev/docs/migration-guides/migration-guide-7-0)):
  - `ToolLoopAgent` (in-request loops) and `WorkflowAgent` (durable, persisted between steps, survives
    restarts and *delayed approvals*; needs `@ai-sdk/workflow`).
  - **Tool approval policies** per tool: `'user-approval' | 'auto-approve' | 'auto-deny' | (input) => …`,
    with optional **HMAC signing** that binds approved inputs to the approval token (prevents argument
    tampering between approval and execution).
  - **Typed tool context** (`contextSchema` + `context` in `execute`) and shared `runtimeContext`
    available in `prepareStep`.
  - Granular **timeouts** (`totalMs`, `stepMs`, `chunkMs`, `toolMs`) raising `TimeoutError`.
  - Lifecycle callbacks (`onStart`, `onStepEnd`, `onEnd`, `onToolExecutionStart/End`), telemetry
    registration (`@ai-sdk/otel`), MCP Apps, provider skills/uploads.
  - Breaking: `system` → `instructions`; `fullStream` → `stream`; `stepCountIs` → `isStepCount`;
    stateless `toUIMessageStream({ stream, … })` helpers; **ESM-only, Node 22+**.
  - Providers: `@ai-sdk/anthropic@4`, `@ai-sdk/openai@4`, `@ai-sdk/google@4`,
    `@ai-sdk/openai-compatible@3` (Ollama, LM Studio, OpenRouter, DeepSeek), community
    `ollama-ai-provider-v2`; embeddings (`embed`, `embedMany`) and `rerank` behind the same abstraction;
    `@ai-sdk/react@4` `useChat` renders streamed tool-call parts including approval states.
- **Fit:** provider abstraction, tool loop, approvals, streaming UI protocol and test doubles
  (`ai/test` mock models) — exactly our needs, as a library rather than a framework.

### 3.2 Mastra

Batteries-included TS framework: agents, workflows, RAG, memory, evals, a studio UI, model router,
suspend/resume approvals ([comparison](https://particula.tech/blog/mastra-vs-langgraph-vs-vercel-ai-sdk-typescript-agents)).
**Verdict: reject for core.** Its storage, memory and RAG abstractions would duplicate our domain model
(vault + SQLite + concept graph) and add a large dependency surface. Built on the AI SDK anyway.

### 3.3 LangGraph.js

Low-level stateful graph orchestration with durable execution and checkpointers
([comparison](https://www.developersdigest.tech/blog/mastra-vs-langgraph-js-2026)).
**Verdict: reject for now.** Our flows are linear tool loops plus a few deterministic pipelines
(ingestion, generation) that are simpler as plain code + a job queue. Revisit only if multi-agent,
branching orchestration becomes necessary.

### 3.4 OpenAI Agents SDK (TS port)

Agent/Runner, handoffs, guardrails, sessions. **Verdict: reject.** OpenAI-centric primitives; the AI SDK
already offers provider independence.

### 3.5 Claude Agent SDK

The Claude Code harness as a library (filesystem/bash tools, permissions, sub-agents, hooks).
**Verdict: reject for the in-app agent** — it is a coding-agent harness and Anthropic-specific. It is,
however, a natural *client* of our MCP server (§5) for power-user workflows in Claude Code.

### 3.6 OpenCode (reference architecture)

Open-source coding agent. Architecture: **a local server (Hono) that all clients (TUI, desktop, IDE,
SDK) talk to over HTTP**, AI SDK for providers, a per-project **SQLite** database for sessions, automatic
compaction of long conversations, OpenAPI-generated SDK
([architecture write-up](https://cefboud.com/posts/coding-agents-internals-opencode-deepdive/),
[DeepWiki](https://deepwiki.com/anomalyco/opencode)).
Permission model ([docs](https://opencode.ai/docs/permissions/)): each tool is `allow` / `ask` / `deny`,
configurable globally, per tool and per agent; object syntax with glob patterns where **the last
matching rule wins**; approval prompt offers *approve once*, *approve matching requests for this
session*, or *reject*.
**Verdict: borrow the architecture and permission UX** (it independently validates our local-server +
AI SDK + SQLite design). Not a dependency.

### 3.7 DeepSeek Harness

Released with DeepSeek V4-Pro as an MIT-licensed **developer preview**; Node.js/TypeScript; built on the
**Cordis** meta-framework where *"models, tools, skills, sessions, sandboxes, filesystems, loops,
orchestration, and UI are ALL implemented as plugins"*; ships a web UI on `127.0.0.1:3080`; the README
warns *"THERE WILL BE COMPATIBILITY-BREAKING CHANGES"*
([GitHub](https://github.com/deepseek-ai/deepseek-harness),
[The New Stack](https://thenewstack.io/deepseek-harness-open-source-plugins/)).
**Verdict: reject as a dependency** (pre-release, coding-oriented, unstable API). **Borrow idea:**
treat tools, providers and parsers as registrable plug-ins behind small interfaces — but internal,
typed and versioned with the app, not a public plug-in system.

## 4. Decision: a lightweight in-house runtime on AI SDK 7

```text
┌──────────────────────────── server ────────────────────────────┐
│ Chat route ──► AgentRunner (AI SDK ToolLoopAgent)              │
│                   │  instructions per mode (Ask/Tutor/Agent)   │
│                   │  prepareStep: context assembly             │
│                   ▼                                            │
│              ToolRegistry ── policy (read/write/destructive)   │
│                   │            → toolApproval mapping          │
│                   ▼                                            │
│   Domain services (notes, sources, concepts, cards, quizzes,   │
│   mastery, planning, graph, search)  ◄── also used by HTTP API │
│                   │                                            │
│              ActionLog (+ snapshots for undo)                  │
└────────────────────────────────────────────────────────────────┘
          ▲ UI message stream (tool parts, approvals)   ▲ MCP adapter (Phase 12)
       web useChat                                 Claude Code / Desktop
```

Rationale:
1. **One tool definition, three consumers**: the in-app agent, the HTTP API (via services) and an MCP
   server for external agents.
2. **Permissions are data**: each tool declares `risk: 'read' | 'write' | 'destructive'`; a policy maps
   risk + user settings → AI SDK `toolApproval` (`auto-approve` / `user-approval` / `auto-deny`).
   OpenCode-style per-tool overrides are supported in settings.
3. **Every write is logged** with inputs, outputs and a pre-change snapshot, enabling Undo and an
   audit trail (Mem 2.0's version-history lesson).
4. **Provider independence** through AI SDK providers; model *roles* (`chat`, `fast`, `embedding`,
   `transcription`) are configured separately.
5. **Testability**: deterministic mock models (`ai/test`) script tool calls, so agent flows are unit-
   and E2E-testable without network or cost.
6. No durable `WorkflowAgent` initially: approvals happen within a live request/stream. Long-running
   work (ingestion, bulk generation) runs in our **job queue**, which the agent can start and observe.

## 5. MCP (Model Context Protocol)

- **Current spec: 2026-07-28** ([blog](https://blog.modelcontextprotocol.io/posts/2026-07-28/),
  [changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)): stateless protocol
  core (initialise handshake removed; protocol version and capabilities travel in each request's
  `_meta`), protocol-level sessions removed from Streamable HTTP, multi-round-trip requests,
  cacheable list results, authorisation hardening (credentials bound to their issuer), a formal
  extensions framework; **Roots, Sampling and Logging deprecated**; HTTP+SSE transport deprecated.
- TypeScript SDK: `@modelcontextprotocol/sdk@1.32.0`.
- **Our use:** expose a curated subset of the tool registry as an MCP server (stdio for Claude
  Desktop/Code; Streamable HTTP on localhost with the app's token). Destructive tools are excluded from
  MCP by default because our approval UI cannot intercept external clients. The in-app agent may later
  *consume* external MCP servers (AI SDK MCP client), e.g. a university-timetable server — deferred.

## 6. Agent file tools

The brief lists `create_file / read_file / edit_file / move_file / delete_file`. Patterns adopted:

- **Vault containment**: every path is resolved and must stay inside the vault (Graphify's
  `validate_graph_path` pattern); `.skb/` internals are never exposed.
- **Edits as targeted replacements** (exact search → replace, or section-level replacement by heading),
  validated against the current content hash to avoid lost updates.
- **Deletes are moves to `.skb/trash/`**; `delete_*` is classed *destructive* and needs approval.
- **Snapshots** before every agent write (`.skb/history/`), surfaced as Undo in the activity UI.

## 7. Retrieval (RAG) for source-grounded answers

| Technique | Evidence | Adoption |
|---|---|---|
| Hybrid lexical (BM25) + embeddings, fused by rank | Anthropic *Contextual Retrieval*: contextual embeddings + contextual BM25 cut top-20 retrieval failures by **49 %**, and **67 %** with reranking (5.7 % → 1.9 %) ([Anthropic](https://www.anthropic.com/engineering/contextual-retrieval)) | FTS5 BM25 always; embeddings optional; Reciprocal Rank Fusion |
| Contextual chunk headers | Same source | Each chunk stores its document/section path (cheap, deterministic); LLM-written chunk context is optional (cost) |
| Structure-aware chunking | Chunking studies, e.g. [Reconstructing Context (2025)](https://arxiv.org/abs/2504.19754) | Chunk on page/slide/heading boundaries, ~300–800 tokens, small overlap; locators preserved |
| Reranking | Same source | Optional via AI SDK `rerank` when a reranking model is configured |
| Graph-augmented retrieval | GraphRAG (community summaries; costly re-indexing) vs LightRAG (entity/relation descriptions, cheaper incremental updates) ([LightRAG](https://arxiv.org/abs/2410.05779)) and Graphify (lexical seeds + traversal) | LightRAG-style: concepts and relations carry short descriptions; matched concepts expand to linked lectures/notes (depth ≤ 2) |

## 8. Grounding and citations protocol

- The retriever returns passages with stable citation keys (`[S3]`) mapped to chunk IDs and locators.
- Instructions require citing keys for every claim drawn from sources; the server validates that cited
  keys exist and strips invalid ones.
- Modes: **My sources** (answer only from passages; say so when the answer is not there), **Knowledge
  base** (sources + notes), **General** (model knowledge allowed; any uncited content is labelled
  *General knowledge* in the UI).

## 9. Prompt-injection posture

Source text is untrusted. Following Graphify: wrap passages in delimiters, neutralise chat-template
sentinels, instruct that content is data, keep tool authority with the user (destructive tools always
need approval, regardless of what a document says), and never let retrieved text alter tool policies.

## 10. Summary of decisions

| Decision | Record |
|---|---|
| AI SDK 7 as provider + tool-loop layer; in-house registry, policy and action log | ADR-0012 |
| Risk-classified tools with approval for destructive actions; snapshots + undo for writes | ADR-0013 |
| MCP server adapter over the same registry (Phase 12) | ADR-0014 |
| Hybrid retrieval with locator-carrying chunks; embeddings optional | ADR-0010 |
