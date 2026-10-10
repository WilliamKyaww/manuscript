import type { LanguageModelV4CallOptions, LanguageModelV4Prompt } from '@ai-sdk/provider';
import { mockCards } from './mock-generation';

/**
 * The test model as an agent (`SKB_AI_PROVIDER=mock`, agent-system.md §14): given a conversation
 * with tools, it decides the next step the way a careful assistant would for a few requests the
 * product is built around — flashcards from lectures, a summary note from lectures and notes,
 * deleting a note — by reading what the tools have already returned in this turn. Anything else gets
 * a plain search and an answer. It is deterministic and shaped like the real thing (parallel calls,
 * results read back), so chat, approvals and result cards can be tested end to end offline.
 */

export type AgentTurn = { calls: { name: string; input: unknown }[] } | { text: string };

interface Call {
  name: string;
  input: Record<string, unknown>;
  /** What the tool returned (`result` of its reply), or undefined if it did not run. */
  result: Record<string, unknown> | undefined;
  /** The tool ran and said it worked. */
  ok: boolean;
}

const asText = (content: unknown): string =>
  Array.isArray(content)
    ? content
        .map((part) =>
          part && typeof part === 'object' && 'text' in part ? String(part.text) : '',
        )
        .join('\n')
    : '';

/** The person's latest message, and the tool calls made since it. */
function turnOf(prompt: LanguageModelV4Prompt): {
  request: string;
  calls: Call[];
  passages: boolean;
} {
  let last = -1;
  prompt.forEach((message, index) => {
    if (message.role === 'user') last = index;
  });
  const message = prompt[last];
  const raw = message?.role === 'user' ? asText(message.content) : '';
  const request = (raw.match(/Question: ([\s\S]*)$/u)?.[1] ?? raw).trim();
  const results = new Map<string, { value: unknown; ran: boolean }>();
  for (const later of prompt.slice(last + 1)) {
    if (later.role !== 'tool') continue;
    for (const part of later.content) {
      if (part.type !== 'tool-result') continue;
      results.set(part.toolCallId, {
        value: part.output.type === 'json' ? part.output.value : undefined,
        ran: part.output.type === 'json',
      });
    }
  }
  const calls: Call[] = [];
  for (const later of prompt.slice(last + 1)) {
    if (later.role !== 'assistant') continue;
    for (const part of later.content) {
      if (part.type !== 'tool-call') continue;
      const reply = results.get(part.toolCallId);
      const value = reply?.value as { ok?: boolean; result?: Record<string, unknown> } | undefined;
      calls.push({
        name: part.toolName,
        input: (typeof part.input === 'object' && part.input ? part.input : {}) as Record<
          string,
          unknown
        >,
        result: value?.ok ? value.result : undefined,
        ok: value?.ok === true,
      });
    }
  }
  return { request, calls, passages: /<untrusted_source id="S\d+"/u.test(raw) };
}

const INNER =
  /<untrusted_source id="([^"]*)" title="[^"]*" location="([^"]*)">\n([\s\S]*?)\n<\/untrusted_source>/gu;

/** The wrapped passages in a tool result, as plain pieces. */
function unwrap(text: string): { key: string; location: string; text: string }[] {
  return [...text.matchAll(INNER)].map(([, key = '', location = '', body = '']) => ({
    key,
    location,
    text: body,
  }));
}

