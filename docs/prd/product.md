# Product

> PRD v0.1 — 4 October 2026 — Claude Opus 5.5. Status: **draft for the user's review**; assumptions are
> marked ⚠ and tracked in `docs/backlog/research-questions.md`.

## 1. Vision

A personal **Knowledge & Learning OS**: one application where everything I study — lectures, slides,
papers, notes, code — becomes a connected, searchable knowledge base that **actively teaches it back to
me**, tells me how well I know it, and plans what to do next, with an AI agent that can act on all of it
safely.

> *What do I know? What do I need to learn? How well do I understand it? What should I do next?*

## 2. Problem

- Course material is scattered (VLE downloads, slides, recordings, notes, code) and disconnected.
- Note-taking tools store knowledge but do not help me *remember* or *practise* it.
- AI study tools generate summaries and flashcards from one upload at a time, in silos, and rarely
  schedule what they generate; their answers often blur what the lecture said with what the model
  invented.
- Revision effort is not allocated by evidence: I cannot see which concepts are weak, which assessments
  carry the most weight, or how much review is due.

## 3. Target user

Single user: a **final-year Computer Science & Artificial Intelligence student at Loughborough
University** aiming for an **85 %+ final-year average**. Technical modules (algorithms, distributed
systems, machine learning, theory, programming), some business/professional modules, coursework,
exams, and a final-year project/dissertation. Comfortable with Markdown, Git and VS Code; uses Windows.

Non-target (for now): other students, teachers, teams, mobile-first use.

## 4. Assumed personal workflow ⚠ (to be confirmed)

| When | Activity | What the app must do |
|---|---|---|
| Before a lecture | Skim slides | Import slides from the VLE download; show concepts already known; optional pre-questions |
| During/after a lecture | Notes; slides; maybe recording | Lecture page combining slides, notes, recording transcript |
| Same day | Consolidate | Proposed lecture notes, concepts and cards from the material → review and accept |
| Daily (10–40 min) | Spaced review | Due cards and questions, weakest first |
| Weekly | Labs, problem sheets, coursework | Practice on weak concepts; deadline tracking; coursework time blocks |
| Revision periods (January, May/June) | Exam preparation | Mock exams per module, mastery-driven revision plan, exam-aware retention |
| Throughout the year | Dissertation/project | Paper library, reading notes, citations, research Q&A over papers |

## 5. Goals and success criteria

| ID | Goal | Measure (personal, observable in the app) |
|---|---|---|
| G1 | Turn lectures into practice quickly | Median time from importing a lecture to its first review session ≤ 1 day; ≤ 15 min of effort to accept generated material |
| G2 | Retain what is studied | FSRS true retention on due reviews ≥ 85 % (target retention 90 %) |
| G3 | Cover the syllabus | ≥ 90 % of a module's accepted concepts have at least one practice item before its exam |
| G4 | Spend effort where marks are | Planner allocations visibly follow assessment weight × mastery gap × urgency; user follows ≥ 70 % of plan items |
| G5 | Trust the AI | Every source-grounded answer cites passages that open at the right page/slide; uncited content is labelled as general knowledge |
| G6 | Own the data | All notes are Markdown files usable in Obsidian; full export restores into a fresh install |
| G7 | Work without AI | Notes, search, sources, graph, cards, quizzes and planning all work with no provider configured |
| G8 | Ultimately | Final-year average ≥ 85 % (outside the app's control; the app's job is G1–G5) |

Engineering success criteria: app starts in < 3 s on the development laptop; search returns in < 150 ms
for 10,000 notes and 100,000 chunks; no data loss across crashes (WAL + atomic file writes); every phase
gate passes with tests green.

## 6. Non-goals

- Multi-user collaboration, sharing, comments, permissions.
- A general-purpose database builder (Notion/Bases style) — domain-specific views only.
- Plugin API for third parties.
- Block references/transclusion inside Markdown.
- Cloud hosting or sync service of our own (the vault folder can be synced by the user's own tools).
- Mobile apps (responsive web layout is enough for occasional phone use later).
- Gamification (leaderboards, XP), mascots, social features.
- Generating podcasts, videos or slide decks (deferred).

## 7. Product principles

1. **Learning over content.** Retrieval practice and spacing are the default path; summaries are inputs.
2. **Files over app.** Notes are Markdown files I own; originals are preserved; structured data is in an
   open, documented SQLite file with exports.
3. **AI proposes, I decide.** Generated concepts, links, cards and edits arrive as proposals or are
   reversible; destructive actions always ask.
4. **Provenance everywhere.** Every generated artefact links back to the exact source location; AI
   inference is labelled as inference.
5. **Explainable numbers.** Mastery, priorities and plans show their reasons.
6. **Works offline, AI optional.** The app is useful with no network and no API key.
7. **Deep integration over feature count.** Each feature must improve capture, understanding,
   connection, memory or application of knowledge — otherwise it is deferred.
8. **Calm, fast, keyboard-friendly UI** for long sessions; sticky headers everywhere.

## 8. Key use cases

| ID | Use case | Phase(s) |
|---|---|---|
| UC-01 | Write and link Markdown notes with maths, code and diagrams; see backlinks | 3 |
| UC-02 | Find anything instantly (quick switcher, full-text search with filters) | 4 |
| UC-03 | Import lecture slides/PDFs/DOCX into a module and read them with page/slide navigation | 5, 6 |
| UC-04 | Organise modules, lectures, topics, concepts, assessments and deadlines | 6 |
| UC-05 | Explore the knowledge graph; see core concepts, gaps and cross-module bridges | 7, 15 |
| UC-06 | Review flashcards on an FSRS schedule with a fast keyboard flow | 8 |
| UC-07 | Practise with quizzes and mock exams; see explainable mastery and weak areas | 9 |
| UC-08 | Ask questions answered only from my lecture material, with citations | 10 |
| UC-09 | "Create flashcards from the first three slides of Lecture 4" — generated, reviewed, saved, studied | 11, 13 |
| UC-10 | "Create a Markdown summary of consensus using Lectures 1–4, expanding with my notes" — agent finds, synthesises, saves, links and shows the result | 12, 13 |
| UC-11 | Be tutored Socratically on a weak concept, ending with a check question | 14 |
| UC-12 | Get a 7-day study plan from deadlines, weights, due reviews and mastery | 14 |
| UC-13 | Upload a lecture and have notes, concepts, links, cards and a quiz proposed automatically | 15 |
| UC-14 | Export everything, open the vault in Obsidian, back up and restore | 16 |
| UC-15 | Use the same app as a Windows desktop application installed from an installer | 18, 19 |
| UC-16 | Let Claude Code/Desktop query my knowledge base through MCP | 12 |

## 9. Release slices

| Slice | Phases | Outcome |
|---|---|---|
| **Foundation** | 0–2 | Running app shell (web), documentation workflow |
| **Knowledge MVP** | 3–7 | Usable Markdown knowledge base with sources, course structure and graph — no AI needed |
| **Learning MVP** | 8–9 | Daily FSRS reviews, quizzes and mastery — no AI needed |
| **AI layer** | 10–14 | Grounded Q&A, generation, agent chat, tutor, planner |
| **Integrated OS** | 15–17 | The full lecture → mastery loop; portability; hardening |
| **Desktop & release** | 18–22 | Electron app, installer, polish, verification, v1.0 |

## 10. Open questions

See `docs/backlog/research-questions.md` (RQ-01 … ). The most important for the user: confirm the
workflow in §4, the VLE/recording sources available, the module list and assessment weights, and
preferred AI providers/budget.
