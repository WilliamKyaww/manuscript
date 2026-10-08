import { describe, expect, it } from 'vitest';
import { GraphFilterSchema, RelationInputSchema } from '../api/graph';
import { CONCEPT_RELATIONS, edgeStyleOf, nodeTypeOf, relationProblem } from './vocabulary';

const CONCEPT = 'con_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7';
const NOTE = 'note_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7';

describe('graph vocabulary', () => {
  it('reads node types from id prefixes', () => {
    expect(nodeTypeOf(CONCEPT)).toBe('concept');
    expect(nodeTypeOf(NOTE)).toBe('note');
    expect(nodeTypeOf('mod_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7')).toBe('module');
    expect(nodeTypeOf('asm_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7')).toBeUndefined();
    expect(nodeTypeOf('Paxos')).toBeUndefined();
  });

  it('checks which node types a relation connects', () => {
    expect(relationProblem('prerequisite_for', 'concept', 'concept')).toBeNull();
    expect(relationProblem('covered_in', 'concept', 'source')).toBeNull();
    expect(relationProblem('derived_from', 'note', 'source')).toBeNull();
    expect(relationProblem('prerequisite_for', 'concept', 'note')).toContain('not concept to note');
    expect(CONCEPT_RELATIONS).toEqual([
      'relates_to',
      'prerequisite_for',
      'part_of',
      'example_of',
      'contrasts_with',
    ]);
  });

  it('draws confidence as solid, dashed or dotted lines', () => {
    expect(edgeStyleOf('USER')).toBe('solid');
    expect(edgeStyleOf('EXTRACTED')).toBe('solid');
    expect(edgeStyleOf('INFERRED')).toBe('dashed');
    expect(edgeStyleOf('AMBIGUOUS')).toBe('dotted');
  });
});

describe('graph contracts', () => {
  it('accepts one filter value or several', () => {
    expect(GraphFilterSchema.parse({ types: 'concept' }).types).toEqual(['concept']);
    expect(GraphFilterSchema.parse({ types: ['concept', 'note'] }).types).toEqual([
      'concept',
      'note',
    ]);
    const defaults = GraphFilterSchema.parse({});
    expect(defaults.types).toBeUndefined();
    expect(defaults).toMatchObject({ isolated: false, limit: 5_000 });
    expect(GraphFilterSchema.parse({ isolated: 'true' }).isolated).toBe(true);
    expect(() => GraphFilterSchema.parse({ types: 'card' })).toThrow();
  });

  it('accepts only node ids as relation ends', () => {
    expect(
      RelationInputSchema.safeParse({ from: CONCEPT, to: NOTE, relation: 'covered_in' }).success,
    ).toBe(true);
    expect(
      RelationInputSchema.safeParse({ from: CONCEPT, to: 'Paxos', relation: 'relates_to' }).success,
    ).toBe(false);
  });
});
