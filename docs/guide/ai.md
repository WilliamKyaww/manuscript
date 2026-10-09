# AI: setting it up, asking questions, privacy and costs

Manuscript works fully without AI. Everything in this guide is optional: notes, the library,
search, the course, the graph, flashcards, quizzes and mastery never need a model. AI adds
answers about your own material, with citations you can check, and (in later versions) generated
cards, questions and a tutor.

## 1. Setting up a provider

Open **Settings → AI**.

1. **Add a provider.** Choose the kind:
   - **Anthropic** or **OpenAI** — paste an API key from their website (you pay them per use);
   - **OpenAI-compatible** — Ollama or LM Studio running on this computer (free, private, slower on
     a laptop), or a hosted service such as OpenRouter or DeepSeek. Give the server address ending
     in `/v1`, e.g. `http://localhost:11434/v1` for Ollama. Local servers usually need no key.
2. **Choose a model for each role:**

   | Role | Used for | A sensible choice |
   |---|---|---|
   | **Answers** | Questions about your material (and later the tutor and chat) | A strong model, such as Claude Sonnet |
   | **Quick tasks** | Short jobs: titles, classification, grading (later phases) | A small, cheap model, such as Claude Haiku |
   | **Semantic search** | Finding passages by meaning, not only by words | An embedding model, such as OpenAI `text-embedding-3-small` or Ollama `nomic-embed-text`; leave **Off** if you prefer |

   The model field suggests a few ids; any id your provider offers works. Providers rename models
   often, so check their list.
3. **Test** each role. A test sends one tiny request ("Reply with OK.", or one embedding) and says
   whether it worked and, if not, why (a refused key, an unknown model, a server that cannot be
   reached).

## 2. Asking about your material

Press **Ctrl+J** (or **Ask…** in the sidebar, or *Ask about your material* in the command palette)
and type a question. Choose where the answer may come from:

| Answer from | What happens |
|---|---|
| **My sources** | Only your lecture material. If the answer is not there, Manuscript says so and asks no model at all. |
| **Sources and notes** | Your lecture material and your own notes. Still no general knowledge. |
| **General knowledge too** | The model may add what it knows. Those sentences carry no citation, and the answer is labelled accordingly. |

On a source's page (or a module, lecture or concept page) the question is about **only this**
source, module, lecture or concept unless you untick the box.

Each claim from your material ends with a citation such as **[S2]**. Click it to open the passage
where it is — the PDF page, the slide, or the line in your note. **Passages used** lists everything
the model was given. The label above the answer says how grounded it is:

- **From your sources** — every claim is cited;
- **Partly general knowledge** — some sentences have no citation;
- **General knowledge** — none do;
- **Not in your sources** — nothing relevant was found.

Citations to passages the model was not given are removed (and listed), so a citation always
points at real text. The last answer stays in the panel until you ask again.

### How passages are chosen

Your question's significant words are searched in your sources (and notes); the concepts it names,
and concepts one or two relations away in the graph, bring in passages about them too; with
semantic search on, passages similar in meaning are added. The three rankings are combined and the
best passages are sent, up to **Context per question** (12,000 tokens by default).

## 3. Semantic search

With a model chosen for **Semantic search**, Manuscript embeds every passage of your sources and
every note in the background (Settings shows the progress), and again whenever something is
imported or edited. Asking then also finds passages that say the same thing in other words, and a
note's **Backlinks** tab lists **Similar notes**. **Embed everything again** starts over (after
changing model, for instance). Embedding costs a little once per passage; questions then add one
small embedding each.

## 4. Privacy

- Your **API keys** are stored on this computer in your settings folder
  (`%APPDATA%\Manuscript\secrets.json`), outside your vault, readable by your user only. They are sent only to the provider
  they belong to and never shown again, in the app or anywhere else.
- **What is sent**: your question and the passages chosen for it — nothing else from your vault. A
  local provider (Ollama, LM Studio) sends nothing off this computer.
- Passages are marked as material, not instructions, and anything in them that looks like a chat
  instruction is defused, so a document cannot take over the model.

## 5. Costs and limits

Set each role's **prices** (dollars per million tokens, from the provider's price list) to see what
you spend. **Monthly budget** (default $10) stops AI requests once the month's estimated spend
reaches it — with a warning from 80 % — and starts again next month or when you raise it.
**Usage** shows this month's requests, tokens and estimated cost by model, and the latest
requests. Estimates are only as accurate as the prices you enter; your provider's bill is the real
figure.

## 6. Test mode

Starting the app with `SKB_AI_PROVIDER=mock` replaces every model with a built-in test model that
answers from the passages it is given, offline. It exists for automated tests and demonstrations;
Settings says when it is on.
