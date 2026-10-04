# AI education and study-tool ecosystem research

> Researched 4 October 2026 by Claude Opus 5.5. Classification legend as in
> [knowledge-management.md](./knowledge-management.md#how-to-read-this-document)
> (Emulate · Improve upon · Borrow idea · Defer · Reject · Irrelevant).
> Primary sources were preferred; for several consumer study apps only review sites were available,
> and those claims are marked *(secondary)*.

---

## 1. NotebookLM → **Gemini Notebook** (Google)

**Core concept.** A notebook of user-supplied sources with a chat that answers *grounded in those
sources* with inline citations, plus a "Studio" that generates artefacts from them.

**Observed.**
- **Renamed "Gemini Notebook" on 16 July 2026** — name and logo only; standalone product; notebooks sync
  with the Gemini app; each notebook gets a secure cloud computer for code execution
  ([Google blog](https://blog.google/innovation-and-ai/products/gemini-notebook/notebooklm-gemini-notebook/)).
- **"NotebookLM 2.0" (8 June 2026)**: chat helps *build* the source set by suggesting sources via
  research and Google Search; reasoning shown live; exports to PNG/SVG, PDF/DOCX/Markdown, CSV/JSON,
  Excel and PowerPoint; Gemini 3.5 default ([TechCrunch](https://techcrunch.com/2026/06/08/notebooklms-new-update-will-help-you-build-source-repository-from-chat/)).
- **Study features (8 September 2025)**: flashcards and quizzes generated from sources, configurable by
  count (fewer/standard/more), difficulty (easy/medium/hard), topic and a free-text focus; **each
  question links back to its source** and an "Explain" action gives a cited explanation; a
  **Learning Guide** chat mode acting as a tutor that uses *"probing, open-ended questions"* and
  step-by-step decomposition rather than direct answers; Audio Overview formats Brief / Critique / Debate
  ([Google blog](https://blog.google/innovation-and-ai/models-and-research/google-labs/notebooklm-student-features/),
  [Workspace updates](https://workspaceupdates.googleblog.com/2025/09/flashcards-quizzes-reports-notebook-lm-google-education.html)).
- Other Studio outputs over time: Audio Overviews (Sept 2024; interactive "Join" Dec 2024), Video
  Overviews (2025), mind maps, reports, infographics and slide decks (Nov 2025), data tables
  (Dec 2025) ([Wikipedia](https://en.wikipedia.org/wiki/NotebookLM)).
- Limits *(secondary)*: 50 sources per notebook on the free plan, up to 300 (Pro) / 600 (Ultra);
  200 MB and 500,000 words per source ([summary](https://elephas.app/blog/notebooklm-source-limits)).
- No spaced repetition, mastery tracking or progress over time was found in primary sources.

**Strengths.** Best-in-class grounding and citations; frictionless "sources → artefacts"; tutor mode.
**Weaknesses.** Notebook silos (no persistent knowledge graph across notebooks); generated artefacts are
not *scheduled* for learning; no mastery model; cloud-only; source caps.

| Idea | Classification | Notes / reason |
|---|---|---|
| Answers grounded only in selected sources, with inline citations to exact passages | **Emulate** | Core of Phase 10. Citations carry page/slide locators and open the source at that place |
| Every generated question/card links back to its source passage | **Emulate** | Provenance field on every card and question (data model) |
| Generation controls: count, difficulty, topic focus, free-text instructions | Emulate | Same controls in our generation dialogue |
| Learning Guide (Socratic tutor) | **Improve upon** | Tutor mode informed by the guardrail evidence (learning-science.md §3), aware of mastery and misconceptions |
| Notebook-per-topic silos | Reject | Our sources live in one knowledge base; scope is a *filter* (module, lecture range), not a silo |
| Audio/Video Overviews, infographics, slide decks | Defer | Low value per unit of effort for exam performance; podcast-style review is backlog `B-LE-09` |
| Source discovery via web search | Defer | Research mode for the dissertation (backlog `B-AI-04`) |
| Code execution sandbox | Irrelevant (for now) | |

## 2. TurboLearn AI / Turbo AI

**Core concept.** Turn lectures (live recording, audio, YouTube, PDFs, websites) into notes, flashcards,
quizzes and podcasts.

**Observed** ([turbo.ai/for-students](https://www.turbo.ai/for-students)): live lecture recording;
"high quality, editable notes instantly" with AI suggestions; flashcards "for every key concept" with
"smart spaced repetition"; "track progress and identify weak areas"; unlimited quizzes with topic/chapter
focus and difficulty "from basic to exam-level", "detailed explanations for every answer"; podcasts of
selectable length/depth; book library; collaboration. Reported 4M+ users *(secondary,
[Unite.AI](https://www.unite.ai/turbolearn-ai-review/))*.

| Idea | Classification | Notes / reason |
|---|---|---|
| Lecture recording → structured notes | **Emulate** | Phase 11 (transcription) + Phase 15 (lecture pipeline) |
| Exam-level difficulty setting and explanations for every answer | Emulate | Difficulty ladder + explanation field on every question |
| Topic/chapter-scoped practice | Emulate | Scope by module / lecture range / concept |
| Live collaborative editing | Irrelevant | |

## 3. Quizlet

**Core concept.** Flashcard sets with study modes; now an AI study platform.

**Observed.**
- **Learn mode** progresses from easier multiple-choice to harder written/flashcard questions as you
  answer correctly; a term must be answered correctly **twice** to be "known well"; it tracks what you
  struggle with and repeats it ([Quizlet Learn](https://quizlet.com/gb/features/learn),
  [Introducing the new Learn](https://quizlet.com/blog/introducing-the-new-quizlet-learn)).
- AI tools: AI practice tests, AI study guides, PDF summariser, AI flashcard maker, homework help, and a
  Socratic tutor *(secondary: [Quizlet AI tools page](https://quizlet.com/features/ai-study-tools) blocked
  automated fetch; corroborated by [Build Fast with AI](https://www.buildfastwithai.com/ai-tools/quizlet-ai))*.
- **4 August 2026 launch**: audio recording that turns live lectures into study guides and flashcards;
  podcasts from notes; **Spaced Repetition** that "resurfaces terms … at optimal times" with **retention
  insights** "showing actual mastery levels"; puzzle game; study-with-friends; Google Classroom add-on
  ([PR Newswire](https://www.prnewswire.com/news-releases/quizlet-launches-new-study-tools-built-for-the-way-students-learn-302841833.html)).
- Reported: acquisition of Coconote (lecture recording → study materials) in February 2026 and a ChatGPT
  integration in March 2026 *(secondary)*.

| Idea | Classification | Notes / reason |
|---|---|---|
| Question-type ladder: recognition (MCQ) → recall (typed) as performance improves | **Emulate** | Practice sessions escalate from recognition to production per concept (learning-system.md §6) |
| "Correct twice before known" within a session | Emulate | Session-level mastery criterion, separate from long-term FSRS scheduling |
| Retention insights showing mastery | Improve upon | Transparent, explainable mastery with components shown |
| Practice tests from notes | Emulate | Mock exams (Phase 9/11) |
| Games, social, classroom | Irrelevant | |

## 4. Anki

**Core concept.** The reference open-source spaced-repetition system: notes → cards, scheduled reviews.

**Observed.** **FSRS** (Free Spaced Repetition Scheduler) is built in and enabled per preset; FSRS-6
is available since Anki 25.07 and was trained on ~700M reviews *(secondary)*; the manual calls
**desired retention** the most important setting, with 90 % as the default "good balance", workload
rising quickly above 90 % and >97 % "not recommended"; an optimiser fits parameters to your review
history ("once every month is sufficient"); learning steps should stay under one day; a simulator
estimates workload ([Anki manual: deck options](https://docs.ankiweb.net/deck-options.html)).

| Idea | Classification | Notes / reason |
|---|---|---|
| FSRS scheduling with desired retention ≈ 0.90 | **Emulate** | `ts-fsrs` (MIT, FSRS-6) — ADR-0011 |
| Per-user parameter optimisation from review logs | Emulate (later) | Keep full review logs from day one; optimiser via `@open-spaced-repetition/binding` (backlog `B-LE-10`) |
| Workload simulator | Defer | Study planner estimates review load from FSRS due forecasts instead |
| Note types/templates, cloze deletions | Emulate | Basic, reversed, cloze card types |
| Interoperability (import/export) | Emulate | Anki-compatible TSV export/import (Phase 8/16) |
| Dated, dense UI | Improve upon | |

## 5. RemNote

**Core concept.** Notes and flashcards in one tool: write notes, mark parts as cards, review with spaced
repetition; now heavily AI-assisted.

**Observed** ([remnote.com](https://www.remnote.com/), [AI study tool](https://www.remnote.com/feature/ai-study-tool)):
generate flashcards from selected text in notes/PDFs/web pages "in two clicks"; card types include image
occlusion, Q/A, fill-in-the-blank, lists and clusters; linked references/backlinks; PDF annotation;
"every card includes an AI explanation".

| Idea | Classification | Notes / reason |
|---|---|---|
| Select text → make cards (in notes and in PDFs) | **Emulate** | Selection actions in the editor and source viewer (Phase 11) |
| Notes and cards share one knowledge base | Emulate | Shared concept model |
| Image occlusion | Defer | Useful for diagrams (backlog `B-LE-05`) |
| AI explanation attached to a card | Emulate | "Explain" action, grounded in the card's source |

## 6. StudyFetch (Spark.E)

**Observed** *(secondary: [tl;dv review](https://tldv.io/blog/studyfetch-review/),
[StudyFetch blog](https://www.studyfetch.com/blog/elevating-my-academic-journey-with-studyfetchs-spark-e-ai-tutor))*:
an AI tutor grounded in uploaded course material ("Tutor Me" lectures, voice calls), live lecture
transcription, 6–45 minute audio recaps, explainer videos, progress tracking. Voice accuracy is reported
as weak.

| Idea | Classification | Notes / reason |
|---|---|---|
| Tutor constrained to course content | Emulate | Tutor mode defaults to "my sources" grounding |
| Voice tutoring | Defer | Backlog `B-AI-06` |
| Mascot/gamified persona | Irrelevant | |

## 7. Knowt

**Observed** *(secondary: [MakeHeadway review](https://makeheadway.com/blog/knowt-review/),
[Tool Directory](https://tooldirectory.ai/tools/knowt))*: free Learn mode that adapts to weaknesses,
practice tests, spaced repetition, AI notes from video/PDF, Quizlet import, LMS integrations
(Canvas, Moodle, Google Classroom), AI tutor "Kai".

| Idea | Classification | Notes / reason |
|---|---|---|
| Import from other tools (Quizlet/Anki) | Emulate | Anki TSV first; Quizlet export format later |
| LMS integration (Moodle) | Defer | Loughborough's VLE is Moodle-based; a manual download → import flow first; direct integration is backlog `B-PL-03` (needs research, see research-questions) |

## 8. Gizmo

**Observed** *(secondary: [Gizmo App Store](https://apps.apple.com/us/app/gizmo-ai-tutor/id1610516671),
[review](https://techpoint.africa/guide/gizmo-ai-review/))*: PDFs/notes/YouTube → flashcards; spaced
repetition with active recall; multiple-choice and written questions; leaderboards, XP and streaks.

| Idea | Classification | Notes / reason |
|---|---|---|
| Frictionless "drop anything → cards" | Emulate | One-step import + generate, with review before saving |
| Streaks | Borrow idea | A quiet study-streak/consistency indicator; no leaderboards |
| Leaderboards, XP | Irrelevant | |

## 9. Lab "study modes": ChatGPT Study Mode, Gemini Guided Learning, Claude Learning Mode

**Observed** *(secondary comparisons: [Glasp](https://glasp.co/articles/ai-study-modes-compared),
[Why Try AI](https://www.whytryai.com/p/ai-study-modes))*: all three now default to guided questioning
rather than handing over answers; reviewers found Claude holds the Socratic line most consistently,
Gemini explains first encounters and diagrams best, ChatGPT is strongest on step-by-step maths with
memory across sessions.

| Idea | Classification | Notes / reason |
|---|---|---|
| Separate "tutor" behaviour from "answer" behaviour | **Emulate** | Explicit chat modes: *Ask* (answer with citations), *Tutor* (Socratic, hints first), *Quiz me* |
| Escalating hints instead of answers | Emulate | Tutor reveals hints → partial solution → full worked solution on request |

## 10. Math Academy (discovered — adaptive learning reference)

**Observed.** A hierarchical spaced-repetition system over an expert-built knowledge graph: successful
work on an advanced topic gives *fractional implicit repetition* ("FIRe") credit to the simpler topics
it encompasses; failures on a prerequisite flow forward to penalise dependent topics; "repetition
compression" chooses reviews that knock out several due topics at once
([Skycak: FIRe](https://www.justinmath.com/individualized-spaced-repetition-in-hierarchical-knowledge-structures/)).
Details in [learning-science.md](./learning-science.md#5-hierarchical-spaced-repetition-fire).

| Idea | Classification | Notes / reason |
|---|---|---|
| Knowledge graph drives scheduling (implicit credit + penalty propagation) | **Borrow idea** | Concept-level mastery uses conservative implicit credit along *confirmed* prerequisite edges (Phase 15); FSRS card schedules stay pure |
| Review compression | Borrow idea | Study planner prefers items covering several due concepts |
| Expert-built graph | Improve upon | Our graph is AI-proposed and user-confirmed; weights stay conservative and visible |

## 11. Recall

See [knowledge-management.md §14](./knowledge-management.md#14-recall-discovered): questions generated
from saved content, scheduled automatically, five-stage progression chart.

---

## 12. Capability matrix (what the field does → what we do)

| Capability | Field leaders | Field weakness | Our approach |
|---|---|---|---|
| Source ingestion | NotebookLM, Turbo, RemNote | Silos per notebook/set | One library; scope as filter |
| PDF / slide processing | All | Page/slide provenance often lost | Per-page/per-slide sections with locators (Phase 5) |
| Lecture audio/video | Turbo, Quizlet (Aug 2026), StudyFetch, Coconote | Cloud-only, opaque | Pluggable transcription (API or local), timestamps as locators (Phase 11) |
| Notes from sources | Turbo, NotebookLM | Notes are not linked into a graph | Markdown notes with wikilinks to concepts (Phase 11/15) |
| Summaries | All | Passive; weak learning value alone | Offered, but the workflow pushes to retrieval practice |
| Flashcards | Quizlet, Anki, RemNote, Gizmo | AI cards often shallow/duplicated | Quality rules (atomic, one fact, cloze), de-duplication, review before save |
| Quizzes / mock exams | NotebookLM, Turbo, Quizlet, Knowt | Rarely calibrated to exam style | Question types incl. explain/derive/code; exam-style mocks; past-paper import (backlog) |
| Active recall | Quizlet Learn, Anki | — | Recognition → production ladder |
| Spaced repetition | Anki (FSRS), Quizlet (Aug 2026), Recall | Proprietary schedulers, hidden state | FSRS-6 with full logs and visible state |
| Adaptive learning | Quizlet Learn, Math Academy | Opaque | Transparent heuristics + FIRe-style graph propagation |
| Mastery | Recall stages, Quizlet retention insights | Unexplained single numbers | Explainable components, rolled up concept → topic → module → course |
| Tutoring | Gemini Notebook Learning Guide, lab study modes, StudyFetch | Can become a crutch | Guardrailed Socratic tutor (learning-science.md §3) |
| Study planning | Largely absent | — | Deadline-, weight- and mastery-aware planner (Phase 14) |
| Grounded answers & citations | NotebookLM | Rare elsewhere | Required in "my sources" mode; general knowledge clearly labelled |
| Progress tracking | Recall, Quizlet | Streak-centric | Retention, coverage, mastery trend, time on task |

## 13. Implications

1. **Grounding + provenance everywhere** (NotebookLM's best idea) — but persistent and cross-module.
2. **Generated artefacts must be scheduled**, otherwise they are passive content (the field's biggest gap
   outside Anki/Recall/Quizlet's new SR).
3. **Adaptive practice should be transparent**: show *why* a concept is weak.
4. **Tutoring must be guardrailed** to avoid the "crutch" effect (Bastani et al., 2025).
5. **Planning is a gap in the market** and matters most for a final-year student juggling coursework
   deadlines and exams.
6. Skip what does not move marks: games, social features, mascots, podcasts (deferred), video
   generation.
