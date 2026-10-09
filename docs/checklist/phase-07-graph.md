# Phase 7 — Knowledge graph

**Status:** Complete (9 October 2026) · **Branch:** `phase/07-graph`

## Objective
A typed, provenance-tagged knowledge graph over concepts, notes, sources, lectures and modules, with
Graphify-inspired analytics that generate study prompts, and an interactive WebGL graph UI.

## Why it exists
The graph must be meaningful, not decorative: it reveals core concepts, gaps and cross-module bridges
and later carries mastery (ADR-0015, ADR-0020).

## Dependencies
Phase 6.

## Atomic tasks
- [x] **7.01** Migration: `relations` — `0007_relations.sql`: confidence, score, status, evidence, creator; symmetric pairs stored once; triggers remove relations of deleted concepts, lectures, modules, topics and sources; derived `graph_communities`
- [x] **7.02** Relations service + API (create/update/delete; confidence, score, status, evidence; vocabulary validation); tests — `/api/relations`; ends checked against the vocabulary and for existence; no relation together with its reverse; note ends get their id written; `data.changed` events
- [x] **7.03** Graph assembly with graphology from entities, relations, wikilinks, structure and provenance; server-side filters; cache keyed by a graph version counter; tests — computed `links_to`, `mentioned_in`, `covered_in`, `part_of` edges (ADR-0030); filters for types, modules, relations, confidence, status, unlinked items and size (concepts kept first); version bumped by server events; analytics reused while the graph's fingerprint is unchanged
- [x] **7.04** Analytics: core concepts (degree excluding structural hubs); Louvain communities with oversized/low-cohesion re-splitting, stable IDs and hub-based labels (Graphify-adapted, attributed); tests — seeded Louvain; ids remapped to the previous assignment and persisted
- [x] **7.05** Analytics: bridges (sampled betweenness), isolated concepts, surprising-connection scoring, shortest path; tests — Brandes betweenness checked on known graphs, sampled with a seed above 1,000 nodes; paths that avoid the course structure
- [x] **7.06** Study prompts from analytics (gaps, bridges, ambiguous/inferred verification, low-cohesion clusters); tests — plus surprising connections; each prompt carries actions; per-module reports
- [x] **7.07** Graph API: global (filtered), local neighbourhood (depth 1–2), path, analytics report; integration tests — `/api/graph`, `/api/graph/local`, `/api/graph/path`, `/api/graph/report`
- [x] **7.08** Graph UI: Sigma renderer, ForceAtlas2 in a worker, community legend with toggles, search-to-focus, side panel, filters, edge styles by confidence (solid/dashed/dotted) — Sigma 3 with our own wrapper; patterned edge programs adapted from Sigma (MIT); LinLog layout from community starting places; path finder; theme-aware colours and hover labels; a WebGL-less fallback
- [x] **7.09** Local graph panel on note and concept pages — depth 1 or 2, never expanding through modules, lectures or topics, with the direct connections listed; the Notes **Graph** tab
- [x] **7.10** Relation editing UI on concept pages (add typed relation; accept/reject proposed relations) — both directions offered, evidence quotes, accept makes a relation the student's own, rejected ones are kept
- [x] **7.11** `THIRD_PARTY_NOTICES.md` entries and code headers for Graphify-adapted modules — `communities.ts`, `insights.ts`, `prompts.ts`, the confidence rubric; Sigma adaptations listed too
- [x] **7.12** Performance: 5,000-node payload < 500 ms server time; interactive rendering verified — 97 ms from the cache, 2.1 s for a first build of the 11,300-node graph (budget 3 s), 674 ms after a note edit (budget 1 s), all on mains power; 2,500 nodes and 4,800 edges in Chromium settle in 3 s and idle at 60 fps (software WebGL: zooming ~15 fps)
- [x] **7.13** E2E: graph renders, filters work, clicking a node opens its page — `e2e/graph.spec.ts` (module and type filters, a click on the canvas, Open, a proposal accepted on the concept page, axe); the graph page in the shell's pane-header and axe checks; stable over `--repeat-each 4`
- [x] **7.14** Docs: graph guide (legend, confidence styles); STATE/FEATURES/journal updated — `docs/guide/graph.md`; course and Markdown guides, data model, knowledge-system PRD, architecture, ADR-0030 and an ADR-0015 note, backlog B-KM-14…20

## Acceptance criteria
- [x] Every edge shows its relation, confidence and evidence — the side panel and concept pages name the relation and its confidence; line styles show confidence on the canvas; evidence quotes on concept pages
- [x] Analytics output is deterministic for the same input — seeded Louvain and sampling, id order throughout; tests compare repeated runs
- [x] Prompts link to actions — every prompt has at least one action (open, review relations, show in graph); tested in component and E2E tests

## Gate
- [x] All tasks `[x]` · [x] verify (483 Vitest tests) + E2E (74 Playwright tests) green · [x] docs updated · [x] merged

## Recommended commit messages
```text
feat(server): add typed relations and graph assembly with graphology
feat(server): add community, hub, bridge and gap analytics adapted from Graphify
feat(web): add WebGL knowledge graph and local graph panels
```
