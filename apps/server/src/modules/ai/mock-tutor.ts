import {
  type AgentTurn,
  asList,
  type Call,
  call,
  calls,
  sentences,
  type turnOf,
  unwrap,
} from './mock-agent';

/**
 * The test model as a tutor, a quiz master and a planner (`SKB_AI_PROVIDER=mock`, Phase 14). The
 * server tells a tutor model which rung of the hint ladder it is on ("Tutor step: hint."); the mock
 * obeys it the way a good model should, so the guardrails — a first reply never gives the answer, the
 * full solution only on request and ending in a check question — can be tested with transcripts.
 */

type Turn = ReturnType<typeof turnOf>;

const topicOf = (text: string) =>
  text
    .replace(
      /^(please\s+)?(can you\s+)?(help me with|help me understand|explain|how (do|does|can)|why (do|does)|what is|what are)\s+/iu,
      '',
    )
    .replace(/[?.!]+$/u, '')
    .trim()
    .slice(0, 70) || 'this';

const REPLIES: Record<string, (topic: string) => string> = {
  diagnose: (topic) =>
    `Before I explain anything: what do you already know about ${topic}? Tell me in your own words where you get stuck, and we will start from there.`,
  hint: () =>
    'Here is a nudge, not the answer: think about what has to be true for the first step to work. What would you try first?',
  'stronger hint': () =>
    'A little more help: find the definition or rule from your lecture material that applies here, and say how it limits what can happen. Which rule do you think it is?',
  'partial solution': () =>
    'Let us do the first part together: set the problem up and apply the rule to the first case. I will leave the last step to you. What do you get? If you would rather see the full worked solution, just ask for it.',
  'worked solution': (topic) =>
    `Here is a worked solution for ${topic}.\n\n1. State the problem in your own terms.\n2. Apply the rule from the lecture to the first case.\n3. Check the result against the definition.\n\nCheck question: in your own words, why does step 2 follow from the definition?`,
  evaluate: () =>
    'Thank you. Compare your answer with the definition in your lecture material: does it match? If something is off, which part would you change?',
};

