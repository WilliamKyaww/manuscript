# Generating with AI, the Inbox, recordings and images

With a model set up (see [ai.md](ai.md)), Manuscript can turn your lecture material into
flashcards, practice questions, lecture notes and concepts — and read recordings, images and
scanned pages so they can be searched and cited. Nothing it makes enters your knowledge base until
you accept it: everything waits in the **Inbox**. Without AI, all of this is simply absent; the rest
of the app works as before.

## 1. Generating

Choose **Generate…** on:

| Where | Works from |
|---|---|
| A lecture's page | Every source attached to the lecture, and its notes |
| A source in the library | The whole source, or a range of pages or slides (e.g. slides 1–3) |
| A note (the ✨ button above the editor) | The whole note |
| Any of these with text selected | Only the selection |

Then pick what to make:

| Task | What you get | Where it waits |
|---|---|---|
| **Flashcards** | Question-and-answer and cloze cards, in a set named after the material (or a set you choose) | Inbox → Drafts |
| **Questions** | Multiple choice, multi-select, true or false, numeric, short answer and explain questions | Inbox → Drafts |
| **Lecture notes** | One note summarising the material, each claim linked to its page or slide | Inbox → Suggestions |
| **Concepts** | The concepts in the material, with summaries, and the relations between them | Inbox → Suggestions |

You can set how many (up to 50), the difficulty, the kinds of card or question and a **focus** in
your own words ("the failure cases", "definitions for the exam").

**Before anything is spent** the dialogue shows an estimate: how many passages will be sent, about
how many tokens, the approximate cost at the prices you set in Settings → AI, and the model. If
something stops it — AI is not set up, the budget is used up, the material has no text — it says so
and the Generate button stays off. Material longer than the AI may read at once (twice the context
size in Settings → AI) is cut at a passage boundary; the estimate tells you, so you can choose a
range instead.

Generation runs in the background. You can close the dialogue and keep working; a notification
says when it is done ("8 questions ready to review in the Inbox") with a link to the Inbox. A
generation that fails is not retried by itself, because each attempt costs money: start it again
when you are ready.

## 2. Quality rules

What the model returns is checked before you see it:

- **Every item names the passage it came from**, and that passage's page, slide, moment in a
  recording or line in a note becomes the item's source link. An item whose source cannot be found
  is left out.
- **Answer keys must work:** a multiple-choice question needs exactly one correct option, a
  numeric one a number, a short-answer one accepted answers, an explain one a model answer.
- **Cards follow the writing rules** of the card editor (after Wozniak's twenty rules: one fact per
  card, short answers, no lists, enough context, cloze for definitions); a card that breaks one
  shows the advice in the Inbox. A cloze card without a gap is left out.
- **Repeats are dropped** within one generation, and a draft that resembles a card or question you
  already have (80 % of the same words) is marked "Like one you have: …".
- **Notes cite only real passages:** citations the model invents are removed, the rest become links
  to the file and page (`[[Sources/CS301/L3.pdf#page=4|p. 4]]`), concepts you already have are
  linked where the note first mentions them, and the sources are listed in the note's frontmatter
  (`sources:`), with `generated_by: ai`. The note is ordinary Markdown that any editor can read.
