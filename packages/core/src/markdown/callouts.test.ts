import { describe, expect, it } from 'vitest';
import { CALLOUT_TYPES, calloutLabel, canonicalCallout, parseCalloutHead } from './callouts';

describe('callout types', () => {
  it('knows the thirteen built-in types and every alias of Obsidian', () => {
    expect(CALLOUT_TYPES).toHaveLength(13);
    const aliases: Record<string, string> = {
      summary: 'abstract',
      tldr: 'abstract',
      hint: 'tip',
      important: 'tip',
      check: 'success',
      done: 'success',
      help: 'question',
      faq: 'question',
      caution: 'warning',
      attention: 'warning',
      fail: 'failure',
      missing: 'failure',
      error: 'danger',
      cite: 'quote',
    };
    for (const [alias, type] of Object.entries(aliases)) expect(canonicalCallout(alias)).toBe(type);
    for (const type of CALLOUT_TYPES) expect(canonicalCallout(type)).toBe(type);
  });

  it('ignores case and draws an unknown type as a note', () => {
    expect(canonicalCallout('WARNING')).toBe('warning');
    expect(canonicalCallout('Tip')).toBe('tip');
    expect(canonicalCallout('my-own-kind')).toBe('note');
  });

  it('reads the first line: type, fold mark and title', () => {
    expect(parseCalloutHead('[!tip] Remember this')).toMatchObject({
      name: 'tip',
      type: 'tip',
      fold: null,
      title: 'Remember this',
      markerLength: 7,
    });
    expect(parseCalloutHead('[!faq]- Why?')).toMatchObject({
      type: 'question',
      fold: '-',
      title: 'Why?',
    });
    expect(parseCalloutHead('[!info]+')).toMatchObject({
      type: 'info',
      fold: '+',
      title: '',
      markerLength: 8,
    });
    expect(parseCalloutHead('[!NOTE]')).toMatchObject({ type: 'note', title: '' });
    expect(parseCalloutHead('Not a callout')).toBeNull();
    expect(parseCalloutHead('[! tip]')).toBeNull();
  });

  it('labels an untitled callout by its type', () => {
    expect(calloutLabel('tip')).toBe('Tip');
    expect(calloutLabel('CAUTION')).toBe('Caution');
  });
});
