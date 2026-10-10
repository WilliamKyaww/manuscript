# Data model

> PRD v0.1 — 4 October 2026. Storage decision: ADR-0004 (hybrid: files canonical for notes, SQLite
> canonical for structured learning data, SQLite derived index). Schema evolves through numbered SQL
> migrations; this document describes the *target* model and when each part arrives.

## 1. Principles

1. **Canonical vs derived is explicit** for every table. Derived data can be deleted and rebuilt from
   the vault (`skb reindex`).
2. **Stable, typed IDs**: `<prefix>_<ULID>` (e.g. `note_01J9Z3K…`). Prefixes let services and agent
   tools reject IDs of the wrong type early (ADR-0007).
3. **Provenance** is first-class: anything derived from a source stores a *locator*.
4. **Timestamps** are ISO-8601 UTC strings in SQLite (`TEXT`), produced by an injectable clock.
5. **Soft deletion** for user content (trash with retention), hard deletion for derived rows.
6. **JSON columns** only for genuinely variable data (locators, settings, tool payloads), validated by
   Zod on read and write.

## 2. Vault layout

```text
<vault>/
├── **/*.md                      notes (any folder structure the user likes)
├── Sources/                     imported originals (configurable)
│   ├── COC251/                  per module code when assigned
│   └── Inbox/                   unassigned imports
├── Templates/                   note templates (plain Markdown)
└── .skb/                        application data (excluded from notes and sources)
    ├── skb.db (+ -wal, -shm)    SQLite database
    ├── vault.json               vault id, schema version, created-by version
    ├── lock                     single-server lock
    ├── trash/                   soft-deleted notes (30-day retention default)
    ├── history/                 pre-change snapshots for undo (bounded)
    ├── cache/                   rebuildable caches
    └── logs/                    rotated structured logs
```

`.skb/` and `Sources/` are excluded from the notes index; `.obsidian/` is ignored if present.

## 3. Note file format

```markdown
---
id: note_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7
title: Consensus overview          # optional; defaults to the file name
type: lecture-notes                # note | lecture-notes | summary | revision | concept | journal (open set)
tags: [distributed-systems, consensus]
aliases: [Consensus notes]
module: COC251                     # module code (optional)
lecture: COC251/L03                # lecture key (optional)
concepts: ["[[Paxos]]", "[[Raft]]"]
source: "[[Sources/COC251/Lecture 03 - Consensus.pdf]]"
created: 2026-10-04T13:05:00Z
---
# Consensus overview
Paxos guarantees **safety** but not liveness under asynchrony — see [[FLP impossibility]].
$$ \text{quorum} > \frac{n}{2} $$
```

- Only `id` is ever added automatically — by default only when other data must refer to the note,
  or to every note on first index if configured (ADR-0025); a foreign `id` value is kept and `skb-id`
  used instead. All other keys are optional and validated leniently (unknown keys preserved; invalid
  values reported as warnings).
- Frontmatter is edited with minimal text edits guided by the YAML parser: only the edited key's
  lines change, so comments, quoting and formatting survive byte for byte.
- Markdown dialect: CommonMark + GFM + Obsidian extensions (wikilinks, embeds, tags, callouts,
  highlights, comments, maths) + Mermaid fences (`docs/prd/knowledge-system.md` §2).

## 4. Entity overview and priority

Priority: **P0** — needed for the non-AI MVP (Phases 1–9) · **P1** — AI phases (10–15) · **P2** — later.

