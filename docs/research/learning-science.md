# Learning science underpinning the Learning OS

> Compiled 4 October 2026 by Claude Opus 5.5. This document records *why* the learning system is
> designed the way it is. The product goal is a final-year average of 85 %+; the evidence below says
> that marks come mainly from **retrieval practice spread over time**, not from producing more
> summaries.

## 1. Which study techniques work

Dunlosky, Rawson, Marsh, Nathan & Willingham (2013), *Improving students' learning with effective
learning techniques*, Psychological Science in the Public Interest 14(1), 4–58
([doi:10.1177/1529100612453266](https://doi.org/10.1177/1529100612453266)) rated ten techniques:

| Utility | Techniques | Product consequence |
|---|---|---|
| **High** | Practice testing (retrieval practice); distributed (spaced) practice | The core loop is *test yourself, spaced over time*: flashcards, questions, mock exams scheduled by FSRS |
| Moderate | Elaborative interrogation ("why is this true?"); self-explanation; interleaved practice | "Explain" and "why" question types; tutor prompts for self-explanation; mixed-topic practice sets |
| Low | Summarisation; highlighting; keyword mnemonic; imagery for text; rereading | Summaries and highlights are offered as *inputs* to practice, never as the end of the workflow |

Supporting findings:
- **Testing effect** — Roediger & Karpicke (2006), *Test-enhanced learning*, Psychological Science
  17(3): retrieval practice beats restudying for retention after days.
- **Spacing** — Cepeda et al. (2006), Psychological Bulletin 132(3): meta-analysis showing spaced
  practice improves long-term retention; optimal gap grows with the retention interval.
- **Desirable difficulties** — Bjork & Bjork (2011): spacing, interleaving, generation and variation
  slow apparent progress but improve durable learning. Fluency is not mastery.
- **Interleaving for problem solving** — Rohrer & Taylor (2007), Instructional Science 35: mixing
  problem types improved maths test performance versus blocked practice.
- **Worked examples** — Sweller, van Merriënboer & Paas (1998), Educational Psychology Review 10:
  novices learn procedures faster from worked examples; guidance should fade as expertise grows.
- **Self-explanation** — Chi et al. (1994), Cognitive Science 18: prompting learners to explain improves
  understanding.

## 2. What this means for a CS & AI final year

Technical modules need more than term–definition cards:

| Knowledge type | Example | Practice format |
|---|---|---|
| Declarative facts | "What are the three properties in CAP?" | Basic / cloze cards |
| Conceptual understanding | "Why can't Paxos guarantee liveness under asynchrony?" | Explain questions, tutor dialogue, self-explanation |
| Procedures | Derive a gradient; trace Raft leader election | Worked example → faded example → independent problem |
| Code | Implement a vector clock merge | Code questions with tests or rubric grading (Phase 11 candidate) |
| Maths / proofs | Prove a bound; manipulate expressions | KaTeX-rendered questions, step-wise hints, rubric grading |
| Integration across topics | "How does consensus relate to replicated state machines?" | Bridge questions generated from the graph (Graphify-style) |

## 3. AI tutoring: help or crutch?

**Bastani, Bastani, Sungu, Ge, Kabakcı & Mariman (2025)**, *Generative AI without guardrails can harm
learning: Evidence from high school mathematics*, PNAS
([doi:10.1073/pnas.2422633122](https://doi.org/10.1073/pnas.2422633122);
[authors' PDF](https://hamsabastani.github.io/education_llm.pdf);
[Wharton summary](https://knowledge.wharton.upenn.edu/article/without-guardrails-generative-ai-can-harm-education/)):
field experiment with nearly 1,000 high-school maths students in Turkey.

- During practice, *GPT Base* (ChatGPT-style) improved performance by **48 %** and *GPT Tutor*
  (guardrailed: teacher-designed prompts, hints rather than answers) by **127 %** versus control.
- On a later closed-book exam **without AI**, *GPT Base* students scored **17 % lower** than students who
  never had AI. The guardrails in *GPT Tutor* largely mitigated this harm.

**Kestin, Miller, Klales, Milbourne & Ponti (2025)**, *AI tutoring outperforms in-class active
learning*, Scientific Reports 15, 17458
([ResearchGate](https://www.researchgate.net/publication/392839220_AI_tutoring_outperforms_in-class_active_learning_an_RCT_introducing_a_novel_research-based_design_in_an_authentic_educational_setting)):
crossover RCT, 194 Harvard physics students. A purpose-built tutor designed around pedagogical best
practice (structured progression, scaffolding, self-pacing, prompting active engagement) produced
**more than double** the median learning gains of an in-class active-learning lesson, in 49 rather than
60 minutes.

**Design rules derived (binding for the tutor and chat — see `docs/prd/agent-system.md`):**

1. *Tutor* mode never opens with the full answer; it asks, hints, then scaffolds. The user can always
   choose *Ask* mode for a direct, cited answer — the distinction is explicit in the UI.
2. Tutor sessions end in **retrieval**: a short check question or a card proposal, so understanding is
   tested rather than assumed.
3. Prefer *the user's sources* for grounding; label general-model knowledge clearly.
4. Track AI-assisted vs unassisted performance separately in mastery evidence (answers given after a hint
   count for less).

## 4. Spaced repetition: FSRS

**Choice:** FSRS-6 via [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs) (MIT, v5.4.2 at
time of writing; implements FSRS-6). Reasons: state of the art, open, used by Anki (25.07+) and SiYuan,
parameter optimiser available, and ~20–30 % fewer reviews than SM-2 for equal retention *(secondary)*.

**Model** ([Expertium: technical explanation](https://expertium.github.io/Algorithm.html)): three
variables per card — **R** retrievability (probability of recall now), **S** stability (days for R to
fall from 100 % to 90 %), **D** difficulty (1–10).

Forgetting curve (FSRS-6, trainable decay `w20`):

```text
DECAY  = −w20
FACTOR = 0.9^(1/DECAY) − 1
R(t,S) = (1 + FACTOR · t/S)^DECAY          → R(S, S) = 0.9 by construction
I(r,S) = (S / FACTOR) · (r^(1/DECAY) − 1)   → interval for desired retention r; I = S when r = 0.9
```

After a successful review S grows by a factor that is smaller for high D, smaller for already-high S and
larger when R was low ("review when you have nearly forgotten"); after a lapse S drops but never above its
previous value; D moves with the grade and reverts towards its default. Same-day reviews use separate
short-term parameters (`w17`–`w19`).

**Settings we adopt** (from the [Anki manual](https://docs.ankiweb.net/deck-options.html)): desired
retention **0.90** default, user-adjustable within 0.80–0.95 with a workload warning above 0.93;
learning steps under one day; fuzz on; full review logs retained for later per-user optimisation.

**Exam-aware retention (our addition, Phase 14):** before an exam date, cards in that module can be given
a temporarily higher target retention (e.g. 0.93) so the planner schedules a final consolidation pass.
This is a scheduling *policy* on top of FSRS, documented and reversible.

## 5. Hierarchical spaced repetition (FIRe)

Justin Skycak (Math Academy), *Optimized, individualized spaced repetition in hierarchical knowledge
structures* ([justinmath.com](https://www.justinmath.com/individualized-spaced-repetition-in-hierarchical-knowledge-structures/)):

- Distinguishes **prerequisites** (needed to learn B) from **encompassings** (practising B also practises
  part of A). Edges carry a weight ≈ "probability that a random problem of B exercises A".
- **Successful** work on an advanced topic flows *backwards* as fractional implicit repetition credit to
  encompassed topics; **failed** work on a simpler topic flows *forwards* as a penalty to dependent
  topics.
- **Repetition compression**: choose reviews whose implicit credit "knocks out" other due reviews.
- Safeguard: when a learner is slow on a topic, discard implicit credit and force explicit reviews.

**Our adaptation (Phase 15, conservative by design):**
- FIRe applies to **concept-level mastery evidence**, not to individual FSRS card schedules, so card
  scheduling stays standard and auditable.
- Only **user-confirmed** `prerequisite_for` / `encompasses` edges propagate; AI-proposed edges do not
  until accepted.
- Default weights are small (≤ 0.3), visible, and editable; propagation depth is limited to 2.
- Failures propagate as an "at risk" flag on dependent concepts and raise them in the planner, rather than
  silently lowering scores.

## 6. Modelling mastery honestly

Mastery is not directly measurable. Options considered:

| Model | Summary | Verdict |
|---|---|---|
| Bayesian Knowledge Tracing (Corbett & Anderson, 1994) | Hidden binary "known" state per skill; learn/slip/guess parameters | Defer — needs per-skill calibration data we do not yet have |
| Elo-style learner/item ratings (Pelánek, 2016, Computers & Education 98) | Learner skill and item difficulty updated after each attempt | Borrow idea for **question difficulty** estimation later |
| Deep knowledge tracing | Neural sequence models | Reject — opaque, data-hungry |
| **Transparent weighted heuristic** | Combine FSRS retrievability of linked cards, recency-weighted question accuracy, and coverage | **Adopt now** — explainable, works from the first review |

The adopted heuristic is specified in `docs/prd/learning-system.md` §7. Principles:

1. **Show the components**, never just a number ("recall 0.82 from 14 cards; questions 60 % over the last
   10 attempts; 2 of 5 sub-concepts never practised").
2. **Recency matters**: evidence decays (half-life ≈ 21 days, echoing Graphify's time-decayed work
   memory in `reflect.py`).
3. **Confidence bands**: few data points ⇒ "uncertain", displayed as such.
4. **Calibration check**: periodically compare predicted recall with actual review outcomes; report the
   gap (Phase 21).
5. Assisted answers (after hints/AI help) carry less weight than unassisted ones.

## 7. Metacognition and calibration

Learners overestimate learning from fluent rereading (Bjork & Bjork 2011; Kornell & Bjork 2008). The UI
therefore:
- asks for a quick confidence rating on some questions before revealing the answer, and reports
  calibration (confidence vs correctness) per module;
- avoids "progress" signals based on time spent reading;
- reports retention and mastery trends rather than streak counts as the headline metric.

## 8. Summary of binding design rules

1. Retrieval practice and spacing are the default path; summaries are a means, not an end.
2. FSRS-6 with desired retention 0.90; full logs kept.
3. Tutor mode is guardrailed (hints before answers, ends in retrieval).
4. Mastery is explainable, recency-weighted and shows uncertainty.
5. Graph-aware propagation (FIRe) is conservative and only along confirmed edges.
6. Practice formats match the knowledge type (facts, concepts, procedures, code, maths, integration).
