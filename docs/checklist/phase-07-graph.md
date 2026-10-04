# Phase 7 — Knowledge graph

**Status:** Not started · **Branch:** `phase/07-graph`

## Objective
A typed, provenance-tagged knowledge graph over concepts, notes, sources, lectures and modules, with
Graphify-inspired analytics that generate study prompts, and an interactive WebGL graph UI.

## Why it exists
The graph must be meaningful, not decorative: it reveals core concepts, gaps and cross-module bridges
and later carries mastery (ADR-0015, ADR-0020).

## Dependencies
Phase 6.

## Atomic tasks
- [ ] **7.01** Migration: `relations`
- [ ] **7.02** Relations service + API (create/update/delete; confidence, score, status, evidence; vocabulary validation); tests
- [ ] **7.03** Graph assembly with graphology from entities, relations, wikilinks, structure and provenance; server-side filters; cache keyed by a graph version counter; tests
- [ ] **7.04** Analytics: core concepts (degree excluding structural hubs); Louvain communities with oversized/low-cohesion re-splitting, stable IDs and hub-based labels (Graphify-adapted, attributed); tests
- [ ] **7.05** Analytics: bridges (sampled betweenness), isolated concepts, surprising-connection scoring, shortest path; tests
- [ ] **7.06** Study prompts from analytics (gaps, bridges, ambiguous/inferred verification, low-cohesion clusters); tests
- [ ] **7.07** Graph API: global (filtered), local neighbourhood (depth 1–2), path, analytics report; integration tests
- [ ] **7.08** Graph UI: Sigma renderer, ForceAtlas2 in a worker, community legend with toggles, search-to-focus, side panel, filters, edge styles by confidence (solid/dashed/dotted)
- [ ] **7.09** Local graph panel on note and concept pages
- [ ] **7.10** Relation editing UI on concept pages (add typed relation; accept/reject proposed relations)
- [ ] **7.11** `THIRD_PARTY_NOTICES.md` entries and code headers for Graphify-adapted modules
- [ ] **7.12** Performance: 5,000-node payload < 500 ms server time; interactive rendering verified
- [ ] **7.13** E2E: graph renders, filters work, clicking a node opens its page
- [ ] **7.14** Docs: graph guide (legend, confidence styles); STATE/FEATURES/journal updated

## Acceptance criteria
Every edge shows its relation, confidence and evidence; analytics output is deterministic for the same
input; prompts link to actions.

## Gate
- [ ] All tasks `[x]` · [ ] verify + E2E green · [ ] docs updated · [ ] merged

## Recommended commit messages
```text
feat(server): add typed relations and graph assembly with graphology
feat(server): add community, hub, bridge and gap analytics adapted from Graphify
feat(web): add WebGL knowledge graph and local graph panels
```
