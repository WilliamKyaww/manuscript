import { describe, expect, it } from 'vitest';
import { findMentions, mentionPhrases } from './mentions';

describe('mentionPhrases', () => {
  it('deduplicates case-insensitively, drops one-letter names and puts longer phrases first', () => {
    expect(mentionPhrases(['Raft', 'raft', 'Raft consensus', 'R', ' Leader  election '])).toEqual([
      'Leader election',
      'Raft consensus',
      'Raft',
    ]);
  });
});

describe('findMentions', () => {
  it('finds whole-word mentions in prose with positions and context', () => {
    const text =
      '---\ntitle: Raft\n---\nRaft is simpler than Paxos.\nAircraft and rafts are not mentions; RAFT is.';
    const matches = findMentions(text, ['Raft']);
    expect(matches.map((match) => [match.text, match.line])).toEqual([
      ['Raft', 4],
      ['RAFT', 5],
    ]);
    expect(
      text.slice(matches[0]?.offset, (matches[0]?.offset ?? 0) + (matches[0]?.length ?? 0)),
    ).toBe('Raft');
    expect(matches[1]?.context).toBe('Aircraft and rafts are not mentions; RAFT is.');
  });

  it('ignores code, maths, comments and existing links', () => {
    const text = [
      '[[Raft]] and [the Raft paper](Raft.md)',
      '`Raft` in code',
      '```',
      'Raft in a fence',
      '```',
      '%% Raft %% <!-- Raft -->',
      '$Raft$ maths',
      'Plain Raft here',
    ].join('\n');
    expect(findMentions(text, ['Raft']).map((match) => match.line)).toEqual([8]);
  });

  it('matches multi-word names across varied spacing and decomposed accents', () => {
    const text = 'The leader\n election and the Café problem.';
    expect(findMentions(text, ['Leader election', 'Café']).map((match) => match.text)).toEqual([
      'leader\n election',
      'Café',
    ]);
  });
});
