import { describe, expect, it } from 'vitest';
import { parseSearchQuery, withFilter, withoutFilter } from './query';

describe('parseSearchQuery', () => {
  it('turns words into prefix terms and quotes into phrases', () => {
    const parsed = parseSearchQuery('leader "log replication" raft');
    expect(parsed.match).toBe('"leader"* AND "log replication" AND "raft"*');
    expect(parsed.highlights).toEqual(['leader', 'log replication', 'raft']);
    expect(parsed.empty).toBe(false);
  });

  it('supports OR between terms and exclusions', () => {
    const parsed = parseSearchQuery('paxos OR raft safety -byzantine -"view change"');
    expect(parsed.match).toBe('("paxos"* OR "raft"*) AND "safety"*');
    expect(parsed.exclude).toBe('"byzantine"* OR "view change"');
  });

  it('extracts filters, negated filters and #tags', () => {
    const parsed = parseSearchQuery(
      'quorum tag:Exam #cs/distributed type:summary folder:"Week 1/" module:COC251 -tag:draft',
    );
    expect(parsed.filters).toEqual({
      tag: ['exam', 'cs/distributed'],
      type: ['summary'],
      folder: ['Week 1'],
      module: ['COC251'],
      kind: [],
    });
    expect(parsed.excludedFilters.tag).toEqual(['draft']);
    expect(parsed.match).toBe('"quorum"*');
  });

  it('normalises kind filters and keeps unknown kinds so that they match nothing', () => {
    const parsed = parseSearchQuery(
      'raft kind:Slides kind:PPTX kind:notes -kind:md kind:video kind:spreadsheet',
    );
    expect(parsed.filters.kind).toEqual(['slides', 'note', 'recording', 'spreadsheet']);
    expect(parsed.excludedFilters.kind).toEqual(['text']);
    expect(withFilter('raft', 'kind', 'pdf')).toBe('raft kind:pdf');
    expect(withoutFilter('raft kind:pdf', 'kind', 'pdf')).toBe('raft');
  });

  it('allows a query of filters only', () => {
    const parsed = parseSearchQuery('tag:exam');
    expect(parsed.match).toBeNull();
    expect(parsed.empty).toBe(false);
    expect(parseSearchQuery('   ').empty).toBe(true);
  });

  it('neutralises hostile and malformed input', () => {
    const cases = [
      'NEAR(a b)',
      'a AND b NOT c',
      '"unbalanced',
      'col:value',
      'title: x',
      '***',
      '^start',
      '(((',
      '"he said ""hi"""',
      '- -- ---',
      'a"b',
      'x'.repeat(2000),
      'OR OR OR',
      'tag:',
      'C++ and C#',
    ];
    for (const input of cases) {
      const parsed = parseSearchQuery(input);
      // Every term is a quoted string; nothing but our own operators appears outside quotes.
      const outside = (parsed.match ?? '').replace(/"(?:[^"]|"")*"\*?/g, '');
      expect(outside.replace(/\b(AND|OR)\b|[() ]/g, ''), input).toBe('');
    }
    expect(parseSearchQuery('***').match).toBeNull();
    expect(parseSearchQuery('"unbalanced phrase').match).toBe('"unbalanced phrase"');
    expect(parseSearchQuery('a"b').match).toBe('"a""b"*');
    expect(parseSearchQuery('NEAR(a b)').match).toBe('"NEAR(a"* AND "b)"*');
    expect(parseSearchQuery('x'.repeat(2000)).groups[0]?.[0]?.text).toHaveLength(500);
  });

  it('caps the number of terms', () => {
    const parsed = parseSearchQuery(
      Array.from({ length: 50 }, (_, index) => `w${index}`).join(' '),
    );
    expect(parsed.groups).toHaveLength(32);
  });
});

describe('withoutFilter', () => {
  it('removes a filter in any of its spellings and keeps the rest', () => {
    expect(withoutFilter('paxos tag:exam leader', 'tag', 'exam')).toBe('paxos leader');
    expect(withoutFilter('paxos #Exam -tag:exam', 'tag', 'exam')).toBe('paxos');
    expect(withoutFilter('x folder:"Week 1" folder:Week', 'folder', 'Week 1')).toBe(
      'x folder:Week',
    );
    expect(withoutFilter('tag:examination', 'tag', 'exam')).toBe('tag:examination');
  });
});

describe('withFilter', () => {
  it('adds a filter once, quoting values with spaces', () => {
    expect(withFilter('paxos', 'tag', 'exam')).toBe('paxos tag:exam');
    expect(withFilter('paxos tag:exam', 'tag', 'Exam')).toBe('paxos tag:exam');
    expect(withFilter('', 'folder', 'Week 1')).toBe('folder:"Week 1"');
  });
});
