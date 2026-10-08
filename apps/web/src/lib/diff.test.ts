import { describe, expect, it } from 'vitest';
import { changedRange, diffLines } from './diff';

describe('changedRange', () => {
  it('finds the single replaced region', () => {
    expect(changedRange('hello world', 'hello brave world')).toEqual({
      from: 6,
      to: 6,
      insert: 'brave ',
    });
    expect(changedRange('abcdef', 'abXYef')).toEqual({ from: 2, to: 4, insert: 'XY' });
    expect(changedRange('---\nbody', '---\nid: x\n---\nbody')).toEqual({
      from: 4,
      to: 4,
      insert: 'id: x\n---\n',
    });
    expect(changedRange('same', 'same')).toBeNull();
    expect(changedRange('', 'new')).toEqual({ from: 0, to: 0, insert: 'new' });
    expect(changedRange('aaa', 'aa')).toEqual({ from: 2, to: 3, insert: '' });
  });
});

describe('diffLines', () => {
  const render = (before: string, after: string) =>
    diffLines(before, after).map(
      (line) => `${line.kind === 'same' ? ' ' : line.kind === 'added' ? '+' : '-'}${line.text}`,
    );

  it('marks added, removed and unchanged lines', () => {
    expect(render('a\nb\nc', 'a\nB\nc\nd')).toEqual([' a', '-b', '+B', ' c', '+d']);
  });

  it('handles empty texts and identical texts', () => {
    expect(render('', 'x')).toEqual(['+x']);
    expect(render('x', '')).toEqual(['-x']);
    expect(render('x\ny', 'x\ny')).toEqual([' x', ' y']);
  });

  it('treats CRLF and LF alike', () => {
    expect(render('a\r\nb', 'a\nb')).toEqual([' a', ' b']);
  });

  it('reconstructs both texts', () => {
    const before = 'one\ntwo\nthree\nfour\nfive';
    const after = 'zero\none\nthree\nfour and a half\nfive\nsix';
    const lines = diffLines(before, after);
    expect(
      lines
        .filter((line) => line.kind !== 'added')
        .map((line) => line.text)
        .join('\n'),
    ).toBe(before);
    expect(
      lines
        .filter((line) => line.kind !== 'removed')
        .map((line) => line.text)
        .join('\n'),
    ).toBe(after);
  });
});
