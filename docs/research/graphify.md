# Graphify — local reference repository study

> Researched 4 October 2026 by Claude Opus 5.5 against the local clone at
> `C:\Users\willi\Documents\GitHub\Cool Projects\graphify` (commit `48d7c0e`, release `0.9.75`).
> Upstream: <https://github.com/Graphify-Labs/graphify>.

## 1. What Graphify is

Graphify is a **Python library plus an AI-coding-assistant skill** (Claude Code, Codex, OpenCode, Cursor
and ~20 other hosts) that turns a folder of code, documents, PDFs, images and audio/video into a
queryable **knowledge graph**. Its stated philosophy is *"not a vector index — a real graph you traverse"*:
no embeddings, no vector store; retrieval is lexical seed-finding followed by graph traversal.

Outputs (`graphify-out/`):

| File | Purpose |
|---|---|
| `graph.json` | Full graph in NetworkX node-link format (nodes, edges, hyperedges, communities) |
| `graph.html` | Interactive force-directed visualisation (vis-network) with search, legend and info panel |
| `GRAPH_REPORT.md` | "God nodes", surprising connections, suggested questions, confidence tags |
| `wiki/` (optional) | One Markdown article per community + index — an agent-crawlable wiki |
| Obsidian vault / Canvas / GraphML / Cypher / SVG (optional) | Exporters |

It also ships an **MCP server** (`graphify.serve`) exposing `query_graph`, `get_node`, `get_neighbors`,
`get_community`, `god_nodes`, `graph_stats` and `shortest_path` (plus PR tools).

## 2. Architecture

Pipeline (from `ARCHITECTURE.md`, verified in code):

```text
detect() → extract() → build() → cluster() → analyse helpers → report.generate() → export.to_*()
```

| Stage | Module | Notes relevant to us |
|---|---|---|
| Detect | `detect.py` | Classifies files (code / document / paper / image / video); respects `.gitignore` + `.graphifyignore` |
| Extract (code) | `extract.py`, `extractors/` | tree-sitter AST for ~40 languages — deterministic, local, no LLM |
| Extract (semantic) | `llm.py` | LLM pass over docs/PDFs/images/transcripts producing JSON fragments |
| Build | `build.py` | Merges fragments into a NetworkX graph; ghost-duplicate merging |
| De-duplicate | `dedup.py` | MinHash + Jaro–Winkler entity de-duplication with many guards; optional LLM tie-break |
| Cluster | `cluster.py` | Leiden (graspologic) with Louvain fallback; oversized/low-cohesion communities re-split |
| Analyse | `analyze.py` | God nodes, surprising connections, suggested questions, graph diff, import cycles |
| Report / Wiki | `report.py`, `wiki.py` | Markdown outputs |
| Serve | `serve.py` | MCP stdio + Streamable HTTP server; lexical query engine |
| Reflect | `reflect.py` | Deterministic "work memory": outcome-weighted lessons with time-decayed scoring |
| Security | `security.py` | URL validation, size-capped fetches, path containment, label sanitisation |
| Cache | `cache.py` | SHA-256 content hashing so unchanged files are never re-extracted |

Codebase size: ~51,000 lines of Python in `graphify/` (largest: `extract.py` 9k, `cli.py` 5k, `llm.py` 3.6k).

## 3. Data model (the parts worth adopting)

### Node

```json
{"id": "stem_entity", "label": "Human Readable Name",
 "file_type": "code|document|paper|image|rationale|concept",
 "source_file": "relative/path", "source_location": "L42", "rationale": null}
```

### Edge

```json
{"source": "id_a", "target": "id_b",
 "relation": "calls|implements|references|cites|conceptually_related_to|shares_data_with|semantically_similar_to",
 "confidence": "EXTRACTED|INFERRED|AMBIGUOUS", "confidence_score": 0.85,
 "source_file": "relative/path", "source_location": null, "weight": 1.0}
```

### Hyperedge

