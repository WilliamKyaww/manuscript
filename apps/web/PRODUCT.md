# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

The same single-page application runs in a browser tab and inside the Windows desktop app (Electron), which is
where it is mostly used. The desktop shell adds native pickers, Explorer integration and a slim title bar; it does
not change the design language.

## Users

- **Primary:** one final-year Computer Science & Artificial Intelligence student at Loughborough University,
  aiming for an 85 %+ final-year average. Technical modules (algorithms, distributed systems, machine learning,
  theory, programming), some business and professional modules, coursework, exams and a final-year project.
  Comfortable with Markdown, Git and VS Code; works on a Windows laptop.
- **Possibly later:** other students. Nothing is built for them yet, but first-run, setup and wording should not
  assume knowledge of the code or the repository.
- **Not users:** teachers, teams, collaborators; no multi-user, sharing or permissions.

## Product Purpose

A personal Knowledge & Learning OS: one application where lectures, slides, papers, notes and code become a
connected, searchable knowledge base that teaches itself back, says how well each concept is known, and plans
what to do next — with an optional AI agent that acts on all of it safely.

It exists because note-taking tools store knowledge without helping anyone remember or practise it, and AI study
tools generate material in silos without scheduling it or keeping it tied to the lecture.

Success is personal and observable in the app: lectures turned into practice within a day; FSRS retention on due
reviews of at least 85 %; at least 90 % of a module's concepts with a practice item before its exam; effort that
follows assessment weight, mastery gap and urgency; AI answers that cite the right page or slide; notes usable in
any Markdown editor; everything except AI working with no provider configured.

## Positioning

The learning loop runs on the student's own files: lecture → concepts → knowledge graph → study material →
practice → mastery → weak concepts → targeted study. Notes stay plain Markdown in a folder the student owns
(Obsidian-compatible), lecture originals are kept byte for byte with page- and slide-precise locators, mastery is
computed from evidence and never set by hand, and the AI can only act through registered, logged, undoable tools
that ask before anything destructive.

## Operating Context

- **Mostly the installed desktop app** on the Windows laptop, in long study sessions; a browser tab
  (`run-web.bat`) works the same.
- **Manuscript replaces Obsidian** as the place to write. The vault stays Obsidian-compatible, and where Obsidian
  already has an answer (its menus, their order and wording, its keys and conventions) Manuscript follows it, so
  the move feels familiar.
- The assumed rhythm (from the brief, not yet confirmed in detail): skim slides before a lecture; notes during and
  after; consolidate the same day by accepting proposed notes, concepts and cards; 10–40 minutes of spaced review
  daily; weekly labs, problem sheets and coursework; revision periods in January and May–June; a dissertation
  through the year.
- Material arrives as VLE downloads (PDF, PPTX, DOCX), recordings and code; marks and deadlines come from module
  handbooks.
- The laptop runs hot under heavy load; the app is expected to stay light in daily use.

## Capabilities and Constraints

- **Capabilities (1.1.0):** Markdown notes with wikilinks, backlinks, maths, code and Mermaid; tabs and two panes;
  Obsidian's file menus; version history; full-text search; a source library; modules, lectures, topics,
  assessments and a mark calculator; concepts and a knowledge graph; FSRS-6 flashcards; questions, quizzes and mock
  exams; explainable mastery and progress; a study plan; optional AI (grounded answers with citations, generation
  into an Inbox, a tutor, an agentic chat with approvals and undo, an MCP server); export, restore, backups.
- **Constraints:** local-first — the server listens only on the local machine and the app works offline; notes are
  canonical Markdown files (only an `id` key may be added automatically); the interface talks to the server only
  over HTTP; the app must be fully useful without AI; British English in every word of the interface; internal
  identifiers keep the `skb` prefix.
- **Terminology:** vault, note, source, module, lecture, topic, concept, card, card set, question, quiz, mock exam,
  mastery, Inbox (proposals waiting for a decision), Today, plan.
- **Non-goals:** collaboration and sharing; a general database builder; a plugin API; block references; a hosted
  cloud or sync service; mobile apps; gamification, mascots or social features.

## Brand Commitments

- **Name:** Manuscript (ADR-0027). The logo is the app icon in `apps/web/public/favicon.svg`.
- **Voice:** British English; plain, exact sentences that say what happens and what is kept; buttons named for what
  they do (never "OK"); no hype.

## Evidence on Hand

- Screenshots of every screen in both themes (`docs/screenshots/`, regenerated by `e2e/screens.spec.ts`).
- User guides for every area (`docs/guide/`), the changelog, and the product requirements (`docs/prd/`).
- No other users, testimonials, usage figures or published results exist; future work must not invent them.

## Product Principles

1. **Learning over content.** Retrieval practice and spacing are the default path; summaries are inputs.
2. **Files over app.** The student's knowledge is never hostage to the application.
3. **AI proposes, the student decides.** Generated material arrives as proposals or is reversible; destructive
   actions always ask; numbers like mastery and priorities show their reasons.
4. **Familiar where a convention exists.** Where Obsidian (or the operating system) already has an answer, follow
   it rather than invent one.
5. **Calm and fast for long sessions,** keyboard-first, readable to someone who has never seen the code.

## Accessibility & Inclusion

WCAG 2.2 AA: every route is checked with axe in light and dark themes; full keyboard operation with a shortcut cheat
sheet; visible focus; reduced motion respected; panes keep their headers fixed while their content scrolls. A
screen-reader (Narrator) spot check is still the student's to do.
