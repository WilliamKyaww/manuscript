import { describe, expect, it } from 'vitest';
import { sectionOf } from './section';

const note =
  '---\ntitle: T\n---\n# Paxos\nIntro\n## Safety\nSafe.\n### Detail\nMore.\n## Liveness\nLive.\n# Other\nEnd';

describe('sectionOf', () => {
  it('returns a heading and everything under it until a heading of the same level', () => {
    expect(sectionOf(note, 'Safety')).toBe('## Safety\nSafe.\n### Detail\nMore.');
    expect(sectionOf(note, 'liveness')).toBe('## Liveness\nLive.');
    expect(sectionOf(note, 'Other')).toBe('# Other\nEnd');
  });

  it('returns the body without frontmatter for a whole-note embed, and null for a missing heading', () => {
    expect(sectionOf(note, null)?.startsWith('# Paxos')).toBe(true);
    expect(sectionOf(note, 'Nope')).toBeNull();
  });
});
