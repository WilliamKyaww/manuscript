# Research questions

Open questions that change design choices. **For the user** = only you can answer;
**Research** = to be investigated in the named phase.

| ID | Question | For | Affects | Needed by |
|---|---|---|---|---|
| RQ-01 | Is the assumed weekly workflow in `docs/prd/product.md` §4 right? What is missing? | User | Priorities of Phases 5–15 | Phase 5 |
| RQ-02 | Which modules are you taking this year (codes, credits, semesters), with assessment weights and dates? | User | Phase 6 data entry; planner | Phase 6 |
| RQ-03 | What can be downloaded from the VLE (Moodle-based "Learn"): PDF or PPTX slides? Are lecture recordings or transcripts available (e.g. via the lecture-capture system)? | User + research | Parsers (Phase 5), transcription (Phase 11), B-PL-03 | Phase 5 |
| RQ-04 | Preferred AI providers and monthly budget? Any GPU for local models (Ollama)? | User | Phase 10 defaults | Phase 10 |
| RQ-05 | Do you have existing notes to bring in (Obsidian vault, OneNote, Notion, Anki decks)? | User | Phase 16 import priorities; vault location | Phase 3 |
| RQ-06 | Will the vault folder be synced (OneDrive, Git)? | User | File-watching and conflict handling | Phase 3 |
| RQ-07 | Can you provide a few real lecture PDFs/PPTX files for the parser spike (kept out of the repository)? | User | Phase 5 spike quality | Phase 5 |
| RQ-08 | What exam formats do your modules use (MCQ, written, coding, proofs)? | User | Question kinds priority (Phase 9) | Phase 9 |
| RQ-09 | How much daily study time can reviews take, and what desired retention do you want (default 0.90)? | User | FSRS and planner defaults | Phase 8 |
| RQ-10 | Embeddings: API (cost) or local (installer size, speed)? | Research | Phase 10 | Phase 10 |
| ~~RQ-11~~ | ~~Product name: keep "Study Knowledge Base" or choose another?~~ **Answered 8 October 2026: "Manuscript"** (ADR-0027) | User | Display strings, installer | Phase 19 |
| RQ-12 | Is pdf.js text extraction reliable on your lecture PDFs (ligatures, maths, columns)? | Research | Parser choice (ADR-0019) | Phase 5 |
