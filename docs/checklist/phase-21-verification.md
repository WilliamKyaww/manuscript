# Phase 21 — Full verification: testing, reliability and accessibility

**Status:** Not started · **Branch:** `phase/21-verification`

## Objective
Verify the whole system after polish: end-to-end coverage of every use case, accessibility, reliability,
performance, mastery calibration, AI grounding quality, web/desktop parity and security.

## Dependencies
Phase 20.

## Atomic tasks
- [ ] **21.01** E2E coverage of use cases UC-01 … UC-16 (`product.md` §8)
- [ ] **21.02** Accessibility audit: axe on all screens, keyboard-only walkthrough, screen-reader spot checks
- [ ] **21.03** Reliability: parser fuzz tests; 8-hour soak test of ingestion and review loops
- [ ] **21.04** Mastery calibration check (predicted vs actual recall) with a report
- [ ] **21.05** Personal AI evaluation set (~50 questions) for grounding and citation accuracy across configured providers
- [ ] **21.06** Performance budgets verified in web and desktop modes
- [ ] **21.07** Web/desktop parity check
- [ ] **21.08** Security re-review and dependency audit
- [ ] **21.09** Docs: verification report in `docs/journal/`; STATE/FEATURES updated

## Gate
- [ ] All tasks `[x]` · [ ] all suites green · [ ] report written · [ ] merged

## Recommended commit messages
```text
test: complete end-to-end coverage of all primary use cases
```
