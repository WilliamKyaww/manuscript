# The knowledge graph

**Graph** (sidebar, or `/graph`) draws what you know as a network: your concepts, notes, sources,
lectures and modules, and how they connect. It is built from what you have already written —
links in your notes, the course structure — plus the **relations** you add between concepts, and it
points out what to study next: gaps, bridges between topics, connections to check.

![The graph of a module: concepts coloured by cluster, notes, lectures and the module, with study prompts beside it](../screenshots/graph-dark.png)

## 1. What is in the graph

| Dot | Is |
|---|---|
| Concept | An idea you are learning ([concepts](./course.md#6-concepts)) |
| Note | A Markdown note that links to something, or that something links to |
| Source | Lecture material in your library |
| Lecture, module (and topic, on request) | Your course; drawn larger and in grey-brown |

A line between two dots means one of:

- a **relation** you (or, later, the assistant) stated between concepts: *is a prerequisite for*,
  *is part of*, *is an example of*, *contrasts with*, *relates to* (section 4);
- a **link** written in a note: a note linking another note or a source, a note mentioning a
  concept (`[[Paxos]]`), a concept's backing note;
- **course structure**: a lecture in its module, a note filed under a lecture or module (its
  `module` and `lecture` properties), a source attached to a lecture, a concept in its module or
  topic.

Nothing is copied to make the graph: change a link in a note, and the graph follows.

**Line styles** show how sure a connection is, so colour is never the only signal:

| Line | Means |
|---|---|
| Solid | Stated by you, or written in your files |
| Dashed | Inferred — reasoned, not stated in your material |
| Dotted | Ambiguous — needs checking |

## 2. Clusters

Dots are coloured by **cluster**: groups of concepts and notes that are more connected to each other
than to the rest (found with the Louvain method, as in Graphify). A cluster is named after its
best-connected concept. Clusters keep their colours from one visit to the next.

The key above the graph lists the clusters with their sizes: click one to hide it, again to show
it. **Colour by type** in the filters colours dots by what they are instead.

## 3. Finding your way

- **Find in graph** (top right): type a name and press Enter; the graph centres on it and the panel
  shows it.
- **Click** a dot to select it: it and its neighbours come forward. Click empty space to let go.
  Scroll to zoom, drag to move.
- The **panel** beside the graph shows the selected item: what it is, its connections grouped by
  how they relate (each one selectable), **Open** to go to its page, and **How does it relate
  to…** — type another name to see the shortest chain of connections between them. The chain never
  goes through a module, lecture or topic ("both are in COC251" is not an answer).
- **Filters**: which kinds of item to show, one module only, **proposed relations** (suggestions
  you have not accepted), and **unlinked notes and sources** (left out by default, as they would
  only add dots with no lines).

Very large graphs show at most 5,000 items: concepts and the course first, then the best-connected
notes and sources. The count above the graph says when that happens.

If the browser cannot draw the graph (WebGL switched off), the page says so; the panel, the
concept pages and the lists below every local graph still show the same connections.

## 4. Relations between concepts

On a concept's page, **Relations** lists how it relates to other concepts, each way round:
*Paxos is a prerequisite for Raft* appears on Raft's page as *depends on Paxos*.

To add one, choose the relation (both directions are offered: *is a prerequisite for* / *depends
on*), type the other concept's name and, if you like, a sentence of **evidence** — from the slides,
say. A relation and its reverse cannot both hold, and the same pair is related once per kind.

Relations that are **proposed**, **inferred** or **ambiguous** have **Accept** (✓) and **Reject** (✕).
Accepting makes the relation yours (solid). Rejecting keeps it out of the graph, and keeps it on
record so it is not suggested again. Accepted relations of your own can be removed (bin).

The assistant does not propose relations yet (Phase 11); until then everything in the graph is
either written by you or read from your files.

## 5. Study prompts

With nothing selected, the panel shows what the graph suggests:

| Prompt | What it found | What to do |
|---|---|---|
| **Check** | An inferred or ambiguous relation | Review it on the concept page: accept, change or reject |
| **Gap** | A concept with no or one connection | Write about it, link to it from your notes, or relate it to what you know |
| **Bridge** | A concept or note on many paths between clusters | A good integrative or essay question: explain how it ties them together |
| **Connection** | A link across modules or clusters you might not have noticed | Look at both ends |
| **Cluster** | A large group whose members are loosely connected | Relate them to each other, or check they belong together |

Each prompt has buttons that take you there (the concept's page, its relations, or its place in the
graph). Below the prompts are the **core concepts** (the best connected: know these first) and the
**gaps**. With a module chosen in the filters, all of these are about that module.

### Colouring by mastery

Choose **Colour by mastery** and concepts take the colour of their stage — new, learning, practised,
confident, mastered — with a shape that fills as you learn (○ ◔ ◑ ◕ ●), so the stage is readable
without telling the colours apart. Concepts worth studying now (weak, slipping, lapsing, forgotten or at
risk) are larger and marked ⚠. Notes, sources and the rest are left grey. The key above the graph
repeats this.

### Between modules

With nothing selected, the side panel has **Insights** and **Between modules**. The second lists the
concepts that belong to more than one module and the stated relations that join concepts of different
modules ("Consensus (CS301) is a prerequisite for Transactions (CS402)"), strongest first.

## 6. Local graphs

Every concept page has **Connections**: its neighbourhood one or two steps out (**1 step** /
**2 steps**), with the direct connections listed below it — click one to open it. In the Notes
section, the **Graph** tab beside Backlinks shows the same for the open note. **Open in graph**
shows the item in the full graph.

Two steps out never spreads through a module, lecture or topic, so a concept's neighbourhood does
not become its whole module.

## 7. Speed

The graph is worked out on your computer from your files and the app's database, and kept until
something it depends on changes. With 10,000 notes it takes about two seconds the first time and
well under a second after you edit a note's text.
