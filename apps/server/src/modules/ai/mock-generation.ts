import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { normaliseConceptName, textSimilarity } from '@skb/core';

/**
 * The test model's structured replies (Phase 11): when asked for JSON, it reads the "Task:" line of
 * the instructions and builds a plausible, deterministic answer from the passages it was given —
 * cards from sentences, questions with valid keys, a cited note, concepts from slide titles — so
 * generation can be tested end to end offline. It is not clever, only shaped like the real thing.
 */

const PASSAGE = /<untrusted_source id="([^"]+)"[^>]*>\n([\s\S]*?)\n<\/untrusted_source>/gu;

interface Parts {
  system: string;
  user: string;
  files: Uint8Array[];
}

function parts(prompt: LanguageModelV4Prompt): Parts {
  const result: Parts = { system: '', user: '', files: [] };
  for (const message of prompt) {
    if (message.role === 'system') result.system += `${message.content}\n`;
    if (message.role !== 'user') continue;
    for (const part of message.content) {
      if (part.type === 'text') result.user += `${part.text}\n`;
      if (part.type === 'file' && part.data.type === 'data')
        result.files.push(
          typeof part.data.data === 'string'
            ? new Uint8Array(Buffer.from(part.data.data, 'base64'))
            : part.data.data,
        );
    }
  }
  return result;
}

interface Sentence {
  key: string;
  text: string;
}

function sentencesOf(user: string): { key: string; text: string; firstLine: string }[] {
  return [...user.matchAll(PASSAGE)].map(([, key = '', text = '']) => ({
    key,
    text,
    firstLine: text.split('\n')[0]?.trim() ?? '',
  }));
}