| Entity | Storage | Canonical? | Priority | Phase |
|---|---|---|---|---|
| Vault (workspace) | `.skb/vault.json` + settings rows | Yes | P0 | 1 |
| Note | Markdown file + `notes` index row | File yes / row derived (except `id`) | P0 | 3 |
| Link | `note_links` | Derived from files | P0 | 3 |
| Tag | `note_tags` | Derived from files | P0 | 3 |
| Template | `Templates/*.md` | Yes (file) | P0 | 3 |
| Attachment (File) | vault file referenced by a note | Yes (file) | P0 | 3 |
| Source | `sources` + original file | Yes | P0 | 5 |
| SourceSection | `source_sections` | Derived from original | P0 | 5 |
| Chunk | `chunks` (+ `chunks_fts`) | Derived | P0 | 5 |
| Course | `courses` | Yes | P0 | 6 |
| Module | `modules` | Yes | P0 | 6 |
| Lecture | `lectures` | Yes | P0 | 6 |
| Topic | `topics` | Yes | P0 | 6 |
| Assessment | `assessments` | Yes | P0 | 6 |
| Concept | `concepts` + `concept_aliases` | Yes | P0 | 6 |
| Relation | `relations` | Yes (user/AI asserted) | P0 | 7 |
| FlashcardSet (deck) | `card_sets` | Yes | P0 | 8 |
| Flashcard | `cards` | Yes | P0 | 8 |
| CardSchedule | `card_schedules` | Yes | P0 | 8 |
| ReviewLog | `review_logs` | Yes (append-only) | P0 | 8 |
| Question | `questions` | Yes | P0 | 9 |
| Quiz | `quizzes` + `quiz_items` | Yes | P0 | 9 |
| QuizAttempt / Answer | `quiz_attempts` + `answers` | Yes (append-only) | P0 | 9 |
| StudySession | `study_sessions` | Yes | P0 | 8–9 |
| Mastery | computed from evidence; `mastery_cache` | Derived | P0 | 9 |
| Embedding | `embeddings` | Derived | P1 | 10 |
| ModelUsage | `ai_usage` | Yes | P1 | 10 |
| Proposal | `proposals` (AI suggestions awaiting review) | Yes | P1 | 11 |
| ChatThread / ChatMessage | `chat_threads`, `chat_messages` | Yes | P1 | 13 |
| AgentAction | `agent_actions` | Yes (append-only) | P1 | 12 |
| Job | `jobs` | Yes (operational) | P0 | 5 |
| StudyPlan / PlanItem | `study_plans`, `plan_items` | Yes | P1 | 14 |
| Collection (saved search / smart folder) | `collections` | Yes | P2 | backlog |
| Document (generic structured doc type) | — | — | **Not modelled**: a "document" is a Note with a `type`, or a Source | — |

## 5. Entity definitions

Columns marked † are indexed. `…_json` columns are Zod-validated.

### 5.1 Knowledge

**notes** (derived index of `.md` files; migration `0002_notes`)
`doc_id` PK (internal; FTS rowid) · `id` (unique `note_…`) · `path` (unique) · `path_key`† · `name_key`† ·
`title` · `title_key`† · `type` · `module_code`† · `lecture_key`† · `frontmatter_json` · `content_hash`
(sha256 of the bytes) · `size_bytes` · `mtime_ms` · `word_count` · `id_persisted` · `warnings_json` ·
`created_at` · `updated_at` · `indexed_at`. Keys are NFC, lower-case, `.md`-less forms used for
case-insensitive link resolution.

**note_aliases** (derived) `doc_id`† · `alias` · `alias_key`†

**note_links** (derived)
`link_id` · `source_doc`† · `ordinal` · `syntax` (`wikilink` | `markdown`) · `embed` · `target_raw` (as
written) · `target_name_key`† (last path segment, for re-resolution) · `heading` · `block_ref` · `alias` ·
`target_kind` (`note` | `attachment` | `concept` | `unresolved`) · `target_doc`† · `target_path` ·
`target_concept`† (migration `0006`, which rebuilt the table) · `ambiguous` · `line` · `col` · `context`
(the source line, for backlinks). Notes resolve before concepts, concepts before attachments (ADR-0029).

**note_tags** (derived) `doc_id`† · `tag`† (normalised lower-case, `/` hierarchy allowed)

**attachments** (derived) `path` PK · `name_key`† · `size_bytes` · `mtime_ms` · `media_type` · `indexed_at`

**notes_fts** (FTS5, derived) `title` (with aliases), `headings`, `body`, `tags` — `tokenize='porter unicode61 remove_diacritics 2'`; rank configured as `bm25(10, 4, 1, 2)` (migration `0004`)

