# User guides

Written for people using Manuscript, not for developers. Each guide is added when the
feature it describes is complete.

| Guide | Covers |
|---|---|
| [Searching and finding notes](./search.md) | The quick switcher (Ctrl+O), the command palette and full-text search (Ctrl+Shift+F): syntax, filters, ranking |
| [Lecture material: the library](./sources.md) | Importing slides, PDFs and documents, supported formats and limits, reading them, searching them down to the page or slide, organising the `Sources` folder by hand, retrying and deleting |
| [Your course](./course.md) | Courses, modules and their codes, assessments and the mark calculator, lectures and their material, topics, concepts and links to them, the Today widgets |
| [Flashcards and reviewing](./flashcards.md) | Card sets, basic, reversed and cloze cards, writing good cards, cards from notes and sources, the keyboard review session, statistics, review settings, Anki import and export |
| [AI](./ai.md) | Setting up providers and models, asking about your material with citations, semantic search and similar notes, privacy, costs and the monthly budget, test mode |
| [Practice](./practice.md) | Writing questions of each kind, the question bank, practice quizzes, mock exams, Learn sessions, grading your own answers, retakes and Markdown export |
| [How mastery is worked out](./mastery.md) | Recall and accuracy, the mastery formula with a worked example, confidence and stages, readiness and coverage, weak areas and priority, limitations |
| [The knowledge graph](./graph.md) | What the graph shows, clusters and line styles, finding and filtering, paths, relations between concepts and reviewing them, study prompts, local graphs |
| [Notes and Markdown](./markdown.md) | The Markdown dialect, links and backlinks, properties, note ids, templates, attachments, saving and conflicts, renaming and the trash, which files are indexed, differences from Obsidian, keyboard shortcuts |

## Folder names after the rename

Manuscript was first called "Study Knowledge Base". If you used it before the rename, your vault is
still in `Documents\Study Knowledge Base` and your settings in `%APPDATA%\StudyKnowledgeBase`, and the
app keeps using them as long as no `Manuscript` folders exist. To move to the new names, close the
app (and `run-web.bat`), then rename `Documents\Study Knowledge Base` to `Documents\Manuscript` and
`%APPDATA%\StudyKnowledgeBase` to `%APPDATA%\Manuscript`. Nothing inside them needs to change.
