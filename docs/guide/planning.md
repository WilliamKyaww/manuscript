# The study plan

The plan answers "what should I do today, and why?". It looks at the time you have, your deadlines and
how much each is worth, what you are weakest at, and which flashcards are due, and sets out the coming
days. Every item says why it is there. It works without AI.

Open it from **Plan** in the sidebar. **Today** shows the part for today.

## Making a plan

1. In **Settings → Study plan**, say how many minutes you have on each weekday, any days with no study at
   all (holidays, travel), and how long one sitting is. Nothing is planned beyond that time.
2. On **Plan**, choose 7, 14 or 28 days and press **Make a plan**.
3. Work through it: tick an item (**Mark done**) when you have done it, **Skip** it if you will not,
   and **Start** takes you to where the work is done.
4. When things change — a new deadline, a missed day — press **Plan again**. What you ticked off or
   skipped stays exactly as it was and counts towards that day's time; everything else is planned afresh
   from today's figures.

You can also ask the assistant ("make me a 7-day study plan"), which does the same thing; the change
can be undone from its result card.

## What goes into a day

In this order, until the day's minutes are used:

| Item | When it appears | How long |
|---|---|---|
| **Review** | Flashcards are due. Reviews are always planned, even on a day with no time set aside (the item says so). | Your own pace: the median time a review has taken you (15 s a card until there is enough history) |
| **Mock exam** | An exam is less than three weeks away: one a week, on the roomiest day that fits it | The exam's length (90 minutes if not set) |
| **Exam-day retention pass** | An exam is within a week, and some of its cards would be recalled with under 85 % chance on the day | Enough to go through those cards |
| **Coursework** | Coursework with **Hours left** set (on the assessment) and a deadline | The hours are spread over the days up to the deadline, most at the start, in sittings of up to two hours |
| **Learn** | A lecture has material attached but no cards or questions yet | 25 minutes |
| **Practise** | Time left over: a block for the concept that matters most, taking the modules in turn | One sitting (15–25 minutes) |

Each practice block names the concept and says why: for instance *"Weak: Raft log matching — 0.48,
Exam in 9 days, 30 % of CS301."* The ordering behind that is the same priority the Progress page uses
for weak areas:

```text
gap       = 1 − mastery            (a concept you have not practised counts as 0)
stake     = the assessment's weight × the module's share of the year's credits
urgency   = 14 ÷ days until the assessment, kept between 0.25 and 3
priority  = gap × stake × urgency × the concept's importance
```

A concept practised today rests for a couple of days so the plan does not repeat itself, and no
concept appears twice in a day.

## When it does not fit

If the time you have set aside cannot hold everything, the plan says what it left out and why — *"6 h
are left and no day before the deadline has time set aside"*, *"No day in days 8–14 has 90 free
minutes"* — rather than quietly dropping it. Set aside more time, or move the deadline.

## Remembering more before an exam

In the fortnight before a module's exam, that module's flashcards are scheduled for **93 % recall**
instead of your usual setting (90 % by default), so they come back a little sooner. After the exam
the usual setting applies again. A retention you chose higher than 93 % is never lowered. Switch this
off in **Settings → Study plan** (*Remember more before an exam*).

## What it knows and does not know

- It plans from what Manuscript holds: your assessments, your marks, your cards and answers. If an
  assessment has no date, or coursework has no **Hours left**, the plan cannot plan for it.
- "Hours left" is your own estimate; the plan trusts it.
- The plan is deterministic: the same figures on the same day give the same plan.
- Plans are stored in the app's database, not in your vault.
