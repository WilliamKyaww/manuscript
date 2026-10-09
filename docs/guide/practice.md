# Practice: questions, quizzes, mock exams and Learn

**Practice** (sidebar, or `/practice`) tests understanding as well as recall. Every answer you give
is evidence for the concepts the question is linked to, and moves their mastery
([how mastery is worked out](./mastery.md)).

## 1. Writing questions

**New question** (on Practice, in the **Question bank**, or on a concept page) opens the editor.
Choose the kind first:

| Kind | You give | Graded |
|---|---|---|
| **Multiple choice** | Options with exactly one ticked as right | Automatically |
| **Multi-select** | Options with every right one ticked | Automatically: credit per right choice, less one per wrong choice (never below 0), so ticking everything earns nothing |
| **True or false** | Whether the statement is true | Automatically |
| **Numeric** | The answer, its unit and a tolerance (± in the unit, or ± per cent) | Automatically |
| **Short answer** | The accepted answers, one per line | Automatically when the answer matches one (case, spacing and a final full stop do not matter); otherwise **you** compare and decide |
| **Explain** | A model answer and a rubric (the points a good answer makes) | By you, against the model answer |
| **Derivation** | A model working and a rubric | By you |
| **Code** | A model solution and its language | By you |

- The **question** is Markdown: `$maths$`, code, lists and `[[links]]` work.
- For choices, say **why** each option is right or wrong: the reasons are shown after answering.
- The **explanation** is shown after every answer; the **hint** is offered before answering, and
  using it marks the answer as *helped* (it then counts half towards mastery).
- **Module** and **lecture** file the question; **tags** (separated by spaces) let quizzes pick
  questions across modules.
- **Concepts** link the question to what it tests. A question without concepts can be quizzed, but
  it moves no mastery and Learn cannot ask it.
- **Difficulty** (1 easy – 5 hard) lets quizzes choose easier or harder questions.

The **Question bank** (`/practice/questions`) lists every question with its kind, concepts, how
often it has been answered and the last score, filtered by module, kind or text. Deleting a question
stops it being asked; its past answers stop counting towards mastery.

## 2. Practice quizzes

**New quiz** chooses questions from the bank by:

- **Module** — questions filed under the module or linked to one of its concepts;
- **Lectures** and **topics** — questions filed under those lectures, or linked to concepts in those
  topics (and their subtopics);
- **Kinds**, **tags** and how many **questions**.

Each part narrows the choice; within a part any match counts. The dialog shows how many questions
match before you start. The questions are shuffled, and the same quiz always asks the same ones, so
you can take it again later and compare.

A practice quiz asks one question at a time. **Check** (Enter, or Ctrl+Enter in a written answer)
shows straight away whether you were right, the right answer with each option's reason, the
explanation and a link to the source. Before checking you can say how sure you are — **Guessing**,
**Unsure** or **Sure**: Progress will compare your confidence with your results in a later phase. For
written answers, compare yours with the model answer and grade it: **Missed it**, **Partly** or
**Got it**. A grade is given once.

At the end you see the score (pending grades count once you give them) and every answer. **Retake**
makes a new quiz of the questions you did not get fully right. **Export** (the download button on
Practice) saves a quiz as Markdown, with the answers and explanations.

## 3. Mock exams

**New mock exam** works like a quiz but rehearses an exam:

- choose the **assessment** it rehearses, and it takes that assessment's duration (or set the
  minutes yourself);
- every question is on one page, recognition questions first, with a clock;
- nothing is marked until you **Submit** — when time runs out it is submitted as it stands;
- unanswered questions score 0; written answers are graded by you afterwards on the results page.

Your answers are saved as a draft as you go, so reloading the page loses nothing.

## 4. Learn

**Learn** is adaptive practice. Choose a module (or every module) and a time; Learn then:

1. takes the concept that most needs work — the gap in its mastery, weighted by how much of your
   year's mark rides on it and how soon it is assessed — and moves on to others as it goes, never
   asking more than two questions in a row about one concept while others wait;
2. asks at the level the concept has reached: **Recognise** (multiple choice, true or false), then
   **Recall** (short and numeric answers), then **Explain** (explanations, derivations, code); a
   right answer moves the concept up a level, a wrong one moves it down. Concepts you already know
   start higher;
3. calls a concept **secure** after two right answers at the Recall level or above (or at the
   highest level it has questions for);
4. stops when every concept is secure or time is up. **End session** stops early.

The panel on the right shows each concept, its level and whether it is secure. Concepts without
questions are listed underneath: Learn cannot practise them yet. Learn asks questions only: flashcards
keep their own schedule in **Review**.

Start Learn from Practice, from a module page (**Readiness**), or with **Practise** next to a weak
area on Today, Progress or a concept page.

## 5. Keyboard

| Key | Action |
|---|---|
| Enter | Check the answer (from an option or a field); then Next / Continue |
| Ctrl+Enter | Check a written answer |
| Tab / Shift+Tab | Move between options, confidence and buttons |
