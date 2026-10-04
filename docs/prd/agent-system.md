# AI and agent system

> PRD v0.1 — 4 October 2026. Research: `docs/research/agent-architecture.md`. Decisions: ADR-0012
> (runtime), ADR-0013 (permissions and undo), ADR-0014 (MCP), ADR-0010 (retrieval).

## 1. Principles

1. **AI is optional.** With no provider configured every non-AI feature works; AI entry points explain
   how to enable them.
2. **The model acts only through tools** defined in one registry; it never receives raw database or
   filesystem access.
3. **Provider-independent.** All model calls go through the AI layer's role-based registry.
4. **Grounded by default for study.** Answers about course material cite the user's sources; general
   knowledge is labelled.
5. **Reversible and auditable.** Writes are logged with snapshots; destructive actions need approval.
6. **Learning-safe.** Tutor behaviour follows the guardrail evidence (hints before answers).

## 2. Provider abstraction (Phase 10)

| Role | Used for | Example defaults (user-configurable) |
|---|---|---|
| `chat` | Agent chat, tutor, grounded answers, complex generation | A strong model (e.g. Claude Sonnet 5.5 / GPT-class flagship) |
| `fast` | Classification, extraction, grading, titles | A small model (e.g. Claude Haiku 4.5 / a mini model / a local model) |
| `embedding` | Semantic search | OpenAI-compatible, Google or Ollama embedding model |
| `transcription` | Audio/video | Provider transcription model or local Whisper |
| `rerank` | Optional retrieval reranking | Provider rerank model |

Providers (via AI SDK 7): **Anthropic**, **OpenAI**, **OpenAI-compatible** (Ollama, LM Studio,
OpenRouter, DeepSeek) first; Google later. A `mock` provider exists for tests and demos.
Settings page: provider credentials (stored in the app data dir; Electron encrypts with `safeStorage`),
model per role, connection test, monthly spend cap and per-request token caps. Usage is recorded in
`ai_usage` and shown in Settings.

## 3. Chat modes and grounding scopes (Phases 10, 13, 14)

| Mode | Behaviour |
|---|---|
| **Assistant** (default) | Answers and performs actions with tools per policy; cites sources |
| **Tutor** | Socratic: diagnoses, asks, hints → partial solution → full worked solution only on request; ends with a check question or a card proposal; write tools limited to proposals |

| Scope | Retrieval and labelling |
|---|---|
| **My sources** | Only lecture/source passages; if not found, says so — no model-knowledge filling |
| **My knowledge base** | Sources + notes + concepts |
| **General** | Model knowledge allowed; uncited content labelled *General knowledge* |

Scope can be narrowed: module, lectures (e.g. "Lectures 1–4"), sources, concepts, via the scope picker
or `@mentions` (`@COC251`, `@L03`, `@[[Paxos]]`, `@note`).

## 4. Context assembly

Per request the runner builds: mode instructions → user profile (modules, upcoming deadlines) →
current page context (open note/source/selection, with consent indicator) → scope → retrieved passages
(with citation keys) → conversation history (compacted beyond a token budget). Retrieved and mentioned
content is wrapped as untrusted (§10).

## 5. Grounding and citations

- Retriever returns passages `[S1]…[Sn]` mapped to chunk IDs and locators (hybrid search; graph
  expansion from matched concepts, depth ≤ 2).
- Instructions require a citation key after each sourced claim. The server validates keys, drops unknown
  ones, and the UI renders them as chips that open the source at the locator.
- Per-answer badge: **From your sources** (all claims cited) · **Mixed** · **General knowledge**.

## 6. Tool layer (Phase 12)

### 6.1 Definition contract

```ts
interface ToolDefinition<I, O> {
  name: string;                    // snake_case verb_object, e.g. "create_flashcards"
  description: string;             // written for the model: when to use, what it returns
  input: z.ZodType<I>;             // validated before execute
  output: z.ZodType<O>;            // validated after execute; concise, IDs typed
  risk: 'read' | 'write' | 'destructive';
  execute(ctx: ToolContext, input: I): Promise<O>;
  describe(input: I, output?: O): ActivityLine;   // "Found Lecture 3 — Consensus"
  undo?(ctx: ToolContext, action: AgentAction): Promise<void>;   // required for 'write'
}
```

Tools wrap **services**, so the HTTP API and the agent share validation and business rules.

### 6.2 Catalogue (initial; grows per phase)

