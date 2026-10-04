# Phase 10 — AI foundation: providers, retrieval and grounded Q&A

**Status:** Not started · **Branch:** `phase/10-ai-foundation`

## Objective
Provider-independent model access by role, secure key storage, usage and spend tracking, optional
embeddings with hybrid search, a retrieval service with citations, and grounded Q&A with clear
"my sources" vs "general knowledge" labelling.

## Why it exists
Everything AI-related depends on these seams (ADR-0010, ADR-0012).

## Dependencies
Phases 7 and 9.

## Atomic tasks
- [ ] **10.01** Provider/role settings model (app settings) and secrets store (app data dir; Electron `safeStorage` adapter later); tests
- [ ] **10.02** Provider registry: Anthropic, OpenAI, OpenAI-compatible (Ollama/LM Studio/OpenRouter/DeepSeek), mock → AI SDK models per role; tests with the mock provider
- [ ] **10.03** Connection test, `ai_usage` recording, monthly spend cap and per-request caps; tests
- [ ] **10.04** Settings UI: providers, keys (write-only display), models per role, connection test, usage
- [ ] **10.05** *(optional when an embedding provider exists)* Embedding pipeline: `embeddings` table, embedding job for chunks and notes; tests (mock)
- [ ] **10.06** Vector search (brute-force cosine) and Reciprocal Rank Fusion in the search service; tests
- [ ] **10.07** Retrieval service for grounding (scope filters, graph expansion depth ≤ 2, passage packing within a token budget, citation keys); tests
- [ ] **10.08** Untrusted-content wrapping and sentinel neutralisation (Graphify-adapted, attributed); tests
- [ ] **10.09** Grounded Q&A streaming endpoint (scopes: my sources / knowledge base / general; citation validation); tests (mock)
- [ ] **10.10** Ask panel UI (scope picker, streaming answer, citation chips opening sources at locators, grounding badge)
- [ ] **10.11** *(optional)* "Related notes" panel from embeddings
- [ ] **10.12** E2E (mock provider): grounded answer with valid citations; clear message when no provider is configured
- [ ] **10.13** Docs: AI setup guide (providers, privacy, costs); STATE/FEATURES/journal updated

## Acceptance criteria
No key is ever sent to the client or written to logs; every citation opens the cited passage; with no
provider configured the app explains how to enable AI and nothing else breaks.

## Gate
- [ ] All required tasks `[x]` · [ ] verify + E2E green · [ ] docs updated · [ ] merged

## Recommended commit messages
```text
feat(server): add role-based AI provider registry with usage tracking
feat(server): add hybrid retrieval with citations and injection-safe context
feat(web): add grounded Ask panel with citation chips
```