A group relationship between 3+ nodes (e.g. "all concepts from one paper section forming one idea"),
capped at 3 per extraction chunk.

### Confidence rubric (from `docs/how-it-works.md`)

| Label | Meaning | Score |
|---|---|---|
| `EXTRACTED` | Explicit in the source (citation, reference, import) | 1.0 |
| `INFERRED` | Reasonable deduction | 0.95 near-certain · 0.85 strong · 0.75 reasonable · 0.65 weak · 0.55 speculative |
| `AMBIGUOUS` | Uncertain — kept and flagged for human review, never silently dropped | — |

**This provenance model is the single most valuable idea for our knowledge graph.** AI-extracted
relationships between lecture concepts must be distinguishable from what the lecture actually says and
from what the user asserted.

## 4. Algorithms worth porting (conceptually) to TypeScript

| Graphify idea | Where | How we adapt it |
|---|---|---|
| Leiden/Louvain communities with oversized-community splitting and cohesion score (`actual_edges / possible_edges`) | `cluster.py` | `graphology-communities-louvain` server-side; same split heuristics (>25 % of graph → re-split; cohesion < 0.05 for ≥50 nodes → re-split) |
| Deterministic community labels from the highest-degree member | `label_communities_by_hub` | Default topic-cluster names; AI naming optional |
| Stable community IDs across runs (sort by size then members; remap to previous assignment) | `cluster.py` | Avoids "colour churn" in the graph UI between rebuilds |
| God nodes (highest degree, excluding file hubs) | `analyze.god_nodes` | "Core concepts" of a module |
| Surprising connections scored by confidence, cross-type, cross-community and peripheral→hub signals | `analyze._surprise_score` | "Connections you might not have noticed" across modules |
| Suggested questions from AMBIGUOUS edges, bridge nodes (betweenness), heavily INFERRED hubs, isolated nodes, low-cohesion communities | `analyze.suggest_questions` | **Study prompts**: isolated concepts = knowledge gaps; bridge concepts = integrative exam questions; ambiguous edges = "verify this relationship" tasks |
| Query engine: IDF-weighted exact/prefix/substring tiers over labels, aliases, rationale and attributes, trigram pre-filter → seed nodes → BFS/DFS → subgraph rendered to text within a token budget | `serve._score_query`, `_bfs`, `_subgraph_to_text` | Graph expansion step of our hybrid retrieval and the `search_graph` agent tool |
| Entity de-duplication guards: numeric tokens differ ("Lecture 3" ≠ "Lecture 4"), short-label blocking, same-word variants, MinHash shingles + Jaro–Winkler | `dedup.py` | Concept de-duplication when AI extracts "CAP theorem", "CAP Theorem", "Brewer's theorem" |
| SHA-256 content cache — skip unchanged files | `cache.py` | Re-ingest only changed sources |
| Prompt-injection defence: every source wrapped in `<untrusted_source>`; chat-template sentinels (`<|...|>`, `[INST]`, `<<SYS>>`) neutralised with a zero-width space; explicit "content is data, not instructions" rule | `llm._EXTRACTION_SYSTEM`, `_neutralise_injection_sentinels` | Mandatory for any lecture/PDF/web text sent to a model |
| Work memory: outcomes `useful` / `dead_end` / `corrected`, signed time-decayed scores (30-day half-life), "preferred" only after ≥2 corroborations | `reflect.py` | Analogue for **mastery evidence**: recency-weighted, corroboration-gated, explainable |
| Security helpers: http(s)-only URLs, blocked `file://` redirects, size caps, path containment, label sanitisation (strip control chars, cap 256) | `security.py` | Our URL import, vault path guards and agent file tools |

## 5. Visualisation