**recent_items** (canonical, low stakes; migration `0003`) `kind` · `item_id` · `opened_at` — the last 100 opened notes for the quick switcher; missing items are skipped on read

### 5.2 Sources

**sources** (canonical, migration `0005`; kept in step with the `Sources/` folder, ADR-0028)
`id` PK (`src_…`) · `kind` (`pdf` | `pptx` | `docx` | `markdown` | `text` | `url` | `audio` | `video` |
`image`) · `title` (the file name without extension) · `path` (vault-relative original; unique among
live sources) · `original_name` · `media_type` · `sha256`† · `size_bytes` · `mtime_ms` (lets
reconciliation skip unchanged files) · `page_count` · `status` (`pending` | `processing` | `ready` |
`failed`) · `error` · `module_code`† (the `Sources/<module>/` folder; `NULL` for the inbox; matched to
`modules.code_key` case-insensitively, ADR-0029) · `url` · `metadata_json` · `warnings_json` · `parser_version` and
`ingested_sha256` (what the current sections were produced from; ingestion is a no-op when both
match) · `created_at` · `ingested_at` · `missing_at` (the original disappeared; cleared when the same
content reappears) · `deleted_at` (moved to the trash through the app)

**source_sections** (derived) `id` (integer; replaced on re-ingestion) · `source_id`† · `ordinal` ·
`kind` (`page` | `slide` | `heading` | `segment`) · `label` ("Slide 3", "p. 12", a heading) ·
`heading_path_json` · `locator_json` · `text` · `notes` (speaker notes)

**chunks** (derived) `id` (integer; also the `chunks_fts` rowid) · `owner_type` (`source` | `note`) ·
`owner_id`† · `section_id`† · `ordinal` · `text` · `context_prefix` (document › section path) ·
`token_estimate` · `locator_json`. Chunks never cross a section; about 300 estimated tokens with a
little overlap (`@skb/core` `chunkDocument`).

**chunks_fts** (FTS5, derived, external content over `chunks`, kept in step by triggers) `context_prefix`,
`text` — same tokenizer as `notes_fts`; rank configured as `bm25(2, 1)`. Search shows one hit per
section (its best chunk).

