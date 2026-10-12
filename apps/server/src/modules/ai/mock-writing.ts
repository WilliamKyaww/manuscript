/**
 * The test model's writing help (Phase 26): a small, predictable change for each action, so that the
 * selection toolbar's AI actions can be tested end to end without a provider. Not good writing — only
 * recognisably the right kind of change.
 */

const sentencesOf = (text: string) =>
  text
    .replace(/\s+/gu, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/u)
    .filter(Boolean);

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const finish = (text: string) => (/[.!?]$/u.test(text) ? text : `${text}.`);

const TYPOS: [RegExp, string][] = [
  [/\bteh\b/giu, 'the'],
  [/\brecieve\b/giu, 'receive'],
  [/\balot\b/giu, 'a lot'],
  [/\bi\b/gu, 'I'],
  [/ {2,}/gu, ' '],
];

export function mockWriting(action: string, text: string, instruction: string): string {
  const sentences = sentencesOf(text);
  const first = sentences[0] ?? text.trim();
  switch (action) {
    case 'improve':
    case 'simplify':
      return sentences.map((sentence) => finish(capitalise(sentence))).join(' ');
    case 'proofread': {
      let fixed = text.trim();
      for (const [pattern, replacement] of TYPOS) fixed = fixed.replace(pattern, replacement);
      return finish(capitalise(fixed));
    }
    case 'shorter':
      return finish(first);
    case 'longer':
      return `${finish(text.trim())} The test model adds this sentence to make it longer.`;
    case 'summarise':
      return `In short: ${finish(first)}`;
    case 'explain':
      return `This passage says: ${finish(first)}`;
    case 'list':
      return sentences.map((sentence) => `- ${sentence.replace(/[.!?]$/u, '')}`).join('\n');
    case 'table':
      return ['| Point |', '| --- |', ...sentences.map((sentence) => `| ${sentence} |`)].join('\n');
    default:
      return `${text.trim()} (${instruction || 'edited'})`;
  }
}