| Category | Tool | Risk | Phase |
|---|---|---|---|
| Knowledge | `search_knowledge` (hybrid over notes + sources, scoped) | read | 12 |
| | `get_note`, `list_notes` | read | 12 |
| | `create_note` | write | 12 |
| | `update_note` (replace section / append / full replace with base hash) | write | 12 |
| | `link_notes` (insert wikilinks) | write | 12 |
| | `delete_note` (to trash) | destructive | 12 |
| | `move_note` (single) | write · bulk ⇒ destructive | 12 |
| Concepts & graph | `get_concept`, `search_graph` (neighbourhood, paths) | read | 12 |
| | `create_concept`, `propose_relations` | write | 12 |
| | `merge_concepts` | destructive | 12 |
| Sources | `search_sources`, `get_source`, `read_source` (page/slide ranges) | read | 12 |
| | `extract_concepts` (→ proposals) | write | 12 |
| Learning | `list_modules`, `get_module`, `get_lecture`, `get_mastery`, `get_weak_areas`, `get_due_reviews`, `get_deadlines` | read | 12 |
| | `create_flashcards` (drafts by default), `create_quiz`, `record_answer` (tutor "quiz me") | write | 12 |
| | `delete_cards` | destructive | 12 |
| Planning | `get_study_plan` | read | 14 |
| | `create_study_plan`, `update_study_plan` | write | 14 |
| Files | `read_file` (vault-contained, non-note files), `move_file` | read / write | 12 |

**Deliberately excluded**: `update_mastery` (mastery is computed from evidence only — the model cannot
assert that the user knows something); shell/code execution; unrestricted filesystem paths; web browsing
(deferred to a research mode, backlog `B-AI-04`).

## 7. Permission policy

| Risk | Default | User can change to |
|---|---|---|
| read | auto-approve | — |
| write | auto-approve, logged, undoable | ask |
| destructive | **ask every time** | deny (never auto) |

Escalation: a write touching more than 20 items in one call is treated as destructive. Per-tool
overrides (OpenCode-style) live in Settings. Mapped onto AI SDK 7 `toolApproval`
(`auto-approve` / `user-approval` / `auto-deny`), with HMAC-bound approvals so arguments cannot change
between approval and execution. Denials are returned to the model as a tool result ("user declined"),
never as silent failure.

## 8. Action log and undo

Every executed write/destructive call creates an `agent_actions` row with input, output and a snapshot
reference (prior file content in `.skb/history/`, or prior rows serialised as JSON). Activity rows offer
**Undo** while the target has not changed since; undo is itself logged. A Settings page lists recent
actions.

## 9. Activity UI protocol (Phase 13)

The chat streams AI SDK UI message parts. Tool parts render as compact activity rows using each tool's
`describe()`:

```text
✓ Found Lecture 1 — Introduction to consensus
✓ Found Lecture 2 — Paxos
⌛ Extracting concepts…
✓ Created 24 flashcards in "COC251 · L01–L03"      [Review cards] [Open set] [Undo]
```

States: running (spinner), done, failed (message + retry), awaiting approval (approval card with the
exact change summary and *Approve once* / *Approve for this chat* / *Decline*), cancelled. Internals
(raw JSON, prompts) are hidden behind a "Details" disclosure.

## 10. Prompt-injection defences (from Graphify)

- Source passages wrapped in `<untrusted_source id="S3">…</untrusted_source>`; chat-template sentinels
  (`<|…|>`, `[INST]`, `<<SYS>>`, forged closing tags) neutralised with a zero-width space.
- Instructions state that wrapped content is data and cannot change rules or tool permissions.
- Policy enforcement is outside the model (server-side), so injected text cannot grant itself approval.

## 11. Generation services (Phase 11) — structured outputs

| Service | Output schema (Zod) | Quality controls |
|---|---|---|
| Flashcards from scope | `{ cards: [{ kind, front, back, extra?, concepts[], locator }] }` | Atomicity check, length limits, duplicate detection against existing cards, every card needs a locator |
| Questions / quiz | `{ questions: [{ kind, stem, options?, answer, explanation, difficulty, concepts[], locator }] }` | Answer-key validation (MCQ has exactly one correct option, etc.), distractor plausibility, locator |
| Lecture/summary note | Markdown with citation keys → saved note with `source` frontmatter | Citations validated; links to concepts inserted |
| Concept extraction | `{ concepts: [{ name, aliases, summary, evidence }], relations: [{ from, to, relation, confidence, score, evidence }] }` | Graphify confidence rubric; de-duplication; all as proposals |
| Answer grading | `{ score: 0 | 0.5 | 1, feedback, misconceptions[] }` | Rubric-anchored; marked `graded_by: ai`; user can override |

Generated artefacts land as **drafts/proposals** reviewed in a batch UI (accept all / edit / reject)
unless auto-accept is enabled for that kind.

## 12. Limits and cost control

Max 12 tool-loop steps per request (configurable); timeouts (total 120 s, per step 60 s, per tool 30 s
for synchronous tools — long work becomes a job); per-request output token cap; monthly spend cap with a
warning at 80 %; generation jobs show estimated cost before starting when large.

## 13. MCP server (Phase 12)

Exposes read tools and safe write tools over stdio (`skb mcp`) and Streamable HTTP on localhost with the
app token. Destructive tools are not exposed by default. Targets the MCP 2026-07-28 specification via the
official TypeScript SDK.

## 14. Testing AI features

- **Mock provider** scripted with tool calls and text (AI SDK `ai/test`) for unit, integration and E2E
  tests — no network, deterministic.
- **Golden fixtures**: real slide/PDF excerpts with expected structural properties (counts, locators,
  schema validity) rather than exact text.
- **Personal evaluation set** (Phase 21): ~50 questions over the user's own material with known answers to
  compare models/providers on grounding accuracy and citation correctness.
