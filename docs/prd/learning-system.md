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

**Mark calculator** (Phase 6): module mark = Σ weightᵢ × markᵢ; for a target T the required mark on the
remaining assessments is `(T − Σ achieved weightᵢ·markᵢ) / Σ remaining weightᵢ`; the final-year average
is credit-weighted across modules. Shown on the module page and the dashboard against the 85 % goal.

## 2. Concepts as the unit of learning

Cards and questions link to one or more concepts. Mastery is computed per concept and rolled up.
A card or question with no concept still schedules and counts towards its module, but the UI nudges
linking (AI can propose links in Phase 11).

## 3. Flashcards (Phase 8)

| Aspect | Specification |
|---|---|
| Kinds | `basic` (front → back), `reversed` (generates both directions), `cloze` (`{{c1::…}}` syntax; one card per cloze index) |
| Content | Markdown with KaTeX, code and images; optional `extra` shown after reveal; source locator ("Show source") |
| Authoring | Card editor; quick-add (`Ctrl+Shift+A`); from a selection in a note or source; AI generation (Phase 11) |
| Quality rules (shown as editor hints) | One fact per card; prefer cloze for definitions; avoid sets/lists; add context; keep answers short (after Wozniak's *20 rules of formulating knowledge*) |
| Organisation | Card sets (decks) per module/lecture; tags; concepts |
| States | `draft` (generated, unreviewed) · `active` · `suspended` · `deleted` (soft) |
| Import/export | Anki-compatible TSV/CSV, JSON |

### 3.1 Scheduling — FSRS-6 via `ts-fsrs` (ADR-0011)

| Setting | Default |
|---|---|
| Desired retention | **0.90** (user range 0.80–0.95; warning above 0.93) |
| Learning steps / relearning steps | 1 min, 10 min / 10 min |
| Maximum interval | 365 days |
| Fuzz | On |
| New cards per day | 20 (per module limit optional) |
| Reviews per day | Unlimited (warning when > 200 due) |
| Parameters | FSRS-6 defaults; per-user optimisation once ≥ 1,000 reviews exist (backlog `B-LE-10`) |

All schedule changes are computed by the scheduler from review logs, which are append-only; "undo last
rating" restores the previous schedule state from the log.

### 3.2 Review session

Queue: learning/relearning cards due now → due review cards ordered by **lowest current
retrievability** first (most at risk) → new cards (interleaved, up to the daily limit). Optional
interleaving across modules. Keyboard: `Space` reveal; `1`–`4` Again/Hard/Good/Easy (buttons show the
next interval); `Ctrl+Z` undo; `E` edit; `S` suspend; `B` bury until tomorrow; `O` open source at
locator. Session summary: cards, true retention, time, concepts touched, lapses.

Distraction-free mode may collapse the page header — a deliberate, documented exception to the
sticky-header rule (`ui.md` §2).

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

## 5. Quizzes and mock exams (Phase 9)

- **Practice quiz**: scope (module, lectures, topics, concepts, tags), count, kinds mix, difficulty;
  immediate feedback with explanation and source link.
- **Mock exam**: timed, no feedback until submission, mirrors the assessment's duration and question
  style; results feed mastery with full weight.
- Retake wrong answers; export to Markdown.

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

## 9. Priority and study planning (Phase 14)

```text
gap_c        = 1 − (m_c or 0)
stake_M,a    = weight(a) × credits(M) / Σ credits         (share of the year's mark at stake)
urgency_a    = clamp(14 / max(days_until(a), 1), 0.25, 3)
priority_c   = gap_c × stake × urgency × importance_c × (at_risk ? 1.25 : 1)
```

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

## 10. Hierarchical credit (FIRe-inspired, Phase 15)

Applies to concept mastery evidence only, along **accepted** `prerequisite_for` edges with weight
w (default 0.2, max 0.3, depth ≤ 2):
- correct answer on B ⇒ implicit evidence for prerequisite A with weight w × (B's answer weight);
- failed answer on A ⇒ dependent B flagged *at risk* (planner boost), no score change;
- if the user's recent accuracy on A is below 0.6, incoming implicit credit to A is ignored
  (explicit practice required).
Shown in mastery explanations as "implicit credit from …".

## 11. Study sessions and progress (Phases 8–9, 14)

Sessions record kind, scope, duration and stats. Progress views: reviews per day, true retention vs
target, time studied per module, mastery trend per module, coverage, calibration (confidence vs
correctness), quiet consistency indicator (no streak pressure).