- **Concepts are compared with yours** (adapted from Graphify's de-duplication): the same name, an
  alias or a plural is the same concept and is not proposed again; a near spelling ("Paxos protcol")
  is proposed as a **merge** (another name for the concept you have); names that may or may not be
  the same are put to the quick-tasks model when one is set up, and otherwise proposed with the
  likely match shown beside them. Numbers must agree ("Lecture 3" is never "Lecture 4") and very
  short names are only matched exactly.
- **Relations carry their confidence:** *Stated* when the passage says so, *Inferred* with a score
  from 55 % (speculative) to 95 % (near-certain), or *Unsure*; and the quote they rest on.

A reply that does not match what was asked for gets one repair attempt (the model sees what was
wrong); a second failure is reported, and both attempts are counted in your usage.

## 3. The Inbox

The **Inbox** in the sidebar shows how many items wait.

**Drafts** are generated cards and questions. Each shows its source link, the writing advice and
any similar card or question you already have. Accept, edit (the usual editor) or reject them one by
one, or select several and accept or reject them together. Accepted cards join your reviews and
accepted questions your quizzes and mastery; rejected ones are deleted. Drafts are never studied and
never count towards mastery.

**Suggestions** are proposed concepts, relations, merges, links and notes, each with the quote and
place it came from. You can:

- **accept** — a concept is created (and recorded as covered by the lecture or source it came from),
  a relation is added to the graph, a merge adds a name to the existing concept, a link is written
  into the note, a note is saved;
- **edit** a concept's name and summary, or a note's title, before accepting;
- **merge into** the existing concept a proposed one may duplicate;
- **reject** — it is kept as rejected, so the same suggestion is not made again.

Accepting a relation whose end is a proposed concept accepts that concept too; rejecting a concept
withdraws the relations that needed it. When you accept many at once, concepts are accepted first,
then merges, relations, links and notes. Accepted relations become yours (solid lines in the
graph), keeping their evidence.

### Skipping the Inbox

In **Settings → AI → Skip the Inbox** you can let a kind straight in: generated cards join your
reviews at once, concepts are created at once, and so on. All are off at first. Whatever you let in
can still be edited or deleted like anything you made yourself.

## 4. Link suggestions

On a note, the 🔗 button (**Suggest links**) looks for the names of your other notes and of your
concepts written in the note without a link, and — when semantic search is on — for notes close in
meaning that it does not link to. They arrive in the Inbox as suggestions: accepting one turns the
words into a `[[link]]`, or lists the related note under a "Related" heading at the end. Finding
unlinked names needs no model; notes close in meaning need embeddings.

## 5. Grading written answers with AI

When an explain, derivation or code answer waits for your grade, **Suggest a grade with AI**
compares it with the model answer and the rubric and suggests *Got it*, *Partly* or *Missed it*,
with two or three sentences of feedback and any misconceptions. It is only a suggestion: nothing is
recorded until you choose **Accept this grade** (the answer is then marked as graded by AI, with
the feedback kept) or grade it yourself. Your answer is sent as data: text in it asking for a good
grade is ignored. The quick-tasks model is used when one is set up.

## 6. Recordings, images and scanned pages

The library also imports:

- **Recordings** — MP3, M4A, WAV, Ogg, FLAC, AAC, and video as MP4, MOV or WebM. They are
  transcribed by the **transcription** model (Settings → AI: OpenAI's `whisper-1`, which gives exact
  timestamps, or a Whisper server that copies OpenAI's API) into sections of about a minute. The
  recording plays beside its transcript; each section's time starts it there, and search hits,
  citations and generated cards open it at that moment. Recordings over 25 MB cannot yet be
  transcribed in one piece: export the audio as a smaller file (mono MP3 at 64 kbit/s holds about 50
  minutes in 25 MB). Transcription is priced per minute of audio (set the price in the role's
  settings).
- **Images** — PNG, JPEG, GIF, WebP. The answers model reads the text in them, or describes a
  diagram or photograph, so they can be searched and cited. It must be a model that accepts images.
- **Scanned PDFs** — pages without a text layer are read by the answers model from the PDF itself
  (up to 100 pages and 30 MB at once), and the source says which pages were read that way.

What a model reads may contain mistakes: check it against the original, which is always kept
unchanged. Without AI these files are imported all the same — a recording can be played, an image
viewed — with a note saying how to read them; once AI is set up, choose **Read again** on the
source.

## 7. Privacy and costs

Generation sends the chosen material, your settings (count, focus) and instructions to the
provider of the model; transcription sends the recording. Nothing else leaves your computer. Every
request is counted in **Settings → AI → Usage this month**, and the monthly budget applies:
generation is refused once it is used up.
