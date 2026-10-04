# Knowledge-management (PKM) ecosystem research

> Researched 4 October 2026 by Claude Opus 5.5. Facts are "as observed" on that date from the cited
> sources. Where only secondary sources (reviews, directories) were available this is stated; treat
> those claims as lower confidence.

## How to read this document

Each product has: core concept, what we observed, its information model, strengths and weaknesses, and a
**verdict table** classifying ideas:

| Classification | Meaning |
|---|---|
| **Emulate** | Adopt the capability largely as observed |
| **Improve upon** | Adopt, but adapt or do better for a single-user study tool |
| **Borrow idea** | Take the underlying concept in a different form |
| **Defer** | Useful, but not now — recorded in `docs/backlog/` |
| **Reject** | Deliberately not doing, with a reason |
| **Irrelevant** | Does not apply to a personal, single-user application |

The cross-product synthesis and the resulting design choices are in §16–§17.

---

## 1. Notion

**Core concept.** Block-based documents plus relational databases in one cloud workspace, now an
"AI agent hub".

**Observed (2026).** Notion 3.2–3.6 shipped: background AI meeting notes; *Custom Agents* that run on
schedules or triggers and use MCP integrations (Feb 2026, Notion 3.3); *AI Autofill* bringing agents
into databases (Apr 2026, 3.4); a Developer Platform with sandboxed "Workers" and database sync
(May 2026); *External Agents* letting Claude, Cursor, Codex and others take tasks from a shared board
(Jul 2026, 3.6). Sources: [Notion releases 2026-04-14](https://www.notion.com/releases/2026-04-14),
[TechCrunch, 13 May 2026](https://techcrunch.com/2026/05/13/notion-just-turned-its-workspace-into-a-hub-for-ai-agents/),
[Wikipedia](https://en.wikipedia.org/wiki/Notion_(productivity_software)).

**Information model.** Everything is a block; pages are blocks; databases are collections of pages with
typed properties, relations and roll-ups. Cloud-hosted, proprietary storage; Markdown/HTML/CSV export.

**Strengths.** Superb structured-data UX (database views: table, board, calendar, timeline); slash
command menu; templates; polished editor; agents operating on the workspace through controlled tools.

**Weaknesses.** Cloud-first (weak offline), proprietary storage, lossy export, sluggish on large pages,
AI priced per credit, generic rather than study-specific.

| Idea | Classification | Notes / reason |
|---|---|---|
| Slash-command insert menu in the editor | Emulate | Fast insertion of callouts, maths, Mermaid, card syntax |
| Database views over structured entities (table, board, calendar) | Borrow idea | Only for *our* domain entities (modules, lectures, assessments, plans) — not a general database builder |
| General-purpose user-defined databases | Defer | Large surface area; revisit after core study workflow (backlog `B-KM-03`) |
| Agents that act on the workspace through typed tools with triggers | Borrow idea | Our agent uses a controlled tool layer; scheduled/triggered agents (e.g. "after a lecture is imported, propose cards") come in Phase 15 |
| External agents via MCP | Emulate | Expose our tool layer as an MCP server (Phase 12) so Claude Code/Desktop can use the knowledge base |
| Templates | Emulate | Lecture-notes and revision templates as plain Markdown files |
| Team collaboration, permissions, comments | Irrelevant | Single user |
| Cloud-only storage | Reject | Violates the data-portability principle |

## 2. Obsidian

**Core concept.** Local folder ("vault") of plain Markdown files with wikilinks, backlinks, graph view,
and a large plugin ecosystem. Philosophy: *"File over app"* — "if you want to create digital artefacts
that last, they must be files you can control, in formats that are easy to retrieve and read"
(Steph Ango, Obsidian CEO; [stephango.com](https://stephango.com/about)).

**Observed (2026).** Latest release 1.14.4 (1 October 2026) ([changelog](https://obsidian.md/changelog/)).
Core plugins include **Bases** (database-like table/card/list/kanban views over note properties, with
grouping and sorting improved through 2026) and **Canvas** (infinite canvas stored as the open,
MIT-licensed [JSON Canvas](https://jsoncanvas.org/) format, spec 1.0). Highlights with colours arrived in
1.14.0. Community plugins add spaced repetition, AI chat and semantic search
(see §15).

**Information model.** Page-level Markdown files; YAML frontmatter "properties"; `[[wikilinks]]`
(with `#heading`, `#^block` and `|alias` forms), `![[embeds]]`, `#tags`; links resolved by file name;
the app keeps a rebuildable cache. Obsidian-flavoured Markdown adds callouts (`> [!note]`), highlights
(`==text==`), comments (`%% %%`) and maths (`$…$`, `$$…$$`).

**Strengths.** Total data ownership; works with git and any editor; fast; offline; CodeMirror 6
"live preview" editor; graph view; local-first plugins.

**Weaknesses.** Structure is DIY; the graph view is mostly decorative (untyped links); learning features
only via third-party plugins of variable quality; AI requires plugins and API keys.

| Idea | Classification | Notes / reason |
|---|---|---|
| Vault = plain folder of Markdown files, canonical on disk | **Emulate** | Core of our data-portability principle (ADR-0004). The user can open the same vault in Obsidian |
| Obsidian-compatible Markdown dialect (wikilinks, embeds, tags, callouts, maths, frontmatter) | **Emulate** | Compatibility with an ecosystem the user may already use |
| Backlinks and unlinked mentions | Emulate | Unlinked mentions → AI-suggested links (Phase 11) |
| Graph view | Improve upon | Typed, provenance-tagged edges; graph analytics drive study prompts; mastery overlay (Phase 15) |
| CodeMirror 6 live-preview editing | Emulate | Same editor family; Markdown fidelity preserved (ADR-0009) |
| Bases-style property views | Defer | Domain-specific views first |
| JSON Canvas | Defer | Export/import of concept maps later (backlog `B-KM-05`) |
| Plugin ecosystem | Reject (for now) | A plugin API is a large, security-sensitive commitment; our extension points are internal (parsers, tools, providers) |

## 3. Graphify

Studied in depth from the local repository — see **[graphify.md](./graphify.md)**. Key take-aways:
provenance-tagged edges (`EXTRACTED` / `INFERRED` / `AMBIGUOUS`) with a confidence rubric; graph
analytics (god nodes, surprising connections, bridges, isolated nodes) turned into questions;
lexical seed + traversal retrieval; injection-safe extraction prompts; entity de-duplication guards.
Apache-2.0, so algorithms can be adapted with attribution.

## 4. Anytype

**Core concept.** Local-first, end-to-end-encrypted "everything is an object" workspace with typed
objects and relations, synced peer-to-peer over the open-source **any-sync** protocol.

**Observed.** Objects have a Type and Relations (typed properties) forming a graph; offline by default
with optional backup nodes and self-hosting ([any-sync repo](https://github.com/anyproto/any-sync);
[Anytype blog, Feb 2026](https://blog.anytype.io/february-community-update-2026/)).

**Information model.** Object graph stored in a local CRDT-based store; not plain files (export to
Markdown/Protobuf/JSON).

| Idea | Classification | Notes / reason |
|---|---|---|
| Typed objects with relations | Borrow idea | Our domain types (Concept, Lecture, Module, Source, Card, Question) are first-class; notes carry a `type` property |
| Local-first, offline by default | Emulate | Everything works without network; AI is optional |
| P2P CRDT sync, E2E encryption | Defer / Irrelevant | Single device first; the vault can be synced by the user's own tools (OneDrive, git). Multi-device is backlog `B-PL-02` |
| Opaque object store | Reject | Prefer Markdown on disk for notes |

## 5. Capacities

**Core concept.** Object-based notes: content is typed (Person, Book, Meeting, custom types) with
properties; links between objects build a relationship database automatically.

**Observed (secondary sources).** AI assistant that reads the object graph when answering (e.g. notes
about a person pull in every linked meeting); natural-language querying of the note base; generous free
tier; EU cloud storage with full export ([Saner.ai review](https://www.saner.ai/blogs/capacities-review)).

| Idea | Classification | Notes / reason |
|---|---|---|
| Typed objects instead of folders | Borrow idea | Course structure entities give the user structure without manual folder design |
| AI that answers using the object graph neighbourhood | **Emulate** | Retrieval expands from matched concepts to linked lectures/notes (graph-augmented retrieval, Phase 10) |
| Cloud storage | Reject | Local-first |

## 6. Heptabase

**Core concept.** Visual learning and research: cards on (nested) whiteboards; PDFs, web pages, videos
and podcasts are annotated and highlights become cards. Positioned around a "learning lifecycle" of
capture → browse → whiteboard → sequence.

**Observed.** PDF/media annotation where highlights become cards placeable on whiteboards; one card can
appear on many whiteboards without duplication; nested whiteboards; AI highlights for articles and
transcripts ([Heptabase wiki: PDF annotation](https://wiki.heptabase.com/pdf-annotation),
[User interface logic](https://wiki.heptabase.com/user-interface-logic)).

| Idea | Classification | Notes / reason |
|---|---|---|
| Highlights in a source become first-class knowledge items with a back-link to the exact location | **Emulate** | Source locators (page/slide/char range) on every extracted card, question and note excerpt |
| One item, many contexts (no duplication) | Emulate | Concepts and cards are referenced by ID from many places |
| Spatial whiteboards | Defer | Valuable for concept maps; heavy to build well (backlog `B-KM-05`) |
| "Learning lifecycle" framing | Borrow idea | Our workflow: capture → understand → connect → practise → master |

## 7. Tana

**Core concept.** Infinite outliner where any node can be given a **supertag** that adds structured
fields (e.g. `#lecture` with Module, Date, Recording fields); strong AI extraction.

**Observed.** Supertags; AI that extracts structured data from unstructured notes (e.g. tasks with owners
and dates); voice memos with live transcription; in April 2026 the company launched an agentic meeting
product at tana.inc and moved the outliner to outliner.tana.inc
([Supertags](https://outliner.tana.inc/learn/features/supertags), [Tana AI](https://outliner.tana.inc/learn/features/tana-ai)).

| Idea | Classification | Notes / reason |
|---|---|---|
| Supertag → typed fields | Borrow idea | Frontmatter `type: lecture` + known properties, validated by our schema; the UI shows typed property editors |
| AI extraction of structure from free text | **Emulate** | Concept/definition/relationship extraction with review (Phase 11) |
| Outliner-first, block-level everything | Reject | Block-level identity in Markdown files is fragile (see Logseq §8); page-level notes plus heading/char locators are sufficient |

## 8. Logseq

**Core concept.** Open-source outliner with block references, journals, queries and flashcards.
Historically file-based (Markdown/Org); now migrating to a **database version**.

**Observed (2026).** The DB version stores graphs in **SQLite**; beta announced 13 July 2026. The
16 May 2026 update introduced a **Markdown Mirror** — *"Logseq writes a plain markdown projection of your
blocks to a folder on disk and keeps it in sync as you edit"* — currently **one-way**; two-way sync is
"in active development … not yet shipped". Graph View V2 was rebuilt for large graphs; a CLI can query
graphs, manage tasks and back up graphs
([May 2026 update](https://discuss.logseq.com/t/whats-new-with-logseq-db-may-16th-2026/35020),
[April 2026 update](https://discuss.logseq.com/t/whats-new-with-logseq-db-april-26-2026/34977),
[GitHub](https://github.com/logseq/logseq)).

**Lesson.** Keeping *block-level* identity consistent in plain files proved hard enough that Logseq
moved the source of truth into SQLite and now struggles to make files flow back. That informs our hybrid
decision (ADR-0004): **page-level Markdown files stay canonical; structured, high-churn data
(cards, reviews, mastery) lives in SQLite**; we do not attempt block-level identity in files.

| Idea | Classification | Notes / reason |
|---|---|---|
| Built-in flashcards inside notes | Borrow idea | Cards are first-class DB entities linked to notes/sources; inline card syntax in notes is backlog `B-LE-04` |
| SQLite as the structured store | Emulate | For learning data and the index |
| Block references / transclusion | Reject (for now) | Fragile in files; heading-level links and embeds cover most needs |
| CLI for graph queries | Borrow idea | Our MCP server and HTTP API serve this purpose |

## 9. Roam Research

**Core concept.** Pioneered networked thought: bi-directional links and block references (`((uid))`)
with transclusion as core behaviour.

**Observed (2026, secondary).** Block references remain its strongest feature; "Export with
References" shipped via Roam Depot; a much smaller but loyal user base than in 2020–21
([Roam on X](https://x.com/RoamResearch/status/2029043669966213552),
[MakerStack review](https://makerstack.co/reviews/roamresearch-review/)).

| Idea | Classification | Notes / reason |
|---|---|---|
| Bi-directional links as a default | Emulate | Backlinks panel on every note and concept |
| Daily notes as an inbox | Defer | A "study log" daily note is a small, optional feature (backlog `B-KM-07`) |
| Block transclusion | Reject (for now) | As Logseq §8 |
| Cloud-only, proprietary | Reject | |

## 10. Mem

**Core concept.** AI-first notes that organise themselves; "AI thought partner".

**Observed.** Mem 2.0 (1 October 2025): agentic chat that can *"create, edit, and organize notes for
you"*; **Version History** — *"Collaborate confidently with AI, knowing you can always roll back"*;
Deep Search by meaning; "Heads Up" resurfacing of relevant notes; full offline support
([Introducing Mem 2.0](https://get.mem.ai/blog/introducing-mem-2-0)).

| Idea | Classification | Notes / reason |
|---|---|---|
| Agent that writes and edits notes | **Emulate** | Our agent tool layer (Phase 12) |
| Version history / rollback of AI edits | **Emulate** | Every agent write is logged with a pre-change snapshot and an Undo (ADR-0013) |
| Proactive resurfacing ("Heads Up") | Borrow idea | Resurface weak concepts and related notes before a lecture/exam (Phase 14) |
| Fully automatic organisation with no user structure | Reject | For coursework the user wants explicit structure (modules, lectures); AI proposes, user decides |

## 11. Reflect

**Core concept.** Minimalist, end-to-end-encrypted networked notes with daily notes, calendar
integration and AI (GPT-4-class writing assistance, Whisper transcription).

**Observed.** AI can select a paragraph and *automatically add backlinks* to entities it mentions
([Reflect blog](https://reflect.app/blog/automatically-add-backlinks-using-ai)).

| Idea | Classification | Notes / reason |
|---|---|---|
| AI auto-linking of mentioned entities | **Emulate** | "Suggest links" action: finds concept/note mentions and proposes wikilinks (Phase 11) |
| Calendar integration | Defer | Timetable/deadline import (ICS) is backlog `B-PL-01` |
| E2E-encrypted cloud | Irrelevant | Local-first |

## 12. AFFiNE

**Core concept.** Open-source, local-first workspace combining documents, whiteboards ("Edgeless mode")
and AI, built on the BlockSuite editor toolkit; MIT-licensed editor, self-hostable
([AFFiNE](https://affine.pro/blog/affine-app), [Better Stack guide](https://betterstack.com/community/guides/linux/affine/)).

| Idea | Classification | Notes / reason |
|---|---|---|
| Document ↔ whiteboard duality | Defer | As Heptabase |
| BlockSuite as an editor toolkit | Reject | Block model + CRDT storage conflicts with Markdown-file canonical storage |
| Local-first with optional sync | Emulate | |

## 13. SiYuan (discovered)

**Core concept.** Open-source (AGPL-3.0), local-first PKM in TypeScript + Go with block-level
references, WYSIWYG Markdown, databases, PDF annotation, whiteboards and **built-in flashcards using
FSRS** (via the `riff` Go library)
([OpenAlternative](https://openalternative.co/siyuan), [riff](https://pkg.go.dev/github.com/siyuan-note/riff)).

**Relevance.** The closest existing "PKM + spaced repetition" open-source product. Confirms that FSRS is
the expected scheduling standard. AGPL licence means no code reuse in our project.

| Idea | Classification | Notes / reason |
|---|---|---|
| FSRS-scheduled flashcards integrated with notes | Emulate | Via `ts-fsrs` (MIT) |
| Any code reuse | Reject | AGPL-3.0 incompatible with our licensing freedom |

## 14. Recall (discovered)

**Core concept.** "Self-organising AI knowledge base": save articles, videos, podcasts, PDFs and notes;
summaries; chat over content; an automatic knowledge graph; **spaced-repetition quizzes** generated
from saved content.

**Observed.** Quiz 2.0 (19 February 2026) generates questions from any saved lecture, PDF, video or note;
Recall Review applies spaced repetition automatically; questions move through five stages
(New → Learning → Practised → Confident → Mastered) shown as a stacked area chart; review schedule and
streak calendar ([release notes](https://feedback.getrecall.ai/changelog/recall-release-notes-feb-19-2026-quiz-20-with-shared-challenges),
[docs: for students](https://docs.recall.it/use-cases/audience/for-students)).

**Relevance.** The commercial product nearest to our "knowledge feeds learning" loop.

| Idea | Classification | Notes / reason |
|---|---|---|
| Questions generated from saved knowledge, scheduled with spaced repetition | **Emulate** | Core of Phases 8, 9 and 11 |
| Five-stage mastery progression visualised over time | **Improve upon** | Our stages are derived transparently from FSRS state and attempt history and roll up to concept/topic/module (`docs/prd/learning-system.md`) |
| Automatic knowledge graph from saved content | Improve upon | With provenance and a user review queue |
| Social challenges | Irrelevant | |

## 15. Obsidian AI plugins (discovered)

**Smart Connections**: local embedding model (no API key) surfaces semantically related notes while
writing; does not chat. In early 2026 it moved from GPLv3 to a source-available licence, which drew
community criticism. **Copilot for Obsidian**: chats with the vault and edits files in place
([Smart Connections repo](https://github.com/brianpetro/obsidian-smart-connections),
[comparison](https://codeculture.store/blogs/developer-culture/obsidian-ai-plugin-comparison-2025)).

| Idea | Classification | Notes / reason |
|---|---|---|
| "Related notes" panel from local embeddings | Emulate | Optional semantic layer (Phase 10); lexical works without it |
| Local embedding models (no API key) | Borrow idea | Embedding provider is pluggable: local (Ollama / transformers.js) or API |
| Licence changes in a plugin ecosystem | Lesson | Prefer dependencies with stable permissive licences (MIT/Apache-2.0) |

---

## 16. Cross-product synthesis

| Dimension | Prevailing approaches | Our choice |
|---|---|---|
| Unit of knowledge | Block (Notion, Roam, Logseq, Tana), page/file (Obsidian, Reflect), object (Anytype, Capacities) | **Page-level Markdown notes** + **typed domain entities** (Concept, Source, Lecture, Module, Card, Question) |
| Storage | Proprietary cloud (Notion, Roam, Mem), local DB (Anytype, Logseq DB, SiYuan), plain files (Obsidian) | **Hybrid**: Markdown files canonical for notes; originals preserved for sources; SQLite for structured learning data and the rebuildable index |
| Links | Untyped wikilinks (Obsidian), block refs (Roam/Logseq), typed relations (Anytype, Capacities) | Wikilinks for prose **plus** typed, provenance-tagged relations between entities |
| Graph | Decorative (most) vs analysed (Graphify) | Analysed graph that generates study prompts and shows mastery |
| AI | Bolt-on chat (most) → agents acting through tools (Notion 3.x, Mem 2.0) | Agent with typed tools, permission levels, action log and undo |
| Learning | Absent (most PKM) or bolted on (Logseq, SiYuan, RemNote) | First-class, sharing the same concept model |
| Offline / portability | Strong only in Obsidian, Anytype, Logseq, SiYuan | Strong: works offline; AI optional; all data exportable |

## 17. What this means for the product

1. **Files over app for prose; database for behaviour.** Notes are Markdown files the user owns;
   reviews, schedules and attempts are structured records in an open SQLite file with a documented
   schema and exports.
2. **Obsidian compatibility is a feature.** The vault should open cleanly in Obsidian.
3. **Typed entities beat folder hierarchies** for course material; folders remain available for free
   notes.
4. **AI proposes, the user disposes.** Extracted concepts, links and cards enter a review state first.
5. **Every AI write is reversible** (snapshot + undo), learning from Mem 2.0's version history.
6. **The graph must earn its place** by driving study actions (gaps, bridges, weak concepts).
7. **Avoid**: block-level identity in files, general database builders, plugin APIs, collaboration
   features, proprietary cloud storage — all deferred or rejected with reasons above.
