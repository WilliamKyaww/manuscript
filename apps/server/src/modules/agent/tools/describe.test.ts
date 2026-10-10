import { describe, expect, it } from 'vitest';
import type { AgentServices } from '../types';
import { createConcept, mergeConcepts } from './concepts';
import { createNote, deleteNote, listNotes } from './knowledge';
import { createQuiz, deleteCards, getWeakAreas, listModules } from './learning';
import { readSource } from './sources';

/**
 * The lines the activity list and approval cards show (Phase 20, task 20.16): counts agree with their
 * nouns, a call that has not run says what it will do rather than what it did, and an approval names
 * its target as the student knows it.
 */

describe('activity lines', () => {
  it('count in the singular and the plural', () => {
    expect(listNotes.describe({}, { total: 1, notes: [] })).toBe('Listed 1 note');
    expect(listNotes.describe({}, { total: 3, notes: [] })).toBe('Listed 3 notes');
    expect(listModules.describe({}, { modules: [{}] })).toBe('Listed 1 module');
    expect(getWeakAreas.describe({}, { areas: [{}] })).toBe('Found 1 weak area');
    expect(readSource.describe({}, { title: 'Raft', passages: [{}] })).toBe(
      'Read 1 passage of “Raft”',
    );
    expect(createQuiz.describe({}, { title: 'Raft', questionCount: 1 })).toBe(
      'Created the quiz “Raft” (1 question)',
    );
    expect(deleteCards.describe({ cardIds: ['a'] }, { deleted: 2 })).toBe('Deleted 2 flashcards');
  });

  it('say what a call will do before it has run', () => {
    expect(createNote.describe({ title: 'Raft' })).toBe('Create the note “Raft”');
    expect(createNote.describe({ title: 'Raft' }, { title: 'Raft' })).toBe(
      'Created the note “Raft”',
    );
    expect(createConcept.describe({ name: 'Quorum' })).toBe('Create the concept “Quorum”');
    expect(deleteCards.describe({ cardIds: ['a'] })).toBe('Deleting 1 flashcard');
  });

  it('name what an approval is for, as the student knows it', () => {
    const services = {
      notes: { notes: { get: () => ({ title: 'Scratch' }) } },
      concepts: {
        list: () => [
          { id: 'con_a', name: 'Paxos' },
          { id: 'con_b', name: 'Paxos (copy)' },
        ],
      },
    } as unknown as AgentServices;
    expect(deleteNote.ask?.(services, { id: 'note_1' })).toBe(
      'Move the note “Scratch” to the trash',
    );
    expect(mergeConcepts.ask?.(services, { keep: 'con_a', merge: 'con_b' })).toBe(
      'Merge the concept “Paxos (copy)” into “Paxos”',
    );
    expect(deleteCards.ask?.(services, { cardIds: ['a', 'b'] })).toBe('Delete 2 flashcards');
  });
});
