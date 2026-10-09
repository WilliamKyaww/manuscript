import { describe, expect, it } from 'vitest';
import { fromAnkiText, htmlToText, toAnkiText } from './anki';

const cards = [
  { kind: 'basic' as const, front: 'Which algorithm elects a leader per term?', back: 'Raft' },
  { kind: 'reversed' as const, front: 'Paxos', back: 'A consensus protocol\nby Lamport' },
  { kind: 'cloze' as const, front: 'A {{c1::quorum}} is a "majority"\tof nodes', back: '' },
  { kind: 'basic' as const, front: 'Escape <b>me</b> & keep $x < y$', back: 'Done' },
];

describe('Anki plain text', () => {
  it('writes headers, note types and quoted fields', () => {
    const text = toAnkiText(cards);
    const lines = text.split('\n');
    expect(lines.slice(0, 3)).toEqual(['#separator:tab', '#html:true', '#notetype column:1']);
    expect(lines[3]).toBe('Basic\tWhich algorithm elects a leader per term?\tRaft');
    expect(lines[4]).toBe('Basic (and reversed card)\tPaxos\tA consensus protocol<br>by Lamport');
    expect(lines[5]).toBe('Cloze\t"A {{c1::quorum}} is a ""majority""\tof nodes"\t');
    expect(lines[6]).toBe('Basic\tEscape &lt;b&gt;me&lt;/b&gt; &amp; keep $x &lt; y$\tDone');
  });

  it('reads back what it writes', () => {
    expect(fromAnkiText(toAnkiText(cards))).toEqual({ cards, skipped: 0 });
  });

  it('puts the extra after the answer on export', () => {
    const text = toAnkiText([{ kind: 'basic', front: 'Q', back: 'A', extra: 'From lecture 3' }]);
    expect(fromAnkiText(text).cards[0]?.back).toBe('A\n\nFrom lecture 3');
  });

  it('reads Anki exports with deck and tag columns, HTML and entities', () => {
    const exported = [
      '#separator:tab',
      '#html:true',
      '#notetype column:1',
      '#deck column:2',
      '#tags column:5',
      'Basic\tCOC251\t<div>What is <i>linearisability</i>?</div>\tEach operation appears &quot;instant&quot;&nbsp;\tds exam',
      'Cloze\tCOC251\tA {{c1::lease}} bounds clock skew<br/>effects\t\t',
      'Basic\tCOC251\t\tno front\t',
    ].join('\r\n');
    expect(fromAnkiText(exported)).toEqual({
      cards: [
        {
          kind: 'basic',
          front: 'What is linearisability?',
          back: 'Each operation appears "instant"',
        },
        { kind: 'cloze', front: 'A {{c1::lease}} bounds clock skew\neffects', back: '' },
      ],
      skipped: 1,
    });
  });

  it('reads plain comma-separated lists too', () => {
    const csv = '#separator:comma\n#html:false\nRaft,"Leader, terms, log"\n{{c1::Gossip}} spreads,';
    expect(fromAnkiText(csv).cards).toEqual([
      { kind: 'basic', front: 'Raft', back: 'Leader, terms, log' },
      { kind: 'cloze', front: '{{c1::Gossip}} spreads', back: '' },
    ]);
    expect(htmlToText('a&#39;b &#x41; &unknown;')).toBe("a'b A &unknown;");
  });
});
