# Phase 13 — Agentic chat interface

**Status:** Not started · **Branch:** `phase/13-chat`

## Objective
Persistent chat threads that stream answers and agent activity, render citations, ask for approvals,
show result cards with undo, and accept scoped context via mentions — available as a page and as a side
panel on every page.

## Why it exists
The main interface for agentic use cases UC-09 and UC-10 (`agent-system.md` §9).

## Dependencies
Phase 12.

## Atomic tasks
- [ ] **13.01** Migration: `chat_threads`, `chat_messages`
- [ ] **13.02** Chat service + streaming endpoint (UI message stream, persistence, resume after approval)
- [ ] **13.03** Thread list UI (create, rename, delete, search)
- [ ] **13.04** Message rendering (Markdown, citations, grounding badge)
- [ ] **13.05** Activity rows from tool parts (`describe()`, states, details disclosure)
- [ ] **13.06** Approval cards (approve once / for this chat / decline) wired to tool approvals
- [ ] **13.07** Result cards (open note, review cards, open quiz, undo)
- [ ] **13.08** Composer: mode and scope pickers, `@mentions` (notes, concepts, modules, lectures, sources), attach selection/current page, stop
- [ ] **13.09** Chat side panel (`Ctrl+J`) with page context on every page
- [ ] **13.10** Conversation compaction for long threads; token usage display
- [ ] **13.11** E2E (mock): "Create flashcards from lectures 1–3" with activity rows and result card; destructive approval flow
- [ ] **13.12** E2E (mock): "Markdown summary of consensus from Lectures 1–4 expanded with my notes" → note created, linked, shown
- [ ] **13.13** Docs: chat guide; STATE/FEATURES/journal updated

## Acceptance criteria
The brief's example interactions work end to end with the mock provider and with a real provider in a
recorded manual check.

## Gate
- [ ] All tasks `[x]` · [ ] verify + E2E green · [ ] docs updated · [ ] merged

## Recommended commit messages
```text
feat(server): add persistent chat threads with streaming agent runs
feat(web): add chat with activity timeline, approvals and result cards
```
