# Phase 13 — Agentic chat interface

**Status:** Complete · **Branch:** `phase/13-chat`

## Objective
Persistent chat threads that stream answers and agent activity, render citations, ask for approvals,
show result cards with undo, and accept scoped context via mentions — available as a page and as a side
panel on every page.

## Why it exists
The main interface for agentic use cases UC-09 and UC-10 (`agent-system.md` §9).

## Dependencies
Phase 12.

## Atomic tasks
- [x] **13.01** Migration: `chat_threads`, `chat_messages` — `0013_chat.sql`: threads carry their settings, the model's history, a summary, a paused run and usage
- [x] **13.02** Chat service + streaming endpoint (UI message stream, persistence, resume after approval) — `POST /api/chat/threads/:id/messages` and `…/approvals` stream JSON lines (ADR-0036, not the AI SDK UI stream); a paused run is saved with the thread and resumed by the decisions; the runner now keeps every step's messages
- [x] **13.03** Thread list UI (create, rename, delete, search) — `/chat`: search (titles and messages), rename, delete, "waiting for you" badge
- [x] **13.04** Message rendering (Markdown, citations, grounding badge) — Markdown with maths and code, citations that open the passage, grounding badge, dropped citations listed, passages used
- [x] **13.05** Activity rows from tool parts (`describe()`, states, details disclosure) — one row per call with a state icon, risk badge and a Details disclosure (arguments, result, reason)
- [x] **13.06** Approval cards (approve once / for this chat / decline) wired to tool approvals — approve / approve for this chat / decline; destructive calls only once; several waiting calls are answered together
- [x] **13.07** Result cards (open note, review cards, open quiz, undo) — Open note, Review in the Inbox, Open card set, Open Practice, and Undo (refused by the server once something changed)
- [x] **13.08** Composer: mode and scope pickers, `@mentions` (notes, concepts, modules, lectures, sources), attach selection/current page, stop — mode and scope pickers, @mentions with the keyboard, the open page and "Only this …", selected text, Stop
- [x] **13.09** Chat side panel (`Ctrl+J`) with page context on every page — docked panel beside the page; Esc closes it; "Open in the Chat page"; replaces the Ask dialogue (`/api/ai/ask` stays)
- [x] **13.10** Conversation compaction for long threads; token usage display — older turns summarised past the context budget; answers, tokens and cost shown per thread
- [x] **13.11** E2E (mock): "Create flashcards from lectures 1–3" with activity rows and result card; destructive approval flow — `e2e/chat.spec.ts`: activity rows, result card, decline, approve once, Undo; axe on the way
- [x] **13.12** E2E (mock): "Markdown summary of consensus from Lectures 1–4 expanded with my notes" → note created, linked, shown — `e2e/chat.spec.ts`: a note written from slides and the student's note, linked, shown in preview
- [x] **13.13** Docs: chat guide; STATE/FEATURES/journal updated — `docs/guide/chat.md`, ADR-0036, PRD updates, STATE, FEATURES, backlog, journal

## Acceptance criteria
The brief's example interactions work end to end with the mock provider and with a real provider in a
recorded manual check. _The mock-provider half is automated and passes. The manual check with a real provider is the student's to do and record: the steps are at the end of `docs/guide/chat.md`._

## Gate
- [x] All tasks `[x]` · [x] verify + E2E green · [x] docs updated · [x] merged

## Recommended commit messages
```text
feat(server): add persistent chat threads with streaming agent runs
feat(web): add chat with activity timeline, approvals and result cards
```
