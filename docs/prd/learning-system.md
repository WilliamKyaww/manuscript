# Learning system — "What do I need to learn, how well do I know it, what next?"

> PRD v0.1 — 4 October 2026. Evidence base: `docs/research/learning-science.md`. All numeric
> thresholds below are **initial values**, defined as named constants in `@skb/core` and tuned only with
> a recorded decision.

## 1. Course structure (Phase 6)

```text
Course (e.g. "Year 3 — CS & AI")
 └─ Module (code, title, credits, semester, target mark)
     ├─ Lecture / lab / tutorial (key L03, week, date) ── Sources, Notes
     ├─ Topic (optional hierarchy) ── Concepts
     └─ Assessment (exam | coursework | test | project; weight; due date; achieved mark)
Concept ── may belong to several modules/topics (cross-module connections)
```

Modules are tied to the vault by their **code** (`Sources/<code>/`, a note's `module:` property) and a
note belongs to a lecture by its `lecture:` property; the files are the record of those associations
(ADR-0029). Lecture ↔ source links are kept by the app. Archived modules still count towards their
course; only planned (not submitted or marked) assessments are deadlines.

**Mark calculator** (Phase 6, `@skb/core` `learning/marks.ts`): module mark = Σ weightᵢ × markᵢ; for a
target T the required mark on the remaining assessments is `(T − Σ achieved weightᵢ·markᵢ) / Σ remaining
weightᵢ`, where weight not yet given to an assessment counts as remaining; the outcome is *needed*
(with that average), *secured*, *out of reach* (with the best still possible) or *missed* (with the
final mark). The year average is credit-weighted across modules. Shown on the module page, the course
card and Today against the target.

## 2. Concepts as the unit of learning

Cards and questions link to one or more concepts. Mastery is computed per concept and rolled up.
A card or question with no concept still schedules and counts towards its module, but the UI nudges
linking (AI can propose links in Phase 11).

## 3. Flashcards (Phase 8)

| Aspect | Specification |
|---|---|
| Kinds | `basic` (front → back), `reversed` (both directions), `cloze` (`{{c1::…}}` or `{{c1::…::hint}}`). A card has one **face** per direction or cloze number, each scheduled on its own (ADR-0031) |
| Content | Markdown with KaTeX, code and images; optional `extra` shown after reveal; source locator ("Show source") |
| Authoring | Card editor; quick-add (`Ctrl+Shift+A`); from a selection in a note or source; AI generation (Phase 11) |
| Quality rules (shown as editor hints) | One fact per card; prefer cloze for definitions; avoid sets/lists; add context; keep answers short (after Wozniak's *20 rules of formulating knowledge*) |
| Organisation | Card sets (decks) per module/lecture; concepts (card tags: backlog B-LE-18) |
| States | `draft` (generated, unreviewed) · `active` · `suspended` · `deleted` (soft) |
| Import/export | Anki's notes-in-plain-text format per set (task 8.11); everything as JSON in Phase 16 |

### 3.1 Scheduling — FSRS-6 via `ts-fsrs` (ADR-0011)

| Setting | Default |
|---|---|
| Desired retention | **0.90** (user range 0.80–0.95; warning above 0.93) |
| Learning steps / relearning steps | 1 min, 10 min / 10 min |
| Maximum interval | 365 days |
| Fuzz | On |
| New cards per day | 20 (a per-module limit: backlog B-LE-19) |
| Reviews per day | Unlimited (optional limit) |
| Parameters | FSRS-6 defaults; per-user optimisation once ≥ 1,000 reviews exist (backlog `B-LE-10`) |

Every rating writes the face's schedule and a review log row, with the schedule before and after;
logs are append-only, so "undo last rating" restores the previous schedule from the log and records
the undo as a row of its own. Days run from 04:00 to 04:00 local time. ts-fsrs keeps Hard, Good and
Easy at least a day apart, so the longest interval can exceed the maximum by up to two days.

### 3.2 Review session

Queue: learning/relearning faces due now → review faces due today ordered by **lowest current
retrievability** first (most at risk) → new faces up to the daily limit, taking sets in turn. When
nothing else is left, learning faces due within 20 minutes are shown early; a session ends when
nothing is due within 20 minutes. Keyboard: `Space` reveal; `1`–`4` Again/Hard/Good/Easy (buttons show the
next interval); `Ctrl+Z` undo; `E` edit; `S` suspend; `B` bury until tomorrow; `O` open source at
locator. Session summary: cards, true retention, time, concepts touched, lapses.

Focus mode (`F`) hides the page's description, actions and secondary buttons and enlarges the card;
the header itself stays, so no exception to the sticky-header rule (`ui.md` §2) was needed.

## 4. Questions (Phase 9)

| Kind | Grading | Notes |
|---|---|---|
| `mcq`, `multi`, `true_false` | Automatic | Distractors with per-option explanations |
| `numeric` | Automatic with tolerance (absolute/relative) and units text | |
| `short` | Automatic (normalised exact / accepted variants) → else self-grade | AI grading option in Phase 11 |
| `explain` | Self-grade against model answer + rubric (0, ½, 1) → AI rubric grading in Phase 11 | Elaborative interrogation / self-explanation |
| `derivation` (maths/proof) | Self-grade with step rubric; hints | KaTeX |
| `code` | Self-grade with model solution; test-based grading is backlog `B-LE-07` | |

Every question has an explanation and, when generated from material, a source locator.

**As built (Phase 9).** A question's kind is its answer key's kind (`@skb/core` `QuestionAnswerSchema`;
options, with a per-option explanation, live inside the key). Questions also carry a hint (using it, or
opening the source, marks the answer *assisted*), a rubric for self-graded kinds, difficulty 1–5, a
module, a lecture, tags and concepts. A short answer that matches no accepted form is not marked
wrong: it waits for the student's own grade, like the open kinds. Self-grades are 0, ½ or 1 and are
given once. Questions are deleted softly; answers to deleted questions stop counting.

## 5. Quizzes and mock exams (Phase 9)

- **Practice quiz**: scope (module, lectures, topics, concepts, tags), count, kinds mix, difficulty;
  immediate feedback with explanation and source link.
- **Mock exam**: timed, no feedback until submission, mirrors the assessment's duration and question
  style; results feed mastery with full weight.
- Retake wrong answers; export to Markdown.

**As built (Phase 9).** Each part of a scope narrows the choice (module: filed under it or linked to
one of its concepts; lectures: filed under them; topics: linked to concepts in them or their
subtopics; concepts; tags), any match within a part; kinds and difficulty filter too. The chosen
questions are shuffled with a seed from the quiz id, so a quiz is reproducible, and stored as its
items. A mock exam takes the rehearsed assessment's duration unless given minutes, orders recognition
→ recall → production, keeps a draft (not evidence) and is graded on submission; blanks score 0. A
retake is a new practice quiz of the questions not answered fully right.

## 6. Adaptive practice session ("Learn")

For a scope, repeatedly:
1. pick the concept with the highest **priority** (§9) among those with practice material;
2. pick an item using the **ladder** — recognition (`mcq`/`true_false`) → recall (`short`/card) →
   production (`explain`/`derivation`/`code`) — moving up after a correct answer and down after an error;
3. a concept is **"secure for this session"** after two correct answers at recall level or above
   (Quizlet Learn's "correct twice" rule);
4. interleave concepts (never more than two consecutive items for one concept unless it is the only one);
5. finish at the time limit or when every concept in scope is secure; summarise.

Session results are mastery evidence; cards answered in the session are **not** rescheduled by FSRS
unless they were due (prevents early-review inflation).

**As built (Phase 9, ADR-0032).** Learn asks **questions only**; cards in Learn sessions are backlog
B-LE-24 (their reviews stay in Review). A session is an `adaptive` quiz: its concepts with their
priority and stage, and the questions it may ask, are fixed when it starts, and its state is rebuilt
from its answers (`@skb/core` `practiceSession`, seeded by the quiz id), so the server keeps nothing
else. A concept starts at recognition (new, learning), recall (practised) or production (confident,
mastered), capped at its highest rung with material; the nearest rung with material is asked (the
lower on a tie); unseen questions first, never the one just asked if there is another. A score of
0.75 or more climbs, below 0.5 steps down, between stays. A concept with nothing at recall or above
is secure after two right answers at its top rung. Priority halves each time a concept is shown, so
sessions move around rather than drill one concept. An answer awaiting its self-grade holds the
session until graded.

## 7. Mastery model (Phase 9) — transparent heuristic

For concept *c* at time *now*:

```text
Cards:    for each linked active card that has been reviewed: rᵢ = FSRS retrievability(now)
          recall_c = mean(rᵢ);            n_r = number of such cards
Answers:  last 20 answers to linked questions:
          wⱼ = 0.5^(age_daysⱼ / 21) × (assistedⱼ ? 0.5 : 1)
          accuracy_c = Σ wⱼ·scoreⱼ / Σ wⱼ   (only if Σ wⱼ ≥ 0.5);   n_a = Σ wⱼ
Mastery:  m_c = (recall_c·n_r + 1.5·accuracy_c·n_a) / (n_r + 1.5·n_a)   — or whichever exists; none ⇒ "New"
Evidence: E = n_r + 1.5·n_a  →  confidence low (E < 3) · medium (3 ≤ E < 8) · high (E ≥ 8)
Coverage: items practised at least once / items linked (cards + questions)
```

Questions weigh 1.5× because they test understanding and application rather than recall only.

**As built (Phase 9).** Each reviewed *face* of an active card counts once (a reversed card has two).
Answer ages are whole review days (04:00 to 04:00), so a fresh answer weighs exactly 1 and the
displayed components reproduce the figure by hand. Answers to deleted questions do not count.

| Stage | Rule |
|---|---|
| New | No evidence |
| Learning | m < 0.60, or any linked card currently in learning/relearning |
| Practised | 0.60 ≤ m < 0.80 |
| Confident | 0.80 ≤ m < 0.90, or m ≥ 0.90 without high confidence |
| Mastered | m ≥ 0.90, high confidence, and median stability of reviewed cards ≥ 21 days (if any) |

**Roll-up** (topic, module, course), importance-weighted (concept `importance`, default 1):
- *Mastery of practised material* — mean over concepts with evidence;
- *Readiness* — mean with unstarted concepts counted as 0 (the honest exam-readiness number);
- *Coverage* — share of concepts with evidence, and concepts with **no practice material** listed.

The UI always shows the components ("recall 0.82 from 14 cards · questions 60 % over 9 weighted
attempts · 2 of 5 sub-concepts never practised · confidence: medium").

## 8. Weak-area detection (Phase 9)

| Signal | Rule |
|---|---|
| Weak | m < 0.60 with confidence ≥ medium |
| Slipping | accuracy over the last 14 days ≥ 0.20 below the previous 14 days |
| Lapsing | ≥ 2 card lapses in 14 days |
| Forgotten | recall_c now < 0.70 after previously ≥ 0.85 |
| At risk (Phase 15) | a confirmed prerequisite was failed recently (FIRe-style forward penalty) |
| No material | concept has no cards/questions |

Each signal links to a one-click action: practise now, generate material (Phase 11), tutor (Phase 14).

**As built (Phase 9).** Slipping compares the mean scores of answers 0–13 and 14–27 days old and needs
at least two answers in each window. Lapsing counts standing reviews rated Again on faces that were in
review. Forgotten compares recall now with the mean retrievability, 14 days ago, of the faces reviewed
by then (from the schedule each had after its last review before that moment). FSRS-6 forgets slowly
(its curve is flatter than FSRS-4.5's), so within a fortnight only faces with a stability under about
two days can fall from 0.85 to below 0.70: Forgotten marks weakly learnt cards (B-LE-32 revisits the
rule). "Practise now" starts a
ten-minute Learn session for the concept; "no material" offers to write a question.

## 9. Priority and study planning (Phase 14)

```text
gap_c        = 1 − (m_c or 0)
stake_M,a    = weight(a) × credits(M) / Σ credits         (share of the year's mark at stake)
urgency_a    = clamp(14 / max(days_until(a), 1), 0.25, 3)
priority_c   = gap_c × stake × urgency × importance_c × (at_risk ? 1.25 : 1)
```

**Phase 9** implements priority for weak areas and Learn (`@skb/core` `learning/priority.ts`): a
concept's exposure is the most pressing (stake × urgency) of its modules' next planned, dated
assessments; a module without one counts its whole mark at urgency 0.25; modules without credits count
as the mean of the known credits; a concept in no module gets an equal share at urgency 0.25. Archived
modules are left out. *At risk* waits for Phase 15.

**Daily plan** (rolling, regenerated daily or on demand, keeps completed items):
1. Reserve time for due reviews (forecast × the user's median seconds per card).
2. Coursework blocks before coursework deadlines (user-estimated remaining hours, front-loaded).
3. Practice blocks (15–25 min) for top-priority concepts, interleaved across modules.
4. "Learn" items for lectures whose material has not been processed or studied.
5. Mock exams: one per module per week during the three weeks before its exam.
6. **Exam-day retention pass**: cards whose predicted retrievability *on the exam date* is < 0.85 are
   scheduled for review in the final week (computed from the FSRS forgetting curve).

Every plan item carries a human-readable *reason* ("Weak: Raft log matching — 0.48, exam in 9 days,
30 % of COC251"). Inputs: availability (minutes per weekday), blocked days, session length.

**Exam-aware retention** (policy over FSRS): within 14 days of a module's exam, its cards are scheduled
with desired retention 0.93. Disabled after the exam.

**As built (Phase 14, ADR-0037, `docs/guide/planning.md`).** `planStudy` in `@skb/core` is pure and
deterministic. Time per weekday and days off come from the plan settings; reviews are always planned (the
item says when they exceed the time set aside); a mock exam per exam per week for three weeks goes on the
roomiest day that fits it; the retention pass is in the exam's last week, on the day before if there is room;
coursework hours are spread over the days to the deadline with weights n…1 (most first, at most two hours
at a time); lectures with material and nothing studied become 25-minute learn items; the rest of each day is
practice blocks, one concept per block, modules in turn, a concept resting two days. The practice order is
the Phase 9 priority. Whatever does not fit is reported with a reason. Making the plan again keeps done and
skipped items and counts their minutes. Exam-aware retention is applied when a card is rated and when its
buttons are previewed (`max(setting, 0.93)` within 14 days of the module's next exam or test). The
retention pass counts card faces whose predicted recall on the exam date is under 0.85 if left as they are.

## 10. Hierarchical credit (FIRe-inspired, Phase 15)

Applies to concept mastery evidence only, along **accepted** `prerequisite_for` edges with weight
w (default 0.2, max 0.3, depth ≤ 2):
- correct answer on B ⇒ implicit evidence for prerequisite A with weight w × (B's answer weight);
- failed answer on A ⇒ dependent B flagged *at risk* (planner boost), no score change;
- if the user's recent accuracy on A is below 0.6, incoming implicit credit to A is ignored
  (explicit practice required).
Shown in mastery explanations as "implicit credit from …".

**As built (Phase 15, ADR-0038).** `propagateCredit` (`@skb/core`, `learning/credit.ts`) walks accepted `prerequisite_for`
concept edges: a correct answer (score ≥ 0.75) on B gives implicit evidence to each prerequisite A within two
steps, weighted by the product of the edges' weights (the relation's own weight, default 0.2, at most 0.3);
credit to A is dropped when A's own recency-weighted accuracy is below 0.6; a failed answer (< 0.5) on A in the
last 14 days marks each direct dependent `at risk` (priority × 1.25, a weak-area signal, no change of score).
Implicit answers join the explicit ones in the accuracy and answer weight with the same age and assistance
weights times the factor, count only for concepts with something linked, and are reported in the concept's
`credit` list and `implicitWeight`. Cross-module connections are computed from the graph payload
(`crossModuleConnections`); resurfacing looks two days ahead for lectures and a chosen number of days for exams
and deadlines.

## 11. Study sessions and progress (Phases 8–9, 14)

Sessions record kind, scope, duration and stats. Progress views: reviews per day, true retention vs
target, time studied per module, mastery trend per module, coverage, calibration (confidence vs
correctness), quiet consistency indicator (no streak pressure).