const sentences = (text: string) =>
  text
    .replace(/^#+\s*/gmu, '')
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((sentence) => sentence.replace(/\s+/gu, ' ').trim())
    .filter((sentence) => sentence.split(' ').length >= 4);

const range = (text: string): [number, number] | null => {
  const match = text.match(/lectures?\s*(\d+)(?:\s*(?:-|–|—|to|and)\s*(\d+))?/iu);
  return match ? [Number(match[1]), Number(match[2] ?? match[1])] : null;
};

const asList = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? (value as Record<string, unknown>[]) : [];

const call = (name: string, input: unknown): AgentTurn => ({ calls: [{ name, input }] });
const calls = (list: { name: string; input: unknown }[]): AgentTurn => ({ calls: list });

/** The locator a passage label points to ("Slide 2", "p. 3"), for cards made from it. */
function locatorOf(key: string, location: string): Record<string, unknown> | undefined {
  const sourceId = key.split(':')[0] ?? '';
  const slide = location.match(/^Slide (\d+)/u)?.[1];
  if (slide) return { kind: 'slides', sourceId, slide: Number(slide), part: 'body' };
  const page = location.match(/^p\. (\d+)/u)?.[1];
  if (page) return { kind: 'pdf', sourceId, page: Number(page) };
  return undefined;
}

function flashcards(request: string, taken: Call[]): AgentTurn {
  const lectures = range(request) as [number, number];
  const [from, to] = lectures;
  const done = (name: string) => taken.filter((entry) => entry.name === name);
  if (done('list_modules').length === 0) return call('list_modules', {});
  const modules = asList(done('list_modules')[0]?.result?.modules);
  const module = modules[0];
  if (!module)
    return { text: 'You have no modules yet, so there are no lectures to make cards from.' };
  if (done('get_module').length === 0) return call('get_module', { id: module.id });
  const detail = done('get_module')[0]?.result ?? {};
  const wanted = asList(detail.lectures).filter((lecture) => {
    const number = Number(String(lecture.key ?? '').match(/\d+/u)?.[0]);
    return number >= from && number <= to;
  });
  if (wanted.length === 0)
    return {
      text: `I could not find lectures ${from}–${to} in ${String(detail.code ?? 'your module')}.`,
    };
  if (done('get_lecture').length === 0)
    return calls(wanted.map((lecture) => ({ name: 'get_lecture', input: { id: lecture.id } })));
  const sourceIds = [
    ...new Set(
      done('get_lecture').flatMap((entry) =>
        asList(entry.result?.sources).map((source) => String(source.id)),
      ),
    ),
  ];
  if (sourceIds.length === 0)
    return {
      text: `Lectures ${from}–${to} have no sources attached, so I have nothing to make cards from.`,
    };
  if (done('read_source').length === 0)
    return calls(sourceIds.map((id) => ({ name: 'read_source', input: { id } })));
  if (done('create_flashcards').length === 0) {
    const text = done('read_source')
      .flatMap((entry) =>
        asList(entry.result?.passages).map((passage) => String(passage.text ?? '')),
      )
      .join('\n');
    const locations = new Map(unwrap(text).map((piece) => [piece.key, piece.location]));
    const made = mockCards(`${text}\nCount: 8`, 'Card kinds allowed: basic, cloze.');
    if (made.length === 0)
      return { text: 'There was no text in those lectures to make cards from.' };
    const title = `${String(detail.code ?? 'Module')} · L${from}${to === from ? '' : `–L${to}`}`;
    return call('create_flashcards', {
      setTitle: title,
      moduleId: module.id,
      cards: made.map((card) => {
        const locator = locatorOf(card.source, locations.get(card.source) ?? '');
        return {
          kind: card.kind,
          front: card.front,
          back: card.back,
          ...(locator ? { locator } : {}),
        };
      }),
    });
  }
  const created = done('create_flashcards')[0];
  if (!created?.ok) return { text: 'I could not create the flashcards.' };
  const count =
    asList(created.result?.cardIds).length ||
    (created.result?.cardIds as unknown[] | undefined)?.length ||
    0;
  return {
    text: `I created ${count} flashcards from lectures ${from}–${to} (${String(created.input.setTitle)}). They are drafts: accept them in the Inbox to start studying them, or undo this below.`,
  };
}

function summary(request: string, taken: Call[]): AgentTurn {
  const done = (name: string) => taken.filter((entry) => entry.name === name);
  const topic =
    request
      .match(
        /(?:summary|summarise|summarize)\s+of\s+([\p{L}\p{N}][\p{L}\p{N} -]*?)(?:\s+(?:from|using|expanded|with)\b|[.,]|$)/iu,
      )?.[1]
      ?.trim() ?? 'the lectures';
  const word = topic.split(' ')[0] ?? topic;
  if (done('search_knowledge').length === 0)
    return call('search_knowledge', { query: word, limit: 8 });
  const found = asList(done('search_knowledge')[0]?.result?.results);
  const sources = [
    ...new Set(found.filter((hit) => hit.kind === 'source').map((hit) => String(hit.id))),
  ].slice(0, 3);
  const notes = found.filter((hit) => hit.kind === 'note').slice(0, 3);
  if (sources.length + notes.length === 0)
    return { text: `I found nothing about ${topic} in your material.` };
  if (done('read_source').length + done('get_note').length === 0)
    return calls([
      ...sources.map((id) => ({ name: 'read_source', input: { id } })),
      ...notes.map((note) => ({ name: 'get_note', input: { id: note.id } })),
    ]);
  if (done('create_note').length === 0) {
    const lines = (entries: Call[], field: 'passages' | 'content') =>
      entries
        .flatMap((entry) =>
          field === 'passages'
            ? asList(entry.result?.passages).map((passage) => String(passage.text ?? ''))
            : [String(entry.result?.content ?? '')],
        )
        .flatMap((text) => unwrap(text).flatMap((piece) => sentences(piece.text)))
        .slice(0, 8)
        .map((sentence) => `- ${sentence}`);
    const fromSources = lines(done('read_source'), 'passages');
    const fromNotes = lines(done('get_note'), 'content');
    const title = `Summary of ${topic}`;
    const content = [
      `# ${title}`,
      '',
      '## From the lectures',
      '',
      ...(fromSources.length ? fromSources : ['- Nothing in the lecture sources.']),
      '',
      '## From my notes',
      '',
      ...(fromNotes.length ? fromNotes : ['- No notes on this yet.']),
      '',
    ].join('\n');
    return call('create_note', { title, content });
  }
  const created = done('create_note')[0];
  if (!created?.ok) return { text: 'I could not create the note.' };
  const noteId = String(created.result?.id ?? '');
  if (done('link_notes').length === 0 && notes.length > 0)
    return calls(
      notes.map((note) => ({ name: 'link_notes', input: { fromId: noteId, toId: note.id } })),
    );
  return {
    text: `I wrote “${String(created.result?.title)}” from ${sources.length} source${sources.length === 1 ? '' : 's'} and ${notes.length} of your notes, and linked it to those notes. You can undo this below.`,
  };
}

function deleteNote(request: string, taken: Call[]): AgentTurn {
  const done = (name: string) => taken.filter((entry) => entry.name === name);
  const name = request.match(/note\s+["“']?(.+?)["”']?\s*\.?$/iu)?.[1]?.trim() ?? '';
  if (done('list_notes').length === 0) return call('list_notes', { titleContains: name, limit: 5 });
  const notes = asList(done('list_notes')[0]?.result?.notes);
  const note =
    notes.find((entry) => String(entry.title).toLowerCase() === name.toLowerCase()) ?? notes[0];
  if (!note) return { text: `I could not find a note called “${name}”.` };
  if (done('delete_note').length === 0) return call('delete_note', { id: note.id });
  return done('delete_note')[0]?.ok
    ? { text: `I moved “${String(note.title)}” to the trash. You can undo that below.` }
    : { text: `Understood, I left “${String(note.title)}” alone.` };
}

/** What the test model does next in an agent conversation, or null if it is not one. */
export function mockAgentTurn(options: LanguageModelV4CallOptions): AgentTurn | null {
  if (!options.tools?.length) return null;
  const { request, calls: taken, passages } = turnOf(options.prompt);
  if (!request) return null;
  if (/flash\s?cards?/iu.test(request) && range(request)) return flashcards(request, taken);
  if (/\b(summary|summarise|summarize)\b/iu.test(request)) return summary(request, taken);
  if (/\bdelete\b.*\bnote\b/iu.test(request)) return deleteNote(request, taken);
  // Passages from retrieval are in the message: answer from them, as the Ask panel's model does.
  if (passages) return null;
  if (taken.length === 0 && options.tools.some((tool) => tool.name === 'search_knowledge'))
    return call('search_knowledge', { query: request.slice(0, 120), limit: 5 });
  const found = asList(taken[0]?.result?.results);
  return {
    text: found.length
      ? `I found ${found.length} match${found.length === 1 ? '' : 'es'}: ${found
          .slice(0, 3)
          .map((hit) => String(hit.title))
          .join('; ')}.`
      : 'I could not find that in your material.',
  };
}
