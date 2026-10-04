# Phase 4 — Lexical search and quick navigation

**Status:** Not started · **Branch:** `phase/04-search`

## Objective
Instant navigation (quick switcher) and full-text search over notes with filters, operators and
highlighted snippets, built on SQLite FTS5.

## Why it exists
Search is the most frequent knowledge-retrieval action and the lexical half of later hybrid retrieval
(ADR-0010).

## Dependencies
Phase 3.

## Atomic tasks
- [ ] **4.01** Query parser: user syntax (`"phrase"`, `-exclude`, `tag:`, `type:`, `folder:`, `module:`) → safe FTS5 query + filters; unit tests incl. hostile input
- [ ] **4.02** Search service: BM25 with column weights, snippets with highlights, filters, pagination, result types (note now; chunks in Phase 5); unit tests
- [ ] **4.03** Search API; integration tests
- [ ] **4.04** Quick-switcher service: fuzzy title/alias matching with ranking (exact > prefix > fuzzy, recency boost); unit tests
- [ ] **4.05** Recent-items tracking (opened notes; later sources/concepts); unit tests
- [ ] **4.06** Quick switcher UI (`Ctrl+O`) with keyboard navigation
- [ ] **4.07** Search page UI (`Ctrl+Shift+F`): query, filters, highlighted snippets, open note at the match
- [ ] **4.08** Command palette integration (search results section)
- [ ] **4.09** Performance test: 10,000 notes, p95 < 150 ms
- [ ] **4.10** E2E: search finds text, filters narrow results, open at match
- [ ] **4.11** Search syntax documented in `docs/guide/search.md`; STATE/FEATURES/journal updated

## Tests
4.01–4.05 unit/integration; 4.09 performance; 4.10 E2E.

## Acceptance criteria
Typing never throws FTS syntax errors; results appear within budget; filters compose.

## Documentation requirements
Search guide.

## Gate
- [ ] All tasks `[x]` · [ ] verify + E2E green · [ ] docs updated · [ ] merged

## Recommended commit messages
```text
feat(server): add FTS5 search with safe query parsing and snippets
feat(web): add quick switcher and search page
```
