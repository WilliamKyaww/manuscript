# Phase 17 — Web application hardening

**Status:** Not started · **Branch:** `phase/17-hardening`

## Objective
Make the web application robust for daily use: backups, crash safety, performance at scale, security
review, error handling, diagnostics, edge cases and offline behaviour.

## Why it exists
The desktop app (Phase 18) should wrap a stable application, not paper over defects.

## Dependencies
Phase 16.

## Atomic tasks
- [ ] **17.01** Automatic daily SQLite backups (`VACUUM INTO`, rotation) and pre-migration backups
- [ ] **17.02** Crash-safety audit: atomic writes everywhere, WAL checkpointing, startup recovery of interrupted jobs
- [ ] **17.03** Performance pass against budgets with a 10k-note / 100k-chunk fixture
- [ ] **17.04** Security review (localhost threat model re-check, CSP, dependency audit, secrets handling)
- [ ] **17.05** Error-handling audit (every API error mapped; UI messages actionable)
- [ ] **17.06** Diagnostics page (log viewer; export a diagnostics bundle without secrets)
- [ ] **17.07** Edge cases: huge PDFs, unusual encodings, Unicode and long Windows paths, read-only files
- [ ] **17.08** Offline audit: everything non-AI works without network; AI degrades gracefully
- [ ] **17.09** Accessibility re-check of all screens built since Phase 2
- [ ] **17.10** Docs: troubleshooting guide; STATE/FEATURES/journal updated

## Gate
- [ ] All tasks `[x]` · [ ] verify + E2E green · [ ] docs updated · [ ] merged

## Recommended commit messages
```text
feat(server): add automatic database backups and startup recovery
perf: meet search, indexing and graph budgets on large vaults
```