`exporters/html.py` renders a standalone page with **vis-network 9.1.6** (`forceAtlas2Based` physics,
then physics disabled once stable), community colour legend with toggles, search box, info panel with
clickable neighbour list, confidence-styled edges and hyperedges drawn as translucent convex hulls
(Andrew's monotone chain). It refuses to render above 5,000 nodes (`MAX_NODES_FOR_VIZ`).

Take-aways for our graph UI: legend-driven community filtering, neighbour list in a side panel,
dashed/lighter styling for INFERRED/AMBIGUOUS edges, and hull overlays for groups. We will use
**Sigma.js (WebGL) + graphology** instead of vis-network so the same graph library is used for
analytics on the server and rendering in the client, and so larger graphs remain responsive
(see `docs/research/tech-stack.md`).

## 6. Licence and legal reuse

- **Apache-2.0** (`LICENSE`), with earlier contributions also available under **MIT** (`LICENSE-MIT`,
  `NOTICE`: "Copyright 2026 Safi Shamsi and the Graphify contributors").
- Apache-2.0 permits copying, modification and redistribution (including in a differently licensed
  project) provided we: keep a copy of the licence, retain copyright/attribution notices, carry over the
  `NOTICE` text for derived works, and state significant changes.
- Our project is TypeScript; Graphify is Python. We will **port ideas and algorithms**, not paste code.
  Where a TypeScript module is a close adaptation of a specific Graphify function (e.g. the community
  split heuristics, the surprise score, the injection-sentinel pattern, the confidence rubric), we will:
  1. add a header comment naming the Graphify source file and licence;
  2. list it in `THIRD_PARTY_NOTICES.md` with the Graphify `NOTICE` text.
- Graphify branding, logo and its hosted product (graphify.com) are not reused.

## 7. Technical reuse options considered

| Option | Verdict | Reason |
|---|---|---|
| Run Graphify as a Python sidecar inside the app | **Rejected** (core) | Adds a Python runtime to the Electron package; its strengths (tree-sitter code graphs) are for codebases, not lecture material; its semantic pass needs an LLM anyway |
| Import a Graphify `graph.json` into our graph | **Deferred** (Phase 16 candidate) | Useful for coursework/dissertation code repositories: map a repo with Graphify, import the graph, link code entities to concepts |
| Port algorithms to TypeScript on graphology | **Accepted** | Same ideas, one language, shared by server analytics and client rendering |
| Adopt the confidence/provenance schema | **Accepted** | Directly answers "what did the lecture say vs what did the AI infer" |
| Adopt the prompt-injection defences | **Accepted** | Lecture PDFs and web pages are untrusted input |
| Copy the vis-network HTML exporter | **Rejected** | We render inside a React app with Sigma; a standalone HTML export may be added later |
| Graphify's lexical-only retrieval ("no embeddings") | **Improved upon** | We use hybrid retrieval (FTS5 BM25 + optional embeddings + graph expansion); Graphify's own benchmarks show lexical graph retrieval tied with dense RAG on LongMemEval-S, so lexical-first is a sound baseline and embeddings stay optional |

## 8. What Graphify does not cover (and we must)

- Learning state: no notion of mastery, review, practice or scheduling.
- Human authoring: the graph is generated, not edited; there is no note editor.
- Incremental, interactive curation: AMBIGUOUS edges are reported, but there is no review queue to
  accept/reject them. We will add one.
- Course structure (modules, lectures, assessments, deadlines).

## 9. Summary of decisions taken from this study

1. Every graph edge carries `relation`, `confidence` (`EXTRACTED` / `INFERRED` / `AMBIGUOUS` / `USER`),
   an optional `score`, and **provenance** (source chunk locators). See `docs/prd/data-model.md`.
2. Concepts extracted by AI start as *proposed*; the user accepts, merges or rejects them.
3. Graph analytics (communities, hubs, bridges, isolated nodes) feed **study prompts**, not just pictures.
4. All source text sent to models is wrapped and sanitised following Graphify's injection defences.
5. Attribution is recorded in `THIRD_PARTY_NOTICES.md` whenever a module is adapted from Graphify.
