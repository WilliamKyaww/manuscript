/**
 * Flashcard content (learning-system.md §3): the faces a card is reviewed by, how each face reads,
 * and hints for writing good cards. A card is what the student writes; a face is what is reviewed:
 * one for a basic card, two for a reversed one (front → back and back → front), and one for each
 * cloze number of a cloze card (`{{c1::answer}}` or `{{c1::answer::hint}}`).
 */

export const CARD_KINDS = ['basic', 'reversed', 'cloze'] as const;
export type CardKind = (typeof CARD_KINDS)[number];

/**
 * `{{c1::answer}}` or `{{c1::answer::hint}}`. An answer holds no `::` (that starts the hint), and
 * neither holds `}}` or `{{` (deletions do not nest) — which is also what keeps this linear: before,
 * "any text until `}}`" for both parts tried every split of an unclosed text, and 6,000 characters of
 * `{{c1::` took ten seconds (Phase 21 fuzzing).
 */
const CLOZE = /\{\{c(\d{1,3})::((?:(?!\}\}|::|\{\{)[\s\S])*)(?:::((?:(?!\}\}|\{\{)[\s\S])*))?\}\}/g;

/** The cloze numbers used in a text, in order. */
export function clozeNumbers(text: string): number[] {
  const numbers = new Set<number>();
  for (const match of text.matchAll(CLOZE)) {
    const number = Number(match[1]);
    if (number > 0) numbers.add(number);
  }
  return [...numbers].sort((a, b) => a - b);
}

/** The number for a new cloze: one more than the highest used. */
export const nextClozeNumber = (text: string) => Math.max(0, ...clozeNumbers(text)) + 1;

/** The faces a card is reviewed by. */
export function faceOrdinals(kind: CardKind, front: string): number[] {
  if (kind === 'basic') return [0];
  if (kind === 'reversed') return [0, 1];
  return clozeNumbers(front);
}

/**
 * A cloze text for one face: the face's own deletions hidden on the front (`[…]`, or the hint) and
 * highlighted on the back; the other deletions shown as plain text.
 */
export function renderCloze(text: string, number: number, side: 'front' | 'back'): string {
  return text.replace(CLOZE, (_match, digits: string, answer: string, hint?: string) => {
    if (Number(digits) !== number) return answer;
    if (side === 'back') return `==${answer}==`;
    return `**[${hint?.trim() ? hint.trim() : '…'}]**`;
  });
}

/** A cloze text read whole, as in the Inbox: every deletion shown and highlighted, no syntax. */
export function revealCloze(text: string): string {
  return text.replace(CLOZE, (_match, _digits: string, answer: string) => `==${answer}==`);
}

export interface CardContent {
  kind: CardKind;
  front: string;
  back: string;
  extra: string;
}

/** What one face shows before and after the answer is revealed (Markdown). */
export function faceContent(card: CardContent, ordinal: number): { front: string; back: string } {
  const withExtra = (text: string) =>
    card.extra.trim() ? `${text}\n\n---\n\n${card.extra}` : text;
  if (card.kind === 'cloze') {
    const back = renderCloze(card.front, ordinal, 'back');
    return {
      front: renderCloze(card.front, ordinal, 'front'),
      back: withExtra(card.back.trim() ? `${back}\n\n${card.back}` : back),
    };
  }
  if (card.kind === 'reversed' && ordinal === 1)
    return { front: card.back, back: withExtra(card.front) };
  return { front: card.front, back: withExtra(card.back) };
}

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

/**
 * Hints shown in the editor, after Wozniak's "twenty rules of formulating knowledge": one fact per
 * card, short answers, no lists, enough context, cloze for definitions. Advice, not rules: a card
 * can be saved whatever they say.
 */
export function cardHints(card: CardContent): string[] {
  const hints: string[] = [];
  const front = card.front.trim();
  const back = card.back.trim();
  if (card.kind === 'cloze') {
    const numbers = clozeNumbers(front);
    if (numbers.length === 0)
      hints.push('Mark what to recall with {{c1::…}} (select it and press “Cloze”).');
    if (numbers.length > 5)
      hints.push('Many deletions in one card: consider splitting it into smaller ones.');
    return hints;
  }
  if (front.length > 0 && front.length < 8)
    hints.push('Give the question enough context to have only one right answer.');
  if (words(back) > 25) hints.push('Keep the answer short: one fact per card.');
  const listLines = back.split('\n').filter((line) => /^\s*([-*+]|\d+[.)])\s/.test(line)).length;
  if (listLines >= 3 || (back.match(/,/g) ?? []).length >= 3)
    hints.push('Avoid lists and sets: split them into several cards, or use cloze deletions.');
  if (/^(what is|what are|define|definition of)\b/i.test(front) && words(back) > 12)
    hints.push('Definitions often work better as a cloze card.');
  if (front !== '' && front.toLowerCase() === back.toLowerCase())
    hints.push('The question and the answer are the same.');
  return hints;
}
