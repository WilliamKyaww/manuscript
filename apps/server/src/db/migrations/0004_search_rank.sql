-- 0004_search_rank — configure the FTS5 rank function once, so queries can `ORDER BY rank` and let
-- FTS5 rank internally. Column weights: title (with aliases) 10, headings 4, body 1, tags 2
-- (knowledge-system.md §4).
INSERT INTO notes_fts (notes_fts, rank) VALUES ('rank', 'bm25(10.0, 4.0, 1.0, 2.0)');
