import type { Question } from '@skb/core';

/** A quiz as a Markdown file: each question with its answer, rubric and explanation. */
export function quizToMarkdown(title: string, subtitle: string, questions: readonly Question[]) {
  const lines = [`# ${title}`, '', `_${subtitle}_`, ''];
  questions.forEach((question, index) => {
    lines.push(`## ${index + 1}. ${firstLine(question.stem)}`, '');
    const rest = question.stem.split('\n').slice(1).join('\n').trim();
    if (rest) lines.push(rest, '');
    lines.push(...answerLines(question), '');
    if (question.rubric.trim()) lines.push('**Rubric:**', '', question.rubric.trim(), '');
    if (question.explanation.trim())
      lines.push('**Explanation:**', '', question.explanation.trim(), '');
  });
  return `${lines.join('\n').trimEnd()}\n`;
}

const firstLine = (text: string) => text.trim().split('\n')[0] ?? '';

function answerLines(question: Question): string[] {
  const { answer } = question;
  switch (answer.kind) {
    case 'mcq':
    case 'multi':
      return answer.options.flatMap((option) => [
        `- [${option.correct ? 'x' : ' '}] ${option.text}`,
        ...(option.explanation.trim() ? [`  - ${option.explanation.trim()}`] : []),
      ]);
    case 'true_false':
      return [`**Answer:** ${answer.value ? 'True' : 'False'}`];
    case 'numeric': {
      const unit = answer.unit ? ` ${answer.unit}` : '';
      const tolerance =
        answer.tolerance.amount === 0
          ? ''
          : answer.tolerance.type === 'absolute'
            ? ` (± ${answer.tolerance.amount}${unit})`
            : ` (± ${answer.tolerance.amount * 100} %)`;
      return [`**Answer:** ${answer.value}${unit}${tolerance}`];
    }
    case 'short':
      return [`**Accepted:** ${answer.accepted.join('; ')}`];
    case 'code':
      return ['**Model answer:**', '', `\`\`\`${answer.language}`, answer.model, '```'];
    default:
      return ['**Model answer:**', '', answer.model];
  }
}
