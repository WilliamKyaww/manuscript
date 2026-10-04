import { describe, expect, it } from 'vitest';
import { createIdFactory, ID_PREFIXES, idKind, idSchema, idTimestamp, isId, newId } from './ids';

describe('ids', () => {
  it('generates prefixed ULIDs for every entity kind', () => {
    for (const kind of Object.keys(ID_PREFIXES) as (keyof typeof ID_PREFIXES)[]) {
      const id = newId(kind);
      expect(id.startsWith(`${ID_PREFIXES[kind]}_`)).toBe(true);
      expect(isId(id, kind)).toBe(true);
      expect(idKind(id)).toBe(kind);
    }
  });

  it('rejects IDs of the wrong kind or shape', () => {
    const noteId = newId('note');
    expect(isId(noteId, 'concept')).toBe(false);
    expect(isId('note_123', 'note')).toBe(false);
    expect(isId(`${noteId}x`, 'note')).toBe(false);
    expect(isId(noteId.toLowerCase(), 'note')).toBe(false);
    expect(isId(42, 'note')).toBe(false);
    expect(idKind('banana')).toBeUndefined();
  });

  it('is deterministic with an injected clock and random source', () => {
    const make = () => createIdFactory({ now: () => 1_700_000_000_000, random: () => 0.5 });
    const a = make();
    const b = make();
    expect(a('card')).toBe(b('card'));
  });

  it('produces monotonically increasing IDs within the same millisecond', () => {
    const ids = createIdFactory({ now: () => 1_700_000_000_000 });
    const generated = Array.from({ length: 50 }, () => ids('note'));
    const sorted = [...generated].sort();
    expect(generated).toEqual(sorted);
    expect(new Set(generated).size).toBe(50);
  });

  it('encodes the creation time', () => {
    const ids = createIdFactory({ now: () => 1_700_000_000_123 });
    expect(idTimestamp(ids('source'))).toBe(1_700_000_000_123);
  });

  it('validates and brands IDs through a Zod schema', () => {
    const schema = idSchema('module');
    const id = newId('module');
    expect(schema.parse(id)).toBe(id);
    expect(schema.safeParse(newId('note')).success).toBe(false);
  });
});
