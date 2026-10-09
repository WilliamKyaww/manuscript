# 9 October 2026 — Claude Opus 5.5

- **Date:** Friday 9 October 2026
- **Time:** about 00:15–05:15 (continuing from session 9 in the 8 October journal, which closed Phase 6)
- **Agent model:** Claude Opus 5.5 (`claude-opus-5-5`)
- **Phase:** 7 — Knowledge graph (branch `phase/07-graph`)
- **Work performed:** built and verified Phase 7 end to end and merged it.

## What was done

1. **Dependencies.** graphology 0.26 (+ types), graphology-communities-louvain 2.0 (server),
   graphology-layout-forceatlas2 0.10 and Sigma 3.0.3 (web), all MIT, pinned. Sigma 4.0.0 had been
   released the day before; 3.0.3 is used with our own wrapper (ADR-0015 note).
2. **Core (7.01–7.02 contracts).** The graph vocabulary: node types, the seven storable relations and
   the node types each connects, computed relations, confidences and line styles, statuses. Contracts
   for relations, the filtered graph, neighbourhoods, paths and the report; a `data.changed` event.
3. **Relations (7.01, 7.02).** Migration `0007` with triggers for canonical nodes and the derived
   `graph_communities`; the relations service (vocabulary and existence checks, symmetric pairs
   stored once, no relation with its reverse, note ids written into files). Course and concept
   writes now publish `data.changed` through a small wrapper where services are wired up.
4. **Assembly and API (7.03, 7.07).** The graph is computed from concepts, notes, links, sources,
   the course and relations, cached by a version counter (ADR-0030), and served filtered, as a
   neighbourhood, as a path or as a report.
5. **Analytics (7.04–7.06).** Seeded Louvain with Graphify's oversized and low-cohesion splitting,
   stable ids and hub labels; Brandes betweenness (sampled above 1,000 nodes); core concepts, gaps,
   surprising connections; study prompts with actions. Community, surprise and prompt code carries
   Graphify attribution (7.11).
6. **Web (7.08–7.10).** `/graph` with Sigma, a ForceAtlas2 module worker, patterned edge programs
   for dashed and dotted edges, theme-aware colours and hover labels, legend toggles, filters,
   search-to-focus, a details panel with a path finder, and the insights panel; local graphs on
   concept pages and in the Notes Graph tab; relation editing and review on concept pages.
7. **Performance (7.12).** Graph measurements added to `npm run test:perf`; analytics reused while
   the graph's fingerprint is unchanged; size limits keep concepts first; layout fixed for large
   graphs. Rendering checked by hand with 2,500 nodes.
8. **Verification and docs (7.13, 7.14).** `e2e/graph.spec.ts`; `docs/guide/graph.md`; data model,
   knowledge-system PRD, architecture budgets, ADR-0030, backlog B-KM-14…20, FEATURES, STATE,
   README, AGENTS.md (WebGL in tests).

## Important decisions

- **ADR-0030:** the graph is computed; only relations are stored. Links and course membership are
  read from where they already live, so the graph cannot drift from the files.
- Computed link edges are `EXTRACTED` (read from files); structure and backing notes are `USER`.
- Accepting a proposed or inferred relation makes it the student's own (`USER`, accepted); the
  creator (`ai`) keeps the provenance. Rejected relations are kept so they are not proposed again.
- Size-limited graphs keep concepts and the course first: ranked by degree alone, well-linked notes
  pushed every concept out at 10,000 notes.
- Local neighbourhoods and "semantic" paths never pass through modules, lectures or topics.

## Files changed

- `packages/core/src/graph/vocabulary.ts`, `packages/core/src/api/{graph,vault}.ts`
- `apps/server/src/db/migrations/0007_relations.sql`, `apps/server/src/modules/graph/**`,
  `apps/server/src/shared/change-events.ts`, `apps/server/src/modules/index.ts`, `apps/server/src/app.ts`,
  `apps/server/test/perf/{notes-perf,graph-stages}.ts`
- `apps/web/src/features/graph/**`, `apps/web/src/features/concepts/ConceptPage.tsx`,
  `apps/web/src/features/notes/{NoteWorkspace.tsx,notes-store.ts}`, `apps/web/src/lib/events.ts`,
  `apps/web/src/router.tsx`, `apps/web/src/styles/tokens.css`, `apps/web/src/app/App.test.tsx`
- `e2e/graph.spec.ts`; `THIRD_PARTY_NOTICES.md`; docs listed above.

## Tests run

| Command | Result |
|---|---|
| `npm run verify` | **Pass** — type-check, Biome, **483** Vitest tests, build, smoke |
| `npx playwright test` | **Pass** — **74/74**; `e2e/graph.spec.ts` also passed `--repeat-each 4` |
| `npm run test:perf` | **Pass** on mains power — search p95 28 ms (100 ms with 10,000 PDF pages); graph: 5,000-node payload 97 ms from the cache (budget 500 ms), first build of 11,300 nodes 2.1 s (budget 3 s), 674 ms after a note edit (budget 1 s) |
| Manual | Screenshots of the graph (light and dark), a focused node, proposed relations, concept pages with relations and local graphs; 2,500 nodes and 4,800 edges in Chromium: canvas in 1.3 s, settled in 3 s, idle 60 fps, zooming ~15 fps with software WebGL |

## Problems encountered

- **The search budget from the Phase 6 gate.** Re-measured on mains power: within budget (28 and
  100 ms), confirming the battery explanation.
- **Concepts vanished from large graphs**: truncation by degree kept only well-linked notes. Found
  when the performance script could not find a concept to centre on.
- **Every note save rebuilt the analytics** (1.3 of 2 s at 10,000 notes). A fingerprint of the
  assembled graph now lets text-only edits keep them.
- **One mixed ball instead of clusters** with 2,500 nodes: all communities started on one small
  circle, and a gravity override fought ForceAtlas2's inferred strong gravity. Communities now start
  on a sunflower spiral and LinLog keeps them apart.
- **The local graph drew outside its box** (Sigma's canvases are absolutely positioned; the container
  needed `position: relative`), and **changing a filter lost the layout** (the canvas unmounted
  while loading; the previous graph is now kept on screen).
- Prompt wording: a bridge "linked" its own cluster to itself; it now "connects its cluster with" the
  others.
- Tooling: PowerShell still swallows `${…}` in replacement strings (twice); edits with template
  literals go through Node scripts written with the editor tools.

## Unresolved issues

- Backlog B-KM-14…20 (cluster hulls, keyboard navigation of the canvas, relation names on edges,
  relations to notes and sources in the UI, link-change detection, dismissing prompts, Sigma 4).
- The assistant proposes no relations until Phase 11, so "Check" prompts appear only for relations
  entered through the API with an inferred or ambiguous confidence.

## Next steps

Phase 8 — flashcards and spaced repetition (`phase/08-flashcards`).
