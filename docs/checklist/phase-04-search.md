
# Phase 4 — Lexical search and quick navigation

**Status:** Complete (8 October 2026) · **Branch:** `phase/04-search`

## Objective

Instant navigation (quick switcher) and full-text search over notes with filters, operators and
highlighted snippets, built on SQLite FTS5.

## Why it exists

Search is the most frequent knowledge-retrieval action and the lexical half of later hybrid retrieval
(ADR-0010).

## Dependencies

Phase 3.

## Atomic tasks

- [X] **4.01** Query parser: user syntax (`"phrase"`, `-exclude`, `tag:`, `type:`, `folder:`, `module:`) → safe FTS5 query + filters; unit tests incl. hostile input — `@skb/core` `search/query.ts`, plus `OR`, `#tag` and negated filters; every term is a quoted FTS5 string; 8 unit tests (15 hostile inputs) and 25 hostile queries against the real database
- [X] **4.02** Search service: BM25 with column weights, snippets with highlights, filters, pagination, result types (note now; chunks in Phase 5); unit tests — weights configured as the FTS5 rank (migration 0004); snippets and titles as text parts; tags AND, other filters OR; counts capped at 1,000; the line of the first match; results are a `kind` union ready for source chunks
- [X] **4.03** Search API; integration tests — `GET /api/search`; 10 server tests (ranking, prefixes, stems, accents, phrases, OR, exclusions, every filter, paging, the count cap, hostile input, index updates, recent items)
- [X] **4.04** Quick-switcher service: fuzzy title/alias matching with ranking (exact > prefix > fuzzy, recency boost); unit tests — `search/fuzzy.ts` runs in the browser over the whole vault; 7 tests incl. 10,000 candidates
- [X] **4.05** Recent-items tracking (opened notes; later sources/concepts); unit tests — `recent_items` (migration 0003), recorded when a note opens, last 100 kept, deleted notes skipped
- [X] **4.06** Quick switcher UI (`Ctrl+O`) with keyboard navigation — recent notes, highlighted matches, aliases shown, `Shift+Enter` creates a note
- [X] **4.07** Search page UI (`Ctrl+Shift+F`): query, filters, highlighted snippets, open note at the match — query in the address, filter menus and removable chips, syntax help, "Show more results"
- [X] **4.08** Command palette integration (search results section) — matching notes and "Search notes for …", ranked after sections and commands
- [X] **4.09** Performance test: 10,000 notes, p95 < 150 ms — `npm run test:perf`: p95 **47 ms** over 200 mixed queries (median 19 ms); a `CROSS JOIN` fix took tag-filtered searches from 330 ms to 21 ms
- [X] **4.10** E2E: search finds text, filters narrow results, open at match — `e2e/search.spec.ts` (4 tests: search, filters, open at the matching line, hostile queries, quick switcher with aliases and recents, palette search); `/search` also in the sticky-header and axe checks
- [X] **4.11** Search syntax documented in `docs/guide/search.md`; STATE/FEATURES/journal updated

## Tests

4.01–4.05 unit/integration; 4.09 performance; 4.10 E2E.

## Acceptance criteria

- [X] Typing never throws FTS syntax errors — parser and database tests with hostile input; E2E hostile queries
- [X] Results appear within budget — p95 47 ms (budget 150 ms) at 10,000 notes
- [X] Filters compose — tag + text, tag + tag, module + negated tag, folder + text (server tests, E2E)

## Documentation requirements

Search guide (`docs/guide/search.md`).

## Gate

- [X] All tasks `[x]` · [x] verify (357 Vitest tests) + E2E (70 Playwright tests) green · [x] docs updated · [x] merged

## Recommended commit messages

```text
feat(server): add FTS5 search with safe query parsing and snippets
feat(web): add quick switcher and search page
```
