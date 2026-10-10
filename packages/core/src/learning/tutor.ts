/**
 * Tutor mode (learning-system.md §?, agent-system.md §3, task 14.01): a guardrailed Socratic tutor
 * that does not hand over answers. The ladder is decided here, from the conversation, so it is the
 * server and not the model that says how much help the next reply may give:
 *
 *   diagnose → hint → stronger hint → partial solution → (only on request) worked solution
 *
 * and a worked solution always ends with a check question, which the student answers before the
 * ladder starts again. Pure, so the same transcript always gives the same step.
 */

export const CHECK_MARKER = 'Check question:';

export type TutorStep =
  | 'diagnose'
  | 'hint'
  | 'stronger_hint'
  | 'partial'
  | 'worked'
  | 'evaluate'
  | 'quiz';

export interface TutorTurn {
  role: 'student' | 'tutor';
  text: string;
  /** Tools the tutor used in this turn: asking a question from the bank means a quiz is running. */
  tools?: readonly string[];
}

const QUIZ_TOOLS = ['get_questions', 'record_answer'];

/** The student is asking for the answer outright. */
const ASKS_FOR_SOLUTION =
  /\b(show|give|tell)\s+me\s+(the\s+)?(full\s+|whole\s+|complete\s+|worked\s+)?(solution|answer|working)\b|\bworked\s+(solution|example)\b|\bfull\s+(solution|answer|working)\b|\bi\s+give\s+up\b|\bjust\s+tell\s+me\b/iu;

/** "Quiz me", "test me on…", "ask me questions about…". */
const ASKS_TO_BE_QUIZZED =
  /\b(quiz|test|question|drill|examine)\s+me\b|\bask\s+me\s+(some\s+)?questions?\b/iu;

export const asksForSolution = (text: string) => ASKS_FOR_SOLUTION.test(text);
export const asksToBeQuizzed = (text: string) => ASKS_TO_BE_QUIZZED.test(text);

export interface TutorGuidance {
  step: TutorStep;
  /** Added to the model's instructions for this reply only. */
  instruction: string;
}

const INSTRUCTIONS: Record<TutorStep, string> = {
  diagnose:
    'Tutor step: diagnose. Do NOT state the answer, the method or the solution. Ask ONE short question that finds out what the student already knows or where they are stuck. Keep it under 60 words.',
  hint: 'Tutor step: hint. Give ONE small hint that points at the idea or the first step, without stating the answer. End with a question for the student to try.',
  stronger_hint:
    'Tutor step: stronger hint. The student is still stuck. Give a more specific hint — name the idea or the rule that applies — but still do not give the final answer. End with a question for the student to try.',
  partial:
    'Tutor step: partial solution. Work through the first part of the solution and leave the last step for the student. Do not finish it. Tell them that a full worked solution is available if they ask for it.',
  worked: `Tutor step: worked solution. The student has asked for the full solution, so give a clear worked solution, step by step, with the reasoning. Then end with one new short question about the same idea, on its own final line, beginning exactly "${CHECK_MARKER}".`,
  evaluate: `Tutor step: evaluate. The student has answered your check question. Say whether it is right and why, briefly. If it is wrong, give one hint rather than the answer. If it is right, say what they did well and offer a harder question or the next topic. Do not start a new worked solution.`,
  quiz: 'Tutor step: quiz. Run a short quiz from the student’s own question bank: use the tools to get one question at a time, show it without its answer, wait for the student’s reply, then record their answer with the tool and give feedback on it. Never reveal an answer before the student has replied.',
};

/** What the next tutor reply may give, from the conversation so far (the student's turn last). */
export function tutorGuidance(turns: readonly TutorTurn[]): TutorGuidance {
  const last = turns.at(-1);
  if (last?.role !== 'student') return { step: 'diagnose', instruction: INSTRUCTIONS.diagnose };

  if (asksToBeQuizzed(last.text)) return { step: 'quiz', instruction: INSTRUCTIONS.quiz };

  const lastTutor = [...turns].reverse().find((turn) => turn.role === 'tutor');
  // A quiz is under way while the tutor keeps putting questions from the bank: the reply is the answer.
  if (
    turns.at(-2) === lastTutor &&
    lastTutor?.tools?.some((tool) => QUIZ_TOOLS.includes(tool)) === true
  )
    return { step: 'quiz', instruction: INSTRUCTIONS.quiz };

  // A check question the student has just answered.
  if (lastTutor?.text.includes(CHECK_MARKER) && turns.at(-2) === lastTutor)
    return { step: 'evaluate', instruction: INSTRUCTIONS.evaluate };

  if (asksForSolution(last.text)) return { step: 'worked', instruction: INSTRUCTIONS.worked };

  // How many student turns since the last check question (or since the start).
  let since = 0;
  let answeredCheck = false;
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index] as TutorTurn;
    if (turn.role === 'tutor' && turn.text.includes(CHECK_MARKER)) {
      answeredCheck = true;
      break;
    }
    // Quiz requests and answers to quiz questions are not attempts at a problem.
    const before = turns[index - 1];
    const answeringQuiz = before?.tools?.some((tool) => QUIZ_TOOLS.includes(tool)) === true;
    if (turn.role === 'student' && !answeringQuiz && !asksToBeQuizzed(turn.text)) since += 1;
  }
  // The reply to a check question was marked above, not part of the next attempt.
  if (answeredCheck) since = Math.max(0, since - 1);
  const step: TutorStep =
    since <= 1 ? 'diagnose' : since === 2 ? 'hint' : since === 3 ? 'stronger_hint' : 'partial';
  return { step, instruction: INSTRUCTIONS[step] };
}

/** Rules that hold for every tutor reply, whatever the step. */
export const TUTOR_RULES = [
  'You are a tutor, not an answer machine. The student learns by doing the thinking, so guide with questions and hints.',
  'Follow the "Tutor step" instruction for this reply exactly. A first reply never contains the full solution.',
  'Only give a full worked solution when the student asks for one in so many words; then end with a check question as instructed.',
  'Use the student’s own material: look up their notes and lecture passages with the tools and cite them.',
  'If the student’s notes disagree with the lecture material, say so kindly and propose a correction rather than changing anything.',
].join('\n');

/** Words that open a reply which is giving the answer away. */
const GIVES_ANSWER_AWAY =
  /^\s*(the\s+(full\s+)?(answer|solution)\s+(is|:)|solution\s*:|answer\s*:|here(?:'|’)s\s+the\s+(full\s+)?(solution|answer))/iu;

/**
 * What is wrong with a tutor reply for the step it was given, if anything. A guard for tests and for
 * logging — the instruction is what asks the model to behave; this notices when it did not.
 */
export function tutorReplyProblems(step: TutorStep, reply: string): string[] {
  const problems: string[] = [];
  const text = reply.trim();
  if (step === 'worked' || step === 'quiz') {
    if (step === 'worked' && !text.includes(CHECK_MARKER)) problems.push('no check question');
    return problems;
  }
  if (GIVES_ANSWER_AWAY.test(text)) problems.push('opens with the answer');
  if (step === 'diagnose' || step === 'hint' || step === 'stronger_hint') {
    if (!text.includes('?')) problems.push('asks nothing');
    if (text.split(/\s+/u).length > 140) problems.push('too long for a first step');
    if (text.includes(CHECK_MARKER)) problems.push('closes with a check question too early');
  }
  return problems;
}