/** What a quiz reply means as a response to the question that was asked. */
function responseTo(question: Record<string, unknown>, reply: string): Record<string, unknown> {
  const text = reply.trim();
  const options = asList(question.options);
  switch (question.kind) {
    case 'mcq': {
      const letter = text.match(/^\(?([a-j])\b/iu)?.[1]?.toLowerCase();
      const byLetter = letter ? options['abcdefghij'.indexOf(letter)] : undefined;
      const byText = options.find((option) =>
        text.toLowerCase().includes(String(option.text ?? '').toLowerCase()),
      );
      return { kind: 'mcq', choice: String((byLetter ?? byText ?? options[0])?.id ?? 'a') };
    }
    case 'true_false':
      return { kind: 'true_false', value: !/\b(false|no|incorrect)\b/iu.test(text) };
    case 'numeric':
      return { kind: 'numeric', value: Number(text.match(/-?\d+(?:\.\d+)?/u)?.[0] ?? 0) };
    case 'multi':
      return { kind: 'multi', choices: [] };
    default:
      return { kind: question.kind === 'short' ? 'short' : String(question.kind), text };
  }
}

function lettered(options: Record<string, unknown>[]) {
  return options
    .map((option, index) => `${'ABCDEFGHIJ'[index]}. ${String(option.text)}`)
    .join('\n');
}

function quiz(turn: Turn): AgentTurn {
  const { request, calls: taken, earlier } = turn;
  const seen = [...earlier, ...taken];
  const lastAsked = seen.findLastIndex((entry) => entry.name === 'get_questions');
  const lastRecorded = seen.findLastIndex((entry) => entry.name === 'record_answer');
  const query = turn.first
    .replace(/^.*\b(quiz|test|question|drill)\s+me\s+(on|about)?\s*/iu, '')
    .replace(/[?.!]+$/u, '');

  // This turn: a question was fetched → put it to the student; an answer was recorded → talk it through.
  const fetched = taken.findLast((entry) => entry.name === 'get_questions');
  if (
    fetched &&
    taken.indexOf(fetched) > taken.findLastIndex((entry) => entry.name === 'record_answer')
  ) {
    const found = asList(fetched.result?.questions);
    if (found.length === 0)
      return {
        text: `I could not find any questions${query ? ` about ${query}` : ''} in your bank that you have not had yet. Add some in Practice, or ask me to make a quiz.`,
      };
    const question = found[0] as Record<string, unknown>;
    const options = asList(question.options);
    return {
      text: `Question: ${String(question.stem)}${options.length ? `\n${lettered(options)}` : ''}\nReply with your answer.`,
    };
  }
  const recorded = taken.findLast((entry) => entry.name === 'record_answer');
  if (recorded) {
    if (!recorded.ok)
      return {
        text: 'Understood: I have not recorded that answer. Say “next” whenever you want another question.',
      };
    const result = recorded.result ?? {};
    const verdict =
      result.correct === true
        ? 'Correct.'
        : result.correct === false
          ? 'Not quite.'
          : 'That one you mark yourself against the model answer.';
    return {
      text: `${verdict} The answer is: ${String(result.correctAnswer ?? '')}. ${String(result.explanation ?? '')}\nSay “next” for another question.`.replace(
        /\s+\n/gu,
        '\n',
      ),
    };
  }

  // A question is waiting for the student's reply → record it.
  if (lastAsked > lastRecorded && lastAsked >= 0 && !/^quiz me\b/iu.test(request)) {
    const question = asList(seen[lastAsked]?.result?.questions)[0];
    if (question)
      return call('record_answer', {
        questionId: question.id,
        response: responseTo(question, request),
      });
  }
  return call('get_questions', { ...(query ? { query } : {}), limit: 1 });
}

/** A check of the student's notes against the lecture material (task 14.03). */
function misconceptions(turn: Turn): AgentTurn {
  const { calls: taken, first } = turn;
  const done = (name: string): Call[] => taken.filter((entry) => entry.name === name);
  const topic = topicOf(first.replace(/^.*\b(notes?|understanding)\s+(on|about)\s+/iu, '')).replace(
    /\s+against.*$/iu,
    '',
  );
  if (done('search_knowledge').length === 0)
    return call('search_knowledge', { query: topic.split(' ')[0] ?? topic, limit: 8 });
  const found = asList(done('search_knowledge')[0]?.result?.results);
  const note = found.find((hit) => hit.kind === 'note');
  const source = found.find((hit) => hit.kind === 'source');
  if (!note || !source)
    return {
      text: `I need both your notes and a lecture source about ${topic} to compare, and I could not find both.`,
    };
  if (done('get_note').length + done('read_source').length === 0)
    return calls([
      { name: 'get_note', input: { id: note.id } },
      { name: 'read_source', input: { id: source.id } },
    ]);
  if (done('propose_note_correction').length === 0) {
    const noteBody = unwrap(String(done('get_note')[0]?.result?.content ?? ''))
      .map((piece) => piece.text)
      .join('\n');
    const lecture = unwrap(
      asList(done('read_source')[0]?.result?.passages)
        .map((passage) => String(passage.text ?? ''))
        .join('\n'),
    );
    const significant = (text: string) =>
      new Set(
        text
          .toLowerCase()
          .split(/[^\p{L}\p{N}]+/u)
          .filter((word) => word.length > 3),
      );
    const ALL = /\b(all|every|each)\b/iu;
    const SOME = /\b(majority|most|quorum)\b/iu;
    for (const sentence of noteBody.match(/[^.!?\n]+[.!?]?/gu) ?? []) {
      if (!ALL.test(sentence)) continue;
      const words = significant(sentence);
      for (const piece of lecture)
        for (const claim of sentences(piece.text)) {
          if (!SOME.test(claim)) continue;
          const shared = [...significant(claim)].filter((word) => words.has(word));
          if (shared.length < 2) continue;
          const text = sentence.trim();
          return call('propose_note_correction', {
            noteId: note.id,
            text,
            replacement: text.replace(
              /\b(all|every|each)\b\s*(of\s+)?(the\s+)?/iu,
              'a majority of ',
            ),
            explanation: 'Your lecture material says a majority is enough, not every server.',
            sourceId: source.id,
            quote: claim,
          });
        }
    }
    return {
      text: `I compared your note “${String(note.title)}” with the lecture material on ${topic} and found nothing in it that the lectures contradict.`,
    };
  }
  const proposed = done('propose_note_correction')[0];
  if (!proposed?.ok) return { text: 'I could not add that correction.' };
  return {
    text: `Your note “${String(proposed.result?.noteTitle)}” says something the lectures do not: I have put a suggested correction in your Inbox. Nothing in your note has changed; accept it there if you agree. What made you write it that way?`,
  };
}

/** The tutor, quiz master and misconception check; null if the request is none of them. */
export function mockTutorTurn(turn: Turn): AgentTurn | null {
  const step = turn.system.match(/Tutor step: ([a-z ]+?)\./u)?.[1];
  if (!step) return null;
  if (
    /\b(check|compare)\b.*\bnotes?\b|\bnotes?\b.*\b(wrong|mistakes?|correct)\b|\bmisconceptions?\b/iu.test(
      turn.first,
    )
  )
    return misconceptions(turn);
  if (step === 'quiz') return quiz(turn);
  const reply = REPLIES[step] ?? REPLIES.diagnose;
  return { text: (reply as (topic: string) => string)(topicOf(turn.first)) };
}

/** Study plans on request. */
export function mockPlanTurn(turn: Turn): AgentTurn | null {
  const { request, calls: taken } = turn;
  if (!/\bplan\b/iu.test(request)) return null;
  const made = taken.find((entry) => entry.name === 'create_study_plan');
  const read = taken.find((entry) => entry.name === 'get_study_plan');
  if (/\b(make|create|build|generate|draw up|plan my)\b/iu.test(request)) {
    if (!made) {
      const days = Number(request.match(/(\d+)[- ]day/iu)?.[1] ?? 7);
      return call('create_study_plan', { days: Math.min(28, Math.max(1, days)) });
    }
    if (!made.ok) return { text: 'I could not make a study plan.' };
    const result = made.result ?? {};
    return {
      text: `I made your plan for ${String(result.startDate)} to ${String(result.endDate)}: ${String(result.items)} items, about ${String(result.minutes)} minutes in all. Every item says why it is there. You can undo this below, and anything you tick off stays when the plan is made again.`,
    };
  }
  if (!read) return call('get_study_plan', { days: 3 });
  const items = asList(read.result?.items);
  if (!read.result?.exists) return { text: 'You have no study plan yet. Ask me to make one.' };
  return {
    text: items.length
      ? `Coming up: ${items
          .slice(0, 5)
          .map(
            (item) => `${String(item.date)} — ${String(item.title)} (${String(item.minutes)} min)`,
          )
          .join('; ')}.`
      : 'Nothing is planned for the next few days.',
  };
}
