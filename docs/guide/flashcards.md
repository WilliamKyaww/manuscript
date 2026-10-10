# Flashcards and reviewing

**Review** (sidebar, or `/review`) holds your flashcards. Each card comes back just before you would
forget it: Manuscript schedules them with **FSRS-6**, the scheduler Anki uses by default, so reviewing
a little every day keeps what you have learnt with the fewest reviews.

![A review session: a new card’s question, Show answer (Space), and Undo, Edit, Bury and Suspend with their keys](../screenshots/review-session-light.png)

## 1. Sets and cards

Cards live in **sets** — one per module, lecture or topic is a good start. **New set** asks for a
title and, optionally, the module and lecture it belongs to.

**New card** (or **Ctrl+Shift+A** from anywhere, or *New flashcard* in the command palette) opens the
editor:

| Kind | You write | You are asked |
|---|---|---|
| **Basic** | Front and back | The front; you recall the back |
| **Reversed** | Front and back | Both ways round: two cards' worth of practice from one |
| **Cloze** | A sentence with gaps: `A {{c1::quorum}} is a majority of acceptors.` | The sentence with one gap hidden (`[…]`) |

- In a cloze card, select a word and press **Cloze** (or **Ctrl+Shift+C**) to make it a gap. Each
  number is asked separately: `{{c1::…}}` and `{{c2::…}}` make two; give the same number twice to hide
  both at once. `{{c1::answer::hint}}` shows the hint instead of `[…]`.
- **Extra** is shown after the answer: context, a mnemonic, where it came from.
- Cards are Markdown: **bold**, lists, code, `$maths$`, and `[[links]]` to notes and concepts.
- **Concepts** link the card to what it tests, so later phases can measure how well you know each
  concept.
- **Keep as a draft** saves a card without reviewing it yet.

The editor shows a preview of the first question and **hints** for better cards (after Piotr
Wozniak's *twenty rules of formulating knowledge*): one fact per card, short answers, no lists (split
them, or use cloze), enough context for one right answer, cloze for definitions. They are advice: a
card saves whatever they say.

### Cards from what you are reading

- In a **note**, select text and press the **card button** (the square with a plus) in the editor's
  toolbar. The card remembers the note and line it came from.
- In a **source**, select text and press **Card from selection**. The card remembers the page, slide
  or section.

During review, **Source** (or **O**) opens that place in a new tab.

### Managing a set

A set's page lists its cards with their status and when each is next due. Click a card to edit it.
Tick cards to **activate**, **suspend** (keep, but stop reviewing), **move** to another set or
**delete** them together. **Delete set** removes it and its cards from your reviews; their review
history is kept.

## 2. Reviewing

**Review now** reviews everything due; **Review** beside a set reviews only that set.

| Key | Does |
|---|---|
| `Space` or `Enter` | Show the answer |
| `1` `2` `3` `4` | **Again** (forgotten) · **Hard** · **Good** · **Easy** |
| `Ctrl+Z` | Undo the last rating (the card comes back exactly as it was) |
| `E` | Edit the card |
| `S` | Suspend the card |
| `B` | Bury it until tomorrow |
| `O` | Open its source |
| `F` | Focus mode (a quieter page) |

Each rating button shows when the card will come back: *1 min*, *10 min*, *4 d*… Rate honestly —
**Good** when you remembered it, **Again** when you did not; the schedule depends on it.

**What comes first:** cards you are learning that are due now; then cards due today, the ones you
are most likely to have forgotten first; then new cards, taking your sets in turn, up to the day's
limit. Cards you are learning come back within the session (a card due in the next 20 minutes is
shown early when nothing else is left), so a session ends when nothing is due within 20 minutes.

The day runs from **04:00 to 04:00**, so a session after midnight still counts as the evening's.

The **summary** at the end shows the reviews, new cards, cards forgotten, *true retention* (of the
cards already in review, the share you remembered) and the concepts you practised.

## 3. Statistics

The Review page shows what is due today, how many new cards are waiting, your true retention over 30
days (against the target), the cards due on each of the next 30 days, and your reviews on each of the
last 30 (forgotten ones in red). Today shows the reviews due and roughly how long they will take.

## 4. Settings

**Settings › Review**:

| Setting | Default | Notes |
|---|---|---|
| Desired retention | 90 % | The chance of remembering a card when it comes back (80–95 %). Higher means many more reviews; above 93 % rarely pays |
| New cards a day | 20 | |
| Reviews a day | No limit | |
| Longest interval | 365 days | Hard, Good and Easy are kept at least a day apart, so the longest can pass this by two days |
| Learning steps | `1m 10m` | For new cards (`m`, `h` or `d`) |
| Relearning steps | `10m` | For forgotten cards |
| Fuzz | On | Spreads due dates a little, so cards learnt together do not stay together |

Changes apply from each card's next review.

## 5. Anki

On a set's page, **Export for Anki** downloads the set as an Anki text file (*File › Import* in Anki
imports it as *Basic*, *Basic (and reversed card)* and *Cloze* notes). **Import from Anki** reads such a
file — Anki's *Notes in Plain Text* export, or any tab- or comma-separated list of front and back —
into the set. Formatting, maths and images travel as text: Anki fields are HTML, cards here are
Markdown. Rows without a front, and cloze rows without a gap, are skipped and counted.

## 6. Your data

Cards, sets, schedules and the review history live in the app's database (`.skb/`), not in your
vault. Every rating — and every undo — is kept, never changed: that history is what a future version
can use to tune the scheduler to you. Phase 16 adds exporting everything; until then, a set's Anki
export is a copy of its cards.
