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

**embeddings** (derived, P1) `chunk_id` · `model` · `dims` · `vector` (BLOB float32) — PK (`chunk_id`, `model`)

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

**relations** (typed, provenance-tagged edges — Graphify model)
`id` · `from_type` · `from_id`† · `to_type` · `to_id`† · `relation` · `confidence`
(`USER` | `EXTRACTED` | `INFERRED` | `AMBIGUOUS`) · `score` (0–1; INFERRED rubric 0.55–0.95) ·
`weight` (FIRe encompassing weight, optional) · `status` (`proposed` | `accepted` | `rejected`) ·
`evidence_json` (locators + quote) · `created_by` · `created_at`

Initial relation vocabulary (small on purpose; extended only with evidence of need):

| Relation | Direction | Meaning |
|---|---|---|
| `relates_to` | symmetric | General association |
| `prerequisite_for` | A → B | Understanding A is needed before B (inverse view: B *depends on* A) |
| `part_of` | A → B | A is a component/sub-concept of B |
| `example_of` | A → B | A is an instance/example of B |
| `contrasts_with` | symmetric | Commonly compared/confused ("compare and contrast" exam fodder) |
| `covered_in` | concept → lecture/source | Structural; from extraction provenance |
| `derived_from` | note/card/question → source | Structural provenance |

Edges implied by wikilinks (`mentioned_in`) and course structure (`part_of` module) are **computed**,
not stored in `relations`. Deferred: `supports` / `contradicts` (for dissertation argument mapping).

### 5.6 Flashcards

**card_sets** `id` · `title` · `module_id` · `lecture_id` · `origin` (`manual` | `ai` | `import`) ·
`description` · `created_at`

**cards** `id` · `set_id`† · `kind` (`basic` | `reversed` | `cloze`) · `front` (Markdown) · `back` ·
`extra` · `cloze_index` · `status` (`draft` | `active` | `suspended` | `deleted`) · `locator_json` ·
`created_by` · `created_at` · `updated_at` — **card_concepts** `card_id` · `concept_id`

**card_schedules** (FSRS state; one row per card) `card_id` PK · `due`† · `stability` · `difficulty` ·
`elapsed_days` · `scheduled_days` · `learning_steps` · `reps` · `lapses` · `state` (`new` | `learning`
| `review` | `relearning`) · `last_review`

**review_logs** (append-only) `id` · `card_id`† · `rating` (1–4) · `state` · `due` · `stability` ·
`difficulty` · `elapsed_days` · `last_elapsed_days` · `scheduled_days` · `learning_steps` ·
`reviewed_at`† · `duration_ms` · `session_id`

### 5.7 Questions and quizzes

**questions** `id` · `kind` (`mcq` | `multi` | `true_false` | `short` | `numeric` | `explain` | `code`
| `derivation`) · `stem` (Markdown + KaTeX) · `options_json` · `answer_json` · `rubric` ·
`explanation` · `difficulty` (1–5) · `status` · `locator_json` · `created_by` · `created_at` —
**question_concepts** `question_id` · `concept_id`

**quizzes** `id` · `title` · `kind` (`practice` | `mock_exam` | `adaptive`) · `config_json` (scope,
counts, time limit) · `created_at` — **quiz_items** `quiz_id` · `question_id` · `ordinal`

**quiz_attempts** `id` · `quiz_id` · `started_at` · `finished_at` · `score` · `session_id`

**answers** (append-only) `id` · `attempt_id` · `question_id`† · `response_json` · `score` (0–1) ·
`graded_by` (`auto` | `self` | `ai`) · `feedback` · `confidence` (1–3, optional) · `assisted` (bool) ·
`duration_ms` · `answered_at`†

### 5.8 Study activity, mastery and planning

**study_sessions** `id` · `kind` (`review` | `practice` | `quiz` | `tutor` | `reading`) · `module_id` ·
`started_at` · `ended_at` · `stats_json`

**mastery_cache** (derived) `entity_type` · `entity_id` · `score` · `stage` · `confidence` ·
`components_json` · `computed_at` — recomputed after relevant events; never edited directly.

**study_plans** `id` · `title` · `start_date` · `end_date` · `params_json` · `generated_by` ·
`created_at` — **plan_items** `id` · `plan_id` · `date`† · `kind` (`review` | `practice` | `learn` |
`coursework` | `mock_exam`) · `target_type` · `target_id` · `minutes` · `reason` · `status`
(`planned` | `done` | `skipped`)

### 5.9 AI, agent and operations

**ai_usage** `id` · `provider` · `model` · `role` · `input_tokens` · `output_tokens` · `cost_estimate` ·
`purpose` · `created_at`

**proposals** `id` · `kind` (`concept` | `relation` | `card` | `question` | `link` | `note_edit`) ·
`payload_json` · `origin_json` (job/thread, source locators) · `status` (`pending` | `accepted` |
`rejected` | `superseded`) · `created_at` · `decided_at`

**chat_threads** `id` · `title` · `mode` · `scope_json` · `created_at` · `updated_at` —
**chat_messages** `id` · `thread_id`† · `role` · `parts_json` (AI SDK UI message parts) · `created_at`

**agent_actions** (append-only audit) `id` · `thread_id` · `message_id` · `tool` · `risk` ·
`input_json` · `output_json` · `status` (`auto_approved` | `approved` | `denied` | `executed` |
`failed` | `undone`) · `snapshot_ref` · `created_at`

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
