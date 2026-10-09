import { describe, expect, it } from 'vitest';
import {
  cardHints,
  clozeNumbers,
  faceContent,
  faceOrdinals,
  nextClozeNumber,
  renderCloze,
} from './cards';

const text =
  'Raft elects a {{c1::leader}} per {{c2::term::a number}}; the {{c1::leader}} replicates the log.';

describe('cloze cards', () => {
  it('finds the cloze numbers and the next free one', () => {
    expect(clozeNumbers(text)).toEqual([1, 2]);
    expect(nextClozeNumber(text)).toBe(3);
    expect(nextClozeNumber('no deletions')).toBe(1);
    expect(clozeNumbers('{{c0::zero}} and {{c::broken}} and `{{c3::code}}`')).toEqual([3]);
  });

  it('hides one number at a time and shows the others', () => {
    expect(renderCloze(text, 1, 'front')).toBe(
      'Raft elects a **[…]** per term; the **[…]** replicates the log.',
    );
    expect(renderCloze(text, 2, 'front')).toBe(
      'Raft elects a leader per **[a number]**; the leader replicates the log.',
    );
    expect(renderCloze(text, 2, 'back')).toBe(
      'Raft elects a leader per ==term==; the leader replicates the log.',
    );
    expect(renderCloze('Maths: {{c1::$e^{i\\pi}$}} works', 1, 'back')).toBe(
      'Maths: ==$e^{i\\pi}$== works',
    );
  });
});

describe('faces', () => {
  it('gives each kind of card its faces', () => {
    expect(faceOrdinals('basic', 'Q')).toEqual([0]);
    expect(faceOrdinals('reversed', 'Q')).toEqual([0, 1]);
    expect(faceOrdinals('cloze', text)).toEqual([1, 2]);
    expect(faceOrdinals('cloze', 'nothing hidden')).toEqual([]);
  });

  it('shows each face the right way round, with the extra after the answer', () => {
    const card = {
      kind: 'reversed' as const,
      front: 'Paxos',
      back: 'A consensus protocol',
      extra: 'Lamport, 1998',
    };
    expect(faceContent(card, 0)).toEqual({
      front: 'Paxos',
      back: 'A consensus protocol\n\n---\n\nLamport, 1998',
    });
    expect(faceContent(card, 1).front).toBe('A consensus protocol');
    expect(
      faceContent({ kind: 'cloze', front: text, back: 'See lecture 3.', extra: '' }, 2),
    ).toEqual({
      front: 'Raft elects a leader per **[a number]**; the leader replicates the log.',
      back: 'Raft elects a leader per ==term==; the leader replicates the log.\n\nSee lecture 3.',
    });
  });
});

describe('card hints', () => {
  const basic = (front: string, back: string) =>
    cardHints({ kind: 'basic', front, back, extra: '' });

  it('passes a short, focused card', () => {
    expect(basic('Which algorithm elects a leader per term?', 'Raft')).toEqual([]);
  });

  it('flags long answers, lists, thin questions and definitions', () => {
    expect(basic('Why?', 'Because')).toContain(
      'Give the question enough context to have only one right answer.',
    );
    expect(
      basic('What does Raft do?', Array.from({ length: 30 }, () => 'word').join(' ')),
    ).toContain('Keep the answer short: one fact per card.');
    expect(
      basic('Name the CAP properties', '- Consistency\n- Availability\n- Partition tolerance'),
    ).toContain('Avoid lists and sets: split them into several cards, or use cloze deletions.');
    expect(
      basic(
        'What is a quorum?',
        'A majority of the nodes that must agree before a value is chosen in Paxos',
      ),
    ).toContain('Definitions often work better as a cloze card.');
    expect(
      cardHints({ kind: 'cloze', front: 'No deletions here', back: '', extra: '' })[0],
    ).toMatch(/c1/);
  });
});