function sentences(user: string): Sentence[] {
  return sentencesOf(user).flatMap(({ key, text }) =>
    text
      .replace(/^#+\s*/gmu, '')
      .split(/(?<=[.!?])\s+|\n+/u)
      .map((sentence) => sentence.replace(/\s+/gu, ' ').trim())
      .filter((sentence) => sentence.split(' ').length >= 4 && !/^Speaker notes:$/u.test(sentence))
      .map((sentence) => ({ key, text: sentence })),
  );
}

const count = (user: string, fallback: number) =>
  Number(user.match(/Count: (\d+)/u)?.[1] ?? fallback);
const stripEnd = (text: string) => text.replace(/[.!?;:]+$/u, '');

function longestWord(text: string): string | null {
  const words = text.match(/\p{L}[\p{L}\p{N}-]{4,}/gu) ?? [];
  return words.reduce<string | null>(
    (best, word) => (!best || word.length > best.length ? word : best),
    null,
  );
}

const definition = (text: string) => text.match(/^(.{3,60}?) (is|are) (.{3,})$/u);

/** Cards from the wrapped passages in `user` (also used by the test agent). */
export function mockCards(user: string, system: string) {
  const kinds = system.match(/Card kinds allowed: ([a-z, ]+)\./u)?.[1]?.split(', ') ?? ['basic'];
  return sentences(user)
    .slice(0, count(user, 10))
    .map((sentence) => {
      const defined = definition(stripEnd(sentence.text));
      const word = longestWord(sentence.text);
      if (defined && kinds.includes('basic'))
        return {
          kind: 'basic',
          front: `What ${defined[2]} ${defined[1]}?`,
          back: `${defined[3]}.`,
          extra: '',
          source: sentence.key,
          concepts: [defined[1] ?? ''],
        };
      if (word && kinds.includes('cloze'))
        return {
          kind: 'cloze',
          front: sentence.text.replace(word, `{{c1::${word}}}`),
          back: '',
          extra: '',
          source: sentence.key,
          concepts: [],
        };
      const words = stripEnd(sentence.text).split(' ');
      return {
        kind: 'basic',
        front: `Complete: “${words.slice(0, -1).join(' ')} …”`,
        back: words.at(-1) ?? '',
        extra: '',
        source: sentence.key,
        concepts: [],
      };
    });
}

const blankQuestion = {
  options: [] as { text: string; correct: boolean; explanation: string }[],
  truth: null as boolean | null,
  value: null as number | null,
  unit: '',
  tolerance: null as number | null,
  accepted: [] as string[],
  model: '',
};

function questions(user: string, system: string) {
  const kinds = [...system.matchAll(/^- (mcq|multi|true_false|numeric|short|explain):/gmu)].map(
    (match) => match[1] ?? 'short',
  );
  const all = sentences(user);
  const pool = [...new Set(all.flatMap((sentence) => longestWord(sentence.text) ?? []))];
  return all.slice(0, count(user, 10)).map((sentence, index) => {
    const kind = kinds[index % Math.max(1, kinds.length)] ?? 'short';
    const word = longestWord(sentence.text) ?? sentence.text.split(' ')[0] ?? '';
    const gapped = sentence.text.replace(word, '_____');
    const base = {
      ...blankQuestion,
      explanation: `The material says: “${sentence.text}”`,
      difficulty: 2,
      source: sentence.key,
      concepts: [],
    };
    const distractors = pool.filter((other) => other !== word).slice(0, 3);
    if ((kind === 'mcq' || kind === 'multi') && distractors.length > 0)
      return {
        ...base,
        kind,
        stem: `Which word completes the sentence? “${gapped}”`,
        options: [word, ...distractors].map((text, position) => ({
          text,
          correct: position === 0,
          explanation:
            position === 0 ? 'This is what the material says.' : 'Not what the material says.',
        })),
      };
    if (kind === 'true_false') return { ...base, kind, stem: sentence.text, truth: true };
    const number = sentence.text.match(/\d+(?:\.\d+)?/u)?.[0];
    if (kind === 'numeric' && number)
      return {
        ...base,
        kind,
        stem: `What number completes the sentence? “${sentence.text.replace(number, '_____')}”`,
        value: Number(number),
        tolerance: 0,
      };
    if (kind === 'explain')
      return {
        ...base,
        kind,
        stem: `Explain: ${stripEnd(sentence.text).split(' ').slice(0, 8).join(' ')} …`,
        model: sentence.text,
      };
    return { ...base, kind: 'short', stem: `Complete: “${gapped}”`, accepted: [word] };
  });
}

function note(user: string) {
  const passages = sentencesOf(user);
  const lines = sentences(user)
    .slice(0, 12)
    .map((sentence) => `- ${stripEnd(sentence.text)} [${sentence.key}].`);
  const title = passages[0]?.firstLine.replace(/^#+\s*/u, '').slice(0, 60) || 'Lecture notes';
  return {
    title,
    markdown: `## Overview\n\n${lines.slice(0, 2).join('\n').replace(/^- /gmu, '')}\n\n## Key points\n\n${lines.join('\n')}\n`,
  };
}

function concepts(user: string) {
  const passages = sentencesOf(user);
  const found: {
    name: string;
    aliases: string[];
    summary: string;
    source: string;
    quote: string;
  }[] = [];
  const seen = new Set<string>();
  for (const passage of passages) {
    const title = passage.firstLine.replace(/^#+\s*/u, '');
    const sentence =
      passage.text
        .split(/(?<=[.!?])\s+|\n+/u)
        .map((line) => line.trim())
        .find((line) => line.split(' ').length >= 4) ?? passage.text.trim();
    const defined = definition(stripEnd(sentence));
    const raw =
      title && title.split(' ').length <= 6 && !/[.!?]$/u.test(title)
        ? title
        : (defined?.[1] ?? '');
    const abbreviation = raw.match(/\(([A-Z0-9]{2,8})\)/u)?.[1];
    const name = raw.replace(/\s*\([^)]*\)\s*/gu, ' ').trim();
    const key = normaliseConceptName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    found.push({
      name,
      aliases: abbreviation ? [abbreviation] : [],
      summary: sentence,
      source: passage.key,
      quote: sentence,
    });
  }
  const limited = found.slice(0, count(user, 10));
  const relations = limited.slice(1).map((concept, index) => ({
    from: limited[index]?.name ?? '',
    to: concept.name,
    relation: index === 0 ? 'prerequisite_for' : 'relates_to',
    confidence: index === 0 ? 'EXTRACTED' : 'INFERRED',
    score: index === 0 ? null : 0.75,
    source: concept.source,
    quote: concept.quote,
  }));
  return { concepts: limited, relations };
}

function grade(user: string) {
  const model = user.match(/Model answer:\n([\s\S]*?)\n\n/u)?.[1] ?? '';
  const answer = (user.match(/Student’s answer:\n([\s\S]*)$/u)?.[1] ?? '').replace(
    /<\/?student_answer>/gu,
    '',
  );
  const overlap = textSimilarity(model, answer);
  const score = overlap >= 0.5 ? 1 : overlap >= 0.2 ? 0.5 : 0;
  return {
    score,
    feedback:
      score === 1
        ? 'Your answer makes the points of the model answer.'
        : score === 0.5
          ? 'Your answer is partly right but misses points the model answer makes.'
          : 'Your answer does not make the points of the model answer.',
    misconceptions: score === 0 && answer.trim() ? ['The answer does not match the material.'] : [],
  };
}

function same(user: string) {
  const first = normaliseConceptName(user.match(/First: (.*)/u)?.[1] ?? '');
  const second = normaliseConceptName(user.match(/Second: (.*)/u)?.[1] ?? '');
  return { same: first.slice(0, 4) === second.slice(0, 4) };
}

function read(user: string, files: readonly Uint8Array[]) {
  const pages = Number(user.match(/Pages: (\d+)/u)?.[1] ?? 1);
  const decoded = files
    .map((file) => new TextDecoder('utf-8', { fatal: false }).decode(file))
    .join('\n');
  const scripted = decoded.match(/MOCK TEXT\r?\n([\s\S]*?)\r?\nEND TEXT/u)?.[1];
  const text =
    scripted ??
    `Test reading of a file of ${files.reduce((sum, file) => sum + file.length, 0)} bytes.`;
  return { pages: Array.from({ length: pages }, (_, index) => ({ page: index + 1, text })) };
}

/** The JSON the test model returns for a structured request, or null if it is not one it knows. */
export function mockStructured(prompt: LanguageModelV4Prompt): string | null {
  const { system, user, files } = parts(prompt);
  const task = system.match(/^Task: ([\w-]+)/mu)?.[1];
  switch (task) {
    case 'cards':
      return JSON.stringify({ cards: mockCards(user, system) });
    case 'questions':
      return JSON.stringify({ questions: questions(user, system) });
    case 'note':
      return JSON.stringify(note(user));
    case 'concepts':
      return JSON.stringify(concepts(user));
    case 'grade':
      return JSON.stringify(grade(user));
    case 'same-concept':
      return JSON.stringify(same(user));
    case 'read':
      return JSON.stringify(read(user, files));
    default:
      return null;
  }
}
