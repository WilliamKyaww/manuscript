import { describe, expect, it } from 'vitest';
import { formatDate, instantiateTemplate } from './templates';

// Local time: templates fill in the user's own date and time.
const now = new Date(2026, 9, 4, 9, 5, 7);

describe('formatDate', () => {
  it('formats Moment-style tokens in British English', () => {
    expect(formatDate(now, 'YYYY-MM-DD')).toBe('2026-10-04');
    expect(formatDate(now, 'dddd D MMMM YYYY')).toBe('Sunday 4 October 2026');
    expect(formatDate(now, 'ddd D MMM YY, HH:mm:ss')).toBe('Sun 4 Oct 26, 09:05:07');
    expect(formatDate(now, '[Week of] D/M H')).toBe('Week of 4/10 9');
  });
});

describe('instantiateTemplate', () => {
  it('fills placeholders and leaves unknown ones alone', () => {
    const template =
      '# {{title}}\nDate: {{date}} {{time}}\nLong: {{date:dddd D MMMM}}\nModule: {{module}} / {{ lecture }}\n{{unknown}}';
    expect(
      instantiateTemplate(template, {
        title: 'Paxos',
        now,
        module: 'COC251',
        lecture: 'COC251/L03',
      }),
    ).toBe(
      '# Paxos\nDate: 2026-10-04 09:05\nLong: Sunday 4 October\nModule: COC251 / COC251/L03\n{{unknown}}',
    );
  });

  it('removes the template’s own id so each note gets a fresh one', () => {
    const template =
      '---\nid: note_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7\ntype: lecture-notes # keep\n---\n# {{title}}';
    expect(instantiateTemplate(template, { title: 'L3', now })).toBe(
      '---\ntype: lecture-notes # keep\n---\n# L3',
    );
  });

  it('keeps templates with invalid frontmatter as they are apart from placeholders', () => {
    expect(instantiateTemplate('---\na: [\n---\n{{title}}', { title: 'T', now })).toBe(
      '---\na: [\n---\nT',
    );
  });

  it('fills missing course fields with nothing', () => {
    expect(instantiateTemplate('[{{module}}]', { title: 'T', now })).toBe('[]');
  });
});
