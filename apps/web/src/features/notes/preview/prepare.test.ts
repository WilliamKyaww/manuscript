import { describe, expect, it } from 'vitest';
import { escapeStrayDollars, prepareMarkdown, removeComments } from './prepare';

describe('removeComments', () => {
  it('removes inline and multi-paragraph comments but not code', () => {
    expect(removeComments('a %%hidden%% b')).toBe('a  b');
    expect(removeComments('before\n%%\nsecret\n\nstill secret\n%%\nafter')).toBe('before\n\nafter');
    expect(removeComments('`%%code%%` and\n```\n%%fenced%%\n```')).toBe(
      '`%%code%%` and\n```\n%%fenced%%\n```',
    );
  });
});

describe('escapeStrayDollars', () => {
  it('keeps real maths and escapes currency', () => {
    expect(escapeStrayDollars('It costs $5 and $6.')).toBe('It costs \\$5 and \\$6.');
    expect(escapeStrayDollars('Area $\\pi r^2$ here')).toBe('Area $\\pi r^2$ here');
    expect(escapeStrayDollars('$$\nx = 1\n$$')).toBe('$$\nx = 1\n$$');
    expect(escapeStrayDollars('Inline $$a+b$$ display')).toBe('Inline $$a+b$$ display');
    expect(escapeStrayDollars('a $ b')).toBe('a \\$ b');
    expect(escapeStrayDollars('already \\$5')).toBe('already \\$5');
  });

  it('leaves code alone', () => {
    expect(escapeStrayDollars('`echo $HOME` costs $5')).toBe('`echo $HOME` costs \\$5');
    expect(escapeStrayDollars('```sh\nexport A=$B\n```')).toBe('```sh\nexport A=$B\n```');
  });
});

describe('prepareMarkdown', () => {
  it('applies both steps', () => {
    expect(prepareMarkdown('%% $5 %% $x$ and $3')).toBe(' $x$ and \\$3');
  });
});
