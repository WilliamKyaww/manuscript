import { describe, expect, it } from 'vitest';
import {
  asksForSolution,
  asksToBeQuizzed,
  CHECK_MARKER,
  type TutorTurn,
  tutorGuidance,
  tutorReplyProblems,
} from './tutor';

const student = (text: string): TutorTurn => ({ role: 'student', text });
const tutor = (text: string): TutorTurn => ({ role: 'tutor', text });

describe('the hint ladder', () => {
  it('starts by finding out what the student knows, never with a solution', () => {
    expect(tutorGuidance([student('How do I show Raft elects one leader per term?')]).step).toBe(
      'diagnose',
    );
  });

  it('climbs one rung with each turn the student is still stuck', () => {
    const turns: TutorTurn[] = [student('Why does Raft need a majority?')];
    const steps = [tutorGuidance(turns).step];
    for (const reply of ['Not sure', 'Still stuck', 'I do not get it', 'No idea']) {
      turns.push(tutor('A question for you?'), student(reply));
      steps.push(tutorGuidance(turns).step);
    }
    expect(steps).toEqual(['diagnose', 'hint', 'stronger_hint', 'partial', 'partial']);
  });

  it('gives the worked solution only when asked in so many words', () => {
    const turns = [
      student('Why does Raft need a majority?'),
      tutor('What if two leaders were elected?'),
    ];
    expect(tutorGuidance([...turns, student('Not sure')]).step).toBe('hint');
    expect(tutorGuidance([...turns, student('Please show me the full solution')]).step).toBe(
      'worked',
    );
    expect(tutorGuidance([...turns, student('I give up')]).step).toBe('worked');
  });

  it('evaluates the answer to a check question, then starts the ladder again', () => {
    const turns: TutorTurn[] = [
      student('Explain two-phase commit'),
      tutor(`Here it is. ${CHECK_MARKER} What blocks if the coordinator fails?`),
      student('The participants'),
    ];
    expect(tutorGuidance(turns).step).toBe('evaluate');
    turns.push(tutor('Right. A harder one?'), student('Go on'));
    expect(tutorGuidance(turns).step).toBe('diagnose');
  });

  it('recognises a request to be quizzed', () => {
    expect(tutorGuidance([student('Quiz me on consensus')]).step).toBe('quiz');
    expect(asksToBeQuizzed('ask me some questions about Raft')).toBe(true);
    expect(asksToBeQuizzed('why does Raft work')).toBe(false);
  });

  it('knows a request for the answer when it sees one', () => {
    for (const text of [
      'show me the solution',
      'Give me the full answer',
      'just tell me',
      'can I see a worked example',
    ])
      expect(asksForSolution(text)).toBe(true);
    expect(asksForSolution('can you explain the answer to part (b)')).toBe(false);
  });

  it('tells the model what each step allows', () => {
    expect(tutorGuidance([student('Help')]).instruction).toContain('Do NOT state the answer');
    const worked = tutorGuidance([student('show me the solution')]);
    expect(worked.instruction).toContain(`beginning exactly "${CHECK_MARKER}"`);
  });
});

describe('checking a reply against its step', () => {
  it('flags a first reply that opens with the answer or asks nothing', () => {
    expect(tutorReplyProblems('diagnose', 'The answer is a majority, because…')).toEqual([
      'opens with the answer',
      'asks nothing',
    ]);
    expect(tutorReplyProblems('diagnose', 'What do you already know about terms?')).toEqual([]);
  });

  it('requires a worked solution to end with a check question', () => {
    expect(tutorReplyProblems('worked', 'Step 1… Step 2…')).toEqual(['no check question']);
    expect(tutorReplyProblems('worked', `Step 1…\n${CHECK_MARKER} Why?`)).toEqual([]);
  });
});

describe('a quiz under way', () => {
  it('goes on while the tutor keeps putting questions from the bank', () => {
    const turns: TutorTurn[] = [
      student('Quiz me on Raft'),
      { role: 'tutor', text: 'Question 1: …', tools: ['get_questions'] },
      student('A leader'),
    ];
    expect(tutorGuidance(turns).step).toBe('quiz');
    turns.push({ role: 'tutor', text: 'Right. Next…', tools: ['record_answer', 'get_questions'] });
    turns.push(student('B'));
    expect(tutorGuidance(turns).step).toBe('quiz');
    // Once the tutor stops using the bank, a plain reply is a plain turn again.
    turns.push({ role: 'tutor', text: 'That is all for now.', tools: ['record_answer'] });
    turns.push(student('Thanks, how does term numbering work?'));
    expect(tutorGuidance(turns).step).toBe('quiz');
    turns.push({ role: 'tutor', text: 'What do you think?', tools: [] });
    turns.push(student('No idea'));
    expect(tutorGuidance(turns).step).toBe('diagnose');
    turns.push({ role: 'tutor', text: 'What do you think?', tools: [] }, student('Still no idea'));
    expect(tutorGuidance(turns).step).toBe('hint');
  });
});