**embeddings** (derived, migration `0010`) `owner_type` (`chunk` | `note`) · `owner_id` (chunk id as text, or note id) · `model` (`provider/model`) · `content_hash` (of the text embedded: a chunk with its context, or a note's title and first 6,000 characters) · `dims` · `vector` (BLOB, little-endian float32) · `created_at` — PK (`owner_type`, `owner_id`, `model`). Rows of other models and of removed owners are pruned before each embedding run.

### 5.3 Locator format (shared by chunks, cards, questions, relations, citations)

```jsonc
{ "kind": "pdf",      "sourceId": "src_…", "page": 12, "charStart": 120, "charEnd": 890 }
{ "kind": "slides",   "sourceId": "src_…", "slide": 3, "part": "body" }            // or "notes"
{ "kind": "markdown", "noteId": "note_…", "headingPath": ["Consensus", "Paxos"], "line": 42 }
{ "kind": "docx",     "sourceId": "src_…", "headingPath": ["2 Background"], "paragraph": 14 }
{ "kind": "media",    "sourceId": "src_…", "startMs": 123000, "endMs": 168000 }
```

### 5.4 Course structure

Canonical (migration `0006`; export required, §6). Modules are tied to files by their **code**, and
which notes belong to a module or lecture is read from the notes' own properties — never copied into
these tables (ADR-0029).

**courses** `id` (`crs_…`) · `title` ("BSc Computer Science and AI — Year 3") · `start_date` ·
`end_date` · `target_average` (0–100, the credit-weighted average aimed for) · `notes`

**modules** `id` (`mod_…`) · `course_id`† · `code` (as written; also the `Sources/<code>/` folder name) ·
`code_key`† (lower case, unique; joined to `notes.module_code` and `sources.module_code` with
`lower()`) · `title` · `credits` · `semester` · `colour` · `target_mark` · `archived` (archived
modules still count towards their course's average). The code cannot change while notes or sources
refer to it.

**lectures** `id` (`lec_…`) · `module_id` · `key` (e.g. `L03`) · `key_norm` (unique per module) · `title` ·
`kind` (`lecture` | `lab` | `tutorial` | `workshop` | `seminar`) · `week` · `held_on` · `ordinal`

**lecture_sources** `lecture_id` · `source_id` (recorded by the app; the file does not say which
lecture it belongs to)

*Lecture notes are not stored.* A note belongs to a lecture when its frontmatter says
`lecture: COC251/L03`, or `lecture: L03` with `module: COC251` (the `notes.module_code` and
`notes.lecture_key` columns, case-insensitive). Attaching a note through the app writes those
properties; detaching removes `lecture`. A lecture's key cannot change while notes refer to it.

**topics** `id` (`top_…`) · `module_id`† · `parent_id` (same module; no cycles; deleting a topic
deletes its subtopics) · `title` · `ordinal`

**assessments** `id` (`asm_…`) · `module_id`† · `title` · `kind` (`exam` | `coursework` | `test` |
`presentation` | `project`) · `weight` (fraction of the module mark, > 0 and ≤ 1; a module's weights total
at most 1) · `due_at`† (`YYYY-MM-DD` or `YYYY-MM-DDTHH:MM`, local time) · `duration_minutes` · `status`
(`planned` | `submitted` | `marked`; a mark sets `marked`, clearing it reopens to `planned`; only
`planned` work is an upcoming deadline) · `mark_achieved` (0–100) · `notes`

The mark calculator (`@skb/core` `learning/marks.ts`) works from these rows alone: secured =
Σ weight × mark; weight not yet given to an assessment counts as still to come; a course weights
each module by credits.

### 5.5 Concepts and relations

**concepts** (canonical, migration `0006`) `id` (`con_…`) · `name` · `name_key` (case-folded, unique) ·
`slug` (unique) · `summary` (1–3 sentences, Markdown) · `note_id` (optional backing note, by note id,
which is then written into the note) · `status` (`proposed` | `active` | `merged` | `rejected`) ·
`merged_into` · `importance` (0.5–2, default 1) · `created_by` (`user` | `ai`) · `created_at` ·
`updated_at`

**concept_aliases** `concept_id` · `alias` · `alias_key` (case-folded, unique). Names and aliases share
one namespace: no alias may equal another concept's name.

**concept_topics** `concept_id` · `topic_id` · **concept_modules** `concept_id` · `module_id`
(a concept may span modules — this is what makes cross-module connections visible)

**relations** (canonical, migration `0007`; typed, provenance-tagged edges — Graphify's model, ADR-0030)
`id` (`rel_…`) · `from_type` · `from_id`† · `to_type` · `to_id`† (types: `concept` | `note` | `source` |
`lecture` | `module` | `topic`) · `relation` · `confidence` (`USER` | `EXTRACTED` | `INFERRED` |
`AMBIGUOUS`) · `score` (0–1; INFERRED rubric 0.55–0.95) · `weight` (FIRe encompassing weight, Phase 9,
optional) · `status` (`proposed` | `accepted` | `rejected`) · `evidence_json` (`[{ quote?, locator? }]`)
· `created_by` (`user` | `ai`) · `created_at` · `updated_at`

- Unique on (`from_id`, `to_id`, `relation`); symmetric relations are stored smaller id first, so each
  pair is stored once; the service refuses a relation whose reverse is already stated.
- Ends are polymorphic, so triggers delete a concept's, lecture's, module's, topic's or source's
  relations with it. Relations to notes are not deleted when a note leaves the index (the index is
  rebuilt from files); they are skipped while the note is missing, and a note at either end gets its
  id written into the file (ADR-0025).
- What the student adds is `USER` and `accepted`; accepting a proposal sets both. Rejected relations
  stay, so they are not proposed again, and are never drawn.

Relation vocabulary (`@skb/core` `graph/vocabulary.ts`; small on purpose, extended only with evidence
of need):

| Relation | Direction | Ends | Meaning |
|---|---|---|---|
| `relates_to` | symmetric | concept – concept | General association |
| `prerequisite_for` | A → B | concept → concept | Understanding A is needed before B (B *depends on* A) |
| `part_of` | A → B | concept → concept | A is a component/sub-concept of B |
| `example_of` | A → B | concept → concept | A is an instance/example of B |
| `contrasts_with` | symmetric | concept – concept | Commonly compared/confused ("compare and contrast" exam fodder) |
| `covered_in` | A → B | concept → lecture, source or note | Where a concept is taught or explained |
| `derived_from` | A → B | note → source | Structural provenance |

**Computed edges** (never stored; assembled with the graph, knowledge-system.md §7.1):

| Edge | Kind | Confidence | From |
|---|---|---|---|
| note `links_to` note or source | link | `EXTRACTED` | `note_links` (attachments matched to sources by path) |
| concept `mentioned_in` note | link | `EXTRACTED` | `note_links.target_concept` |
| concept `covered_in` note | link | `USER` | `concepts.note_id` (the backing note) |
| `part_of` | structure | `USER` | lecture → module; topic → parent topic or module; concept → topic, or module when not in one of its topics; note → its lecture, else its module; source → its lecture, else its module |

**graph_communities** (derived, migration `0007`) `node_id` · `community` — the community each node
was last placed in, so cluster ids (and colours) stay stable between rebuilds.

Deferred: `supports` / `contradicts` (for dissertation argument mapping).

### 5.6 Flashcards

Canonical (migration `0008`, ADR-0031). A **card** is what the student writes; a **face** is what is
reviewed: one for a basic card (ordinal 0), two for a reversed card (0 front → back, 1 back → front),
one per cloze number for a cloze card (ordinal = the number). Each face has its own FSRS schedule.

**card_sets** `id` (`set_…`) · `title` · `description` · `module_id` · `lecture_id` · `origin` (`manual`
| `ai` | `import`) · `created_at` · `updated_at` · `deleted_at` (sets are deleted softly; their cards
become `deleted`)

**cards** `id` (`card_…`) · `set_id`† · `kind` (`basic` | `reversed` | `cloze`) · `front` (Markdown; for
cloze cards, the text with `{{cN::answer::hint}}`) · `back` · `extra` (shown after the answer) ·
`status` (`draft` | `active` | `suspended` | `deleted`) · `locator_json` (where the card came from:
a source page or slide, or a note's line) · `created_by` (`user` | `ai` | `import`) · `created_at` ·
`updated_at` — **card_concepts** `card_id` · `concept_id`

**card_schedules** (one row per face) `card_id` · `ordinal` (PK together) · `state` (`new` | `learning` |
`review` | `relearning`)† · `due`† · `schedule_json` (the full FSRS state: stability, difficulty,
elapsed and scheduled days, learning steps, reps, lapses, last review — `@skb/core` `ScheduleSchema`) ·
`buried_until` · `retired` (a face whose cloze number was removed: kept with its history, revived
if the number returns)

**review_logs** (append-only: triggers refuse updates and deletes) `id` (`rev_…`) · `kind` (`review` |
`undo`) · `card_id`† · `ordinal` · `rating` (1–4; null for undo rows) · `undoes` (the review an undo
row takes back; unique) · `previous_json` · `next_json` (the face's schedule before and after) ·
`elapsed_days` (since the face's previous review) · `reviewed_at`† · `duration_ms` · `session_id`. A
review is *standing* unless an undo row points at it; statistics count standing reviews only.

Review settings are the `review` group in `settings` (desired retention, daily limits, learning and
relearning steps, longest interval, fuzz). Days run from 04:00 to 04:00 local time.

### 5.7 Questions and quizzes

Canonical (migration `0009`, ADR-0032).

**questions** `id` (`qst_…`) · `kind` (`mcq` | `multi` | `true_false` | `numeric` | `short` |
`explain` | `derivation` | `code`) · `stem` (Markdown + KaTeX) · `answer_json` (the key, options
with per-option explanations included — `@skb/core` `QuestionAnswerSchema`; its kind is the
question's) · `rubric` · `explanation` · `hint` · `difficulty` (1–5) · `status` (`draft` |
`active` | `suspended` | `deleted`; deleted softly, answers keep pointing at it) · `module_id` ·
`lecture_id` · `tags_json` · `locator_json` · `created_by` · `created_at` · `updated_at` —
**question_concepts** `question_id` · `concept_id`

**quizzes** `id` (`quiz_…`) · `title` · `kind` (`practice` | `mock_exam` | `adaptive`) ·
`config_json` (scope, count, kinds, difficulty, time limit, rehearsed assessment; for a Learn session
the concepts with their priority and stage when it began) · `module_id` · `assessment_id` ·
`created_at` · `deleted_at` (soft) — **quiz_items** `quiz_id` · `ordinal` · `question_id` (the
questions chosen; for a Learn session, the questions it may ask)

**quiz_attempts** `id` (`att_…`) · `quiz_id` · `started_at` · `deadline` (start + time limit) ·
`finished_at` · `score` (mean of scored answers) · `draft_json` (a mock exam's unsubmitted
responses; not evidence) · `session_id`

**answers** (append-only: a trigger refuses deletes and every update except giving a pending answer
its score, once) `id` (`ans_…`) · `attempt_id` · `question_id`† · `concept_id` (the concept a
Learn session asked it for; no foreign key, concepts can be deleted) · `response_json` (null: left
blank in a mock exam) · `score` (0–1; null while waiting for a self-grade) · `graded_by` (`auto` |
`self` | `ai`) · `graded_at` · `feedback` · `confidence` (1–3, optional) · `assisted` (bool) ·
`duration_ms` · `answered_at`†

### 5.8 Study activity, mastery and planning

**study_sessions** (migration `0008`) `id` (`ses_…`) · `kind` (`review` | `practice` | `quiz` | `tutor` |
`reading`) · `set_id` · `module_id` · `started_at` · `ended_at` · `stats_json` (a review session's summary;
for quizzes and Learn, answered, correct and score). Quiz attempts open a `quiz` session, Learn a
`practice` one.

**mastery_cache** (derived, migration `0009`) `entity_type` (`concept` | `topic` | `module` |
`course`) · `entity_id` (`all` for the course) · `score` · `stage` · `confidence` · `components_json`
(for concepts with signals and priority) · `computed_at` — replaced as a whole whenever mastery is
recomputed (after a review, answer or link change, or when a quarter of an hour old); never edited
directly.

**pipeline_runs** (migration `0015`) `id` (`run_…`) · `lecture_id` · `trigger` (`manual` | `auto`) · `steps_json` · `sources_json` · `job_id` · `status` · `message` · `started_at` · `finished_at` — proposals gain the kind `addition` —
**study_plans** (migration `0014`) `id` · `title` · `start_date` · `end_date` · `params_json` · `generated_by` (`planner` | `agent`) ·
`unscheduled_json` · `created_at` · `updated_at` — **plan_items** `id` · `plan_id` · `date`† · `ordinal` · `kind` (`review` | `practice` | `learn` |
`coursework` | `mock_exam`) · `target_type` · `target_id` · `title` · `minutes` · `reason` · `status`
(`planned` | `done` | `skipped`) · `completed_at` — **tutor_sessions** `thread_id` · `quiz_id` · `attempt_id` (the quiz and attempt a tutored chat records answers in) —
`assessments.remaining_hours` (the student's estimate of work left) — proposals gain the kind `correction`.

### 5.9 AI, agent and operations

**ai_usage** (canonical, migration `0010`; rebuilt in `0011` to allow `transcription`) `id` (`use_…`) · `role`
(`chat` | `fast` | `embedding` | `transcription`) · `provider` (the
provider id in the settings, or `mock`) · `model` · `purpose` (`ask`, `embed`, `generate cards`, `transcribe a
recording`, `connection test`…) · `input_tokens` ·
`output_tokens` · `cost_estimate` (US dollars at the role's prices when the request was made) · `created_at`. Providers,
preferences and keys are not in the vault: `ai.json` and `secrets.json` in the data directory (ADR-0033).

**proposals** (canonical, migration `0011`, ADR-0034) `id` (`prp_…`) · `kind` (`concept` | `relation` | `alias`
| `link` | `note`) · `status` (`pending` | `accepted` | `rejected` | `superseded`) · `payload_json` (@skb/core
`ProposalPayloadSchema`; a relation's ends are existing concepts or other proposals) · `evidence_json` (`[{ quote,
title, label, locator }]`) · `origin_json` (label, job, module, lecture, where concepts are covered) · `dedupe_key`
(what is proposed, normalised: a pending key is not proposed twice, a rejected one never again) · `result_json`
(`{ kind, id }` of what accepting made) · `created_at` · `decided_at`. Generated cards and questions are not
proposals: they are `cards` and `questions` rows with status `draft` and `created_by = 'ai'` until accepted.

**chat_threads** `id` · `title` · `mode` · `scope` · `filter_json` · `allowed_tools_json` · `history_json` (the model's messages) · `summary` · `pending_json` (a paused run) · token and cost totals · `created_at` · `updated_at` —
**chat_messages** `id` · `thread_id`† · `role` · `parts_json` (our message parts) · `mentions_json` · `text` (for search) · `created_at`

**agent_actions** (canonical, migration `0012`, ADR-0035; append-only by trigger — only an undo may mark a
row) `id` (`act_…`) · `thread_id` · `message_id` (chat, Phase 13) · `actor` (`agent` | `mcp`) · `tool` · `risk`
(`read` | `write` | `destructive`, after escalation) · `approval` (`auto` | `user`) · `status` (`executed` |
`denied` | `failed` | `undone`) · `summary` · `input_json` · `output_json` · `error` · `undo_json` (what the tool
needs to undo it) · `snapshot_ref` (the `.skb/history/<id>/` folder holding copies of changed files) ·
`created_at` · `undone_at`. Reads are not logged.

**jobs** (migration `0005`) `id` · `kind` (e.g. `source.ingest`) · `subject` (the entity worked on) ·
`payload_json` · `status` (`queued` | `running` | `succeeded` | `failed` | `cancelled`) · `progress`
(0–1) · `message` (current step) · `error` (last failure, user-facing) · `attempts` · `max_attempts` ·
`run_after` (retry back-off) · `created_at` · `updated_at` · `finished_at`. Finished jobs are kept for
14 days; jobs left running by a crash are queued again at start-up.

**settings** `key` PK · `value_json` (vault-scoped, non-secret)

## 6. What lives where — portability matrix

| Data | Survives deleting `.skb/`? | Export format |
|---|---|---|
| Notes, templates, attachments | Yes (files) | As-is (Markdown) |
| Source originals | Yes (files) | As-is |
| Source library (rows) | Rebuilt from `Sources/` (module from the folder); missing/deleted states and later references are lost | JSON (Phase 16) |
| Note index, FTS, chunks, embeddings | Rebuilt automatically | — |
| Course structure, concepts, relations | No — **export required** | JSON (+ optional Markdown concept notes) |
| Cards, schedules, review logs | No — **export required** | JSON, CSV, Anki-compatible TSV |
| Questions, attempts, mastery evidence | No — **export required** | JSON, CSV |
| Chats, agent actions | No | JSON |

Phase 16 adds one-click **full export** (zip: notes + sources + `data/*.json` + schema docs) and
**restore**; automatic daily SQLite backups (`VACUUM INTO`) are added in Phase 17.

## 7. Migrations

- `apps/server/src/db/migrations/NNNN_description.sql`, applied in order inside a transaction; the
  applied set is recorded in `_migrations` (name, checksum, applied_at).
- Migrations are forward-only; a pre-migration backup (`VACUUM INTO .skb/backups/…`) is taken when the
  schema version changes.
- Checksums of applied migrations are verified at startup; an edited applied migration is a hard error.
