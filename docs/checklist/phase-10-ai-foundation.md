# Phase 10 — AI foundation: providers, retrieval and grounded Q&A

**Status:** Complete (9 October 2026) · **Branch:** `phase/10-ai-foundation`

## Objective
Provider-independent model access by role, secure key storage, usage and spend tracking, optional
embeddings with hybrid search, a retrieval service with citations, and grounded Q&A with clear
"my sources" vs "general knowledge" labelling.

## Why it exists
Everything AI-related depends on these seams (ADR-0010, ADR-0012).

## Dependencies
Phases 7 and 9.

## Atomic tasks
- [x] **10.01** Provider/role settings model (app settings) and secrets store (app data dir; Electron `safeStorage` adapter later); tests — `ai.json` and `secrets.json` (mode 0600) in the data directory behind store interfaces; damaged files fall back to defaults (ADR-0033)
- [x] **10.02** Provider registry: Anthropic, OpenAI, OpenAI-compatible (Ollama/LM Studio/OpenRouter/DeepSeek), mock → AI SDK models per role; tests with the mock provider — roles chat, fast, embedding, each saying what is missing; `SKB_AI_PROVIDER=mock` gives deterministic chat and embedding models; an injected `fetch` stands in for a provider in tests
- [x] **10.03** Connection test, `ai_usage` recording, monthly spend cap and per-request caps; tests — key-like text scrubbed from provider errors; costs from per-role prices; 80 % warning, refusal when spent; output caps per role, context budget, 120 s answer timeout
- [x] **10.04** Settings UI: providers, keys (write-only display), models per role, connection test, usage — Settings → AI with limits and semantic-search progress
- [x] **10.05** *(optional when an embedding provider exists)* Embedding pipeline: `embeddings` table, embedding job for chunks and notes; tests (mock) — chunks of ready sources and notes, batched, re-run after imports, edits and model changes; coalesced jobs now move earlier when asked to run sooner
- [x] **10.06** Vector search (brute-force cosine) and Reciprocal Rank Fusion in the search service; tests — normalised 8-bit vectors searched in memory; the fusion lives in retrieval so the Search page stays full-text (semantic results there: B-AI-08)
- [x] **10.07** Retrieval service for grounding (scope filters, graph expansion depth ≤ 2, passage packing within a token budget, citation keys); tests — full text, concepts named plus two relation steps, and semantic neighbours fused by reciprocal rank; note passages by section with heading and line; module, lecture and source scopes
- [x] **10.08** Untrusted-content wrapping and sentinel neutralisation (Graphify-adapted, attributed); tests — `packages/core/src/ai/untrusted.ts`, attributed in THIRD_PARTY_NOTICES.md
- [x] **10.09** Grounded Q&A streaming endpoint (scopes: my sources / knowledge base / general; citation validation); tests (mock) — `POST /api/ai/ask` streams JSON lines; unknown keys dropped; "not in your sources" without a model call
- [x] **10.10** Ask panel UI (scope picker, streaming answer, citation chips opening sources at locators, grounding badge) — Ctrl+J, the sidebar and the command palette; narrowed to the page on screen; citations open the page, slide or line
- [x] **10.11** *(optional)* "Related notes" panel from embeddings — "Similar notes" in the Backlinks tab, from stored vectors (no provider request)
- [x] **10.12** E2E (mock provider): grounded answer with valid citations; clear message when no provider is configured — `e2e/ask.spec.ts`: a mock-model answer whose citation opens page 2 of the PDF, with axe; the shared server explains how to set AI up
- [x] **10.13** Docs: AI setup guide (providers, privacy, costs); STATE/FEATURES/journal updated — `docs/guide/ai.md`; ADR-0033; agent-system, data-model and architecture PRDs; backlog B-AI-08…12

## Acceptance criteria
- [x] No key is ever sent to the client or written to logs — settings responses carry only `hasKey` (tested: the key never appears in the response or in `ai.json`); provider errors are scrubbed of key-like text before they are shown or logged (tested with a provider echoing the key); the logger redacts key-named fields
- [x] Every citation opens the cited passage — citations to passages not given are dropped (tested); citations link to their locator (component test) and open the PDF page in the E2E test
- [x] With no provider configured the app explains how to enable AI and nothing else breaks — the Ask panel and Settings say what is missing (E2E); every other test runs with AI off

## Gate
- [x] All required tasks `[x]` · [x] verify (601 Vitest tests) + E2E (81 Playwright tests) green · [x] performance budgets met (retrieval p95 404 ms) · [x] docs updated · [x] merged

## Recommended commit messages
```text
feat(server): add role-based AI provider registry with usage tracking
feat(server): add hybrid retrieval with citations and injection-safe context
feat(web): add grounded Ask panel with citation chips
```
