# Knowledge system — "What do I know?"

> PRD v0.1 — 4 October 2026.

## 1. Notes

| Capability | Behaviour | Phase |
|---|---|---|
| Create / open / edit / save | Markdown files in the vault; editor saves with conflict detection (content hash) | 3 |
| Rename / move | File renamed atomically; incoming wikilinks optionally rewritten (preview first) | 3 |
| Delete | Moved to `.skb/trash/`; restorable for 30 days | 3 |
| Folders | Free folder structure; tree view; drag to move | 3 |
| Frontmatter properties | Typed editor for known keys (`type`, `tags`, `aliases`, `module`, `lecture`, `concepts`); raw YAML for the rest | 3 |
| Templates | `Templates/*.md` with `{{title}}`, `{{date}}`, `{{module}}`, `{{lecture}}` substitution | 3 |
| Attachments | Images/files stored beside notes (default `Attachments/`), embedded with `![[…]]` | 3 |
| External edits | File watcher re-indexes changes made in VS Code/Obsidian; open editors warn and reload | 3 |
| History | Snapshots before agent edits (Phase 12); vault can also be a Git repo (user's choice) | 12 |

## 2. Markdown dialect (Obsidian-compatible)

| Syntax | Example | Notes |
|---|---|---|
| CommonMark + GFM | tables, task lists, strikethrough, autolinks, footnotes | |
| Wikilinks | `[[Note]]`, `[[Note\|alias]]`, `[[Note#Heading]]` | Block refs `#^id` are parsed but not created (no block identity) |
| Embeds | `![[Note]]`, `![[image.png]]`, `![[slides.pdf#page=3]]` | |
| Tags | `#consensus`, `#cs/distributed` | Not inside code |
| Callouts | `> [!note] Title`, `> [!warning]-` (foldable) | |
| Highlights / comments | `==text==`, `%% hidden %%` | |
| Maths | `$…$`, `$$…$$` (KaTeX) | |
| Diagrams | ```` ```mermaid ```` | Rendered lazily |
| Code | fenced with language | Syntax highlighted |

Parsing is shared (`@skb/core/markdown`): the server uses it for indexing, the client for rendering and
autocompletion, so both agree on what a link or tag is.

## 3. Links, backlinks and resolution

Resolution order for `[[X]]` (case-insensitive, Unicode-normalised; implemented in
`@skb/core/markdown` and shared by the index and the editor):

1. A note whose file name (without `.md`) equals X; then one whose frontmatter `title` equals X; then
   a note alias equal to X. Ambiguity (two notes named X) prefers a note in the linking note's own
   folder, then the shortest vault path (as Obsidian does), and is reported.
2. A **concept** whose name or alias equals X → links to the concept page (Phase 6; names and aliases
   share one case-folded namespace, so this is never ambiguous — ADR-0029).
3. An attachment whose file name equals X.
4. Otherwise **unresolved** — shown distinctly; selecting it in the preview offers **Create note**
   (next to the linking note) or **Create concept** (named after the link).

Targets with a folder (`[[Folder/X]]`, Markdown links such as `[t](../X.md)`) resolve relative to the
linking note, then from the vault root (`/X` means only this), then by path suffix. The user-facing
rules and the differences from Obsidian (ADR-0026) are in `docs/guide/markdown.md`.

Backlinks panel shows linked mentions (with context lines) and **unlinked mentions** (plain-text
occurrences of the note title/aliases), each with a one-click "link" action.

## 4. Search (Phase 4; semantic in Phase 10)

- **Quick switcher** (`Ctrl+O`): fuzzy title/alias match over notes, concepts, sources, modules.
- **Full-text search** (`Ctrl+Shift+F`): FTS5 BM25 over notes (source chunks from Phase 5) with column
  weights (title and aliases 10, headings 4, body 1, tags 2), highlighted snippets, filters (type, tag,
  folder, module; source kind from Phase 5; date in the backlog, B-SE-01), operators (`"phrase"`,
  `-exclude`, `OR`, `tag:`/`#tag`, `module:`, `type:`, `folder:`, negated filters). Words match as
  prefixes; several tags must all apply, other repeated filters are alternatives; counts stop at 1,000.
  The parser (`@skb/core` `search/query.ts`) quotes every term, so input never reaches FTS5 as syntax.
  Implemented in Phase 4; user guide `docs/guide/search.md`.
- **Hybrid** (Phase 10): BM25 and embedding results fused with Reciprocal Rank Fusion (k = 60);
  optional reranking; "Related notes" panel from embeddings.
- Index updates are incremental and transactional with each write; a full rebuild is a background job.

## 5. Sources and ingestion

### 5.1 Pipeline

```text
import (upload / path / URL)
  → store original in Sources/<module or Inbox>/ (sha256; de-duplicate identical files)
  → detect type (extension + magic bytes)
  → parser → NormalisedDocument { title, sections[] (page/slide/heading/segment), metadata }
  → chunker (section-aware, ~300 estimated tokens, small overlap, context prefix "Doc › Section")
  → index: chunks_fts (+ embeddings if enabled)
  → (AI, optional) summary, concept extraction, proposals            ← Phase 11/15
```

Each stage is idempotent and keyed by `sha256 + parser version`, so unchanged files are never
re-processed (Graphify's cache lesson) and a parser upgrade can re-run selectively.

### 5.2 Parsers by phase

| Type | Phase | Output sections | Notes |
|---|---|---|---|
| Markdown, plain text | 5 | headings / paragraphs | |
| PDF | 5 | one per page | pdf.js text layer; scanned PDFs flagged "no text layer" until OCR (Phase 11) |
| PPTX | 5 | one per slide (+ speaker notes part) | In-house zip/XML parser |
| DOCX | 5 | headings | In-house `word/document.xml` reader → Markdown-style blocks (ADR-0019 "DOCX change") |
| Web page (URL) | 5 (optional) | headings | http(s) only, size cap, timeout, no `file://` redirects |
| Images | 11 | one segment | OCR or vision-model description |
| Audio / video | 11 | timed segments | Transcription provider; timestamps become locators |
| Graphify `graph.json` | 16 | — | Imports a code graph for coursework repos |

### 5.3 Source viewer

PDF viewer (pdf.js) with page thumbnails, text selection, "make card/question from selection",
jump-to-locator from citations; slide viewer showing slide text + speaker notes; Markdown/DOCX rendered
view. Every view shows which concepts, notes and cards derive from the current page/slide.
Implemented in Phase 5: the viewers, thumbnails, selection and deep links (`docs/guide/sources.md`);
selection actions arrive with cards and questions (Phases 8–9), derived-artefact panels with them.

## 6. Concepts

- A **concept** is the atomic unit of understanding (e.g. *Paxos*, *CAP theorem*, *backpropagation*).
- Concepts have a name, aliases, a short summary, optional backing note, module/topic memberships,
  relations, and linked cards/questions → mastery.
- Created manually (Phase 6), from unresolved links, or **proposed by AI extraction** (Phase 11) and
  accepted via the Inbox.
- **De-duplication** (Phase 11): exact/alias match → normalised match → fuzzy match guarded by
  Graphify-style rules (numeric tokens differ ⇒ different; very short labels need exact match) →
  optional LLM tie-break; merges keep aliases and redirect all references.
- The **concept page** shows: summary, backing note, lectures/sources covering it (with locators),
  related concepts by relation type, notes mentioning it, cards/questions, mastery with components.

## 7. Knowledge graph (Phase 7)

### 7.1 Model

| Nodes | Edges |
|---|---|
| concepts, notes, sources, lectures, modules (+ topics on request) | stored `relations` (typed, with confidence and status); computed: wikilinks (`links_to` between notes and to sources, concept `mentioned_in` note), backing notes (`covered_in`), course membership (`part_of`) — data-model.md §5.5 |

Assembled server-side with graphology (`modules/graph/assemble.ts`) and cached in memory. A version
counter, bumped by `vault.changed`, `sources.changed` and `data.changed` events, marks the cache
stale; the next request rebuilds the graph, and keeps the previous analytics if a fingerprint of the
nodes, names, modules and edges is unchanged (a note saved without changing a link). Payloads are
filtered server-side: node types (topics off by default), module, relation, confidence, status
(accepted by default; rejected never), unlinked notes and sources (off), and a size limit (5,000)
that keeps concepts and the course first, then the best-connected rest. Node ids are entity ids
(`con_…`, `note_…`, …), so every node has a page.

### 7.2 Analytics (adapted from Graphify, attributed)

Run on the "semantic" view: knowledge nodes (not modules, lectures or topics) joined by accepted,
non-structural edges, undirected, parallel edges merged. Deterministic: seeded random sources, id
order everywhere.

| Analysis | Algorithm | Study use |
|---|---|---|
| Communities | Louvain (seeded); split communities > 25 % of connected nodes (min 10); re-split cohesion < 0.05 at ≥ 50 members; lone nodes in none; ids stable across rebuilds (greedy overlap with the previous assignment, persisted in `graph_communities`); named after the best-connected concept | Topic clusters; colour legend |
| Core concepts | Distinct semantic neighbours | "Know these first" |
| Bridges | Brandes betweenness, exact up to 1,000 nodes, else 200 seeded sample sources | Integrative/essay questions |
| Gaps | Concepts with ≤ 1 semantic neighbour | Link, write or relate |
| Surprising connections | Confidence (ambiguous 3, inferred 2, else 1) + different modules 2 + different communities 1 + peripheral (≤ 2) → hub (≥ 5) 1; kept only with a structural signal; one per pair of communities | "Connections you might have missed" |
| Paths | Breadth-first shortest path; "semantic" paths never pass through modules, lectures or topics | "How does X relate to Y?" |
| Inferred / ambiguous relations | Confidence filter | "Check" prompts that lead to the concept's relations |

Study prompts (`analytics/prompts.ts`): check, gap, bridge, connection, cluster (cohesion < 0.15 at
≥ 5 members); at most three of each, twelve in all, interleaved; each carries actions (open the page,
review relations, show in the graph). A report can be narrowed to one module.

### 7.3 Graph UI

Global graph (`/graph`, Sigma.js 3 on graphology) with ForceAtlas2 (LinLog) in a module worker,
communities starting apart on a sunflower spiral; a cluster legend with toggles (or colour by type);
search-to-focus; a side panel with the node's connections grouped by relation, **Open**, and a
path finder, or — with nothing selected — the report's prompts, core concepts and gaps; filters for
types, module, proposed relations and unlinked items. Edge style by confidence: solid =
USER/EXTRACTED, dashed = INFERRED, dotted = AMBIGUOUS (a patterned edge program adapted from
Sigma's). Local graphs (depth 1–2, never expanding through course structure) on concept pages and in
the Notes **Graph** tab, with the direct connections listed beneath. Relations are added, accepted
and rejected on concept pages. Without WebGL the canvas is replaced by an explanation; the lists
carry the same information. Mastery overlay colouring concepts by stage: Phase 15.

## 8. AI-assisted organisation (Phases 11 and 15)

All arrive as **proposals** in the Inbox unless the user enables auto-accept per kind:
suggested links for unlinked mentions; concept extraction from sources and notes; relation proposals
with evidence quotes; tag suggestions; "connect this note to my knowledge about X"; concept merges.

## 9. Import and export (Phase 16; Anki TSV in Phase 8)

Import: Obsidian vault (open in place — no conversion), Markdown folders, Anki TSV, Graphify
`graph.json`. Export: full archive (notes + sources + JSON data + schema), concepts as Markdown notes,
cards (Anki TSV/CSV/JSON), quizzes (Markdown/JSON), graph (JSON/GraphML).
