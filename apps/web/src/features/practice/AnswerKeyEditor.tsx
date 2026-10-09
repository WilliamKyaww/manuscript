import type { QuestionAnswer, QuestionKind } from '@skb/core';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { IconButton } from '../../components/IconButton';
import { Input } from '../../components/Input';
import { Field, numberOrNull, selectClasses } from '../learning/Field';

/**
 * The answer key of each kind of question (task 9.10): options with the right ones ticked and why
 * each is right or wrong; true or false; a number with its tolerance and unit; accepted short
 * answers; or a model answer to grade yourself against.
 */

export const textareaClasses =
  'w-full rounded-md border border-border-strong bg-surface px-3 py-2 font-mono text-sm text-text';

type Option = Extract<QuestionAnswer, { kind: 'mcq' }>['options'][number];

const nextOptionId = (options: readonly Option[]) => {
  const used = new Set(options.map((option) => option.id));
  for (const letter of 'abcdefghijklmnopqrstuvwxyz') if (!used.has(letter)) return letter;
  return `o${options.length + 1}`;
};

const blankOption = (id: string, correct = false): Option => ({
  id,
  text: '',
  correct,
  explanation: '',
});

/** A key for `kind`, keeping what carries over from the previous one (options, model answers). */
export function convertAnswer(kind: QuestionKind, previous?: QuestionAnswer): QuestionAnswer {
  const options =
    previous && (previous.kind === 'mcq' || previous.kind === 'multi')
      ? previous.options
      : [blankOption('a', true), blankOption('b')];
  const model = previous && 'model' in previous ? previous.model : '';
  switch (kind) {
    case 'mcq': {
      // Exactly one right option: keep the first ticked one.
      const first = options.findIndex((option) => option.correct);
      return {
        kind,
        options: options.map((option, index) => ({
          ...option,
          correct: index === Math.max(0, first),
        })),
      };
    }
    case 'multi':
      return { kind, options };
    case 'true_false':
      return { kind, value: true };
    case 'numeric':
      return { kind, value: 0, tolerance: { type: 'absolute', amount: 0 }, unit: '' };
    case 'short':
      return { kind, accepted: [''] };
    case 'code':
      return { kind, model, language: previous?.kind === 'code' ? previous.language : '' };
    default:
      return { kind, model };
  }
}

export function AnswerKeyEditor({
  value,
  onChange,
}: {
  value: QuestionAnswer;
  onChange(next: QuestionAnswer): void;
}) {
  switch (value.kind) {
    case 'mcq':
    case 'multi':
      return <OptionsEditor value={value} onChange={onChange} />;
    case 'true_false':
      return (
        <fieldset className="flex gap-4 text-sm">
          <legend className="mb-1 text-sm font-medium">The statement is</legend>
          {[true, false].map((answer) => (
            <label key={String(answer)} className="flex items-center gap-2">
              <input
                type="radio"
                name="true-false-key"
                checked={value.value === answer}
                onChange={() => onChange({ ...value, value: answer })}
              />
              {answer ? 'True' : 'False'}
            </label>
          ))}
        </fieldset>
      );
    case 'numeric':
      return <NumericEditor value={value} onChange={onChange} />;
    case 'short':
      return <ShortEditor value={value} onChange={onChange} />;
    default:
      return (
        <div className="space-y-3">
          {value.kind === 'code' && (
            <Field
              label="Language"
              hint="For highlighting, e.g. python, java, sql."
              className="w-56"
            >
              {(id, hint) => (
                <Input
                  id={id}
                  aria-describedby={hint}
                  value={value.language}
                  onChange={(event) => onChange({ ...value, language: event.target.value.trim() })}
                />
              )}
            </Field>
          )}
          <Field
            label={value.kind === 'code' ? 'Model solution' : 'Model answer'}
            hint="You compare your answer with this and grade yourself: missed, partly or got it."
          >
            {(id, hint) => (
              <textarea
                id={id}
                aria-describedby={hint}
                rows={5}
                className={textareaClasses}
                value={value.model}
                onChange={(event) => onChange({ ...value, model: event.target.value })}
              />
            )}
          </Field>
        </div>
      );
  }
}

function OptionsEditor({
  value,
  onChange,
}: {
  value: Extract<QuestionAnswer, { kind: 'mcq' | 'multi' }>;
  onChange(next: QuestionAnswer): void;
}) {
  const single = value.kind === 'mcq';
  const update = (index: number, change: Partial<Option>) =>
    onChange({
      ...value,
      options: value.options.map((option, at) => {
        if (at === index) return { ...option, ...change };
        // Ticking one option of a single-choice question unticks the others.
        return single && change.correct ? { ...option, correct: false } : option;
      }),
    });
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium">
        Options — tick {single ? 'the right one' : 'every right one'}
      </legend>
      {value.options.map((option, index) => (
        <div key={option.id} className="flex items-start gap-2">
          <input
            type={single ? 'radio' : 'checkbox'}
            name="option-key"
            className="mt-2.5"
            aria-label={`Option ${index + 1} is right`}
            checked={option.correct}
            onChange={(event) => update(index, { correct: event.target.checked })}
          />
          <div className="min-w-0 flex-1 space-y-1">
            <Input
              aria-label={`Option ${index + 1}`}
              placeholder={`Option ${index + 1}`}
              value={option.text}
              onChange={(event) => update(index, { text: event.target.value })}
            />
            <Input
              aria-label={`Why option ${index + 1} is ${option.correct ? 'right' : 'wrong'}`}
              placeholder={
                option.correct ? 'Why it is right (optional)' : 'Why it is wrong (optional)'
              }
              className="h-8 text-xs"
              value={option.explanation}
              onChange={(event) => update(index, { explanation: event.target.value })}
            />
          </div>
          <IconButton
            label={`Remove option ${index + 1}`}
            icon={<Trash2 size={14} />}
            size="sm"
            disabled={value.options.length <= 2}
            onClick={() =>
              onChange({ ...value, options: value.options.filter((_, at) => at !== index) })
            }
          />
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        disabled={value.options.length >= 10}
        onClick={() =>
          onChange({
            ...value,
            options: [...value.options, blankOption(nextOptionId(value.options))],
          })
        }
      >
        <Plus aria-hidden="true" size={14} /> Add option
      </Button>
    </fieldset>
  );
}

function NumericEditor({
  value,
  onChange,
}: {
  value: Extract<QuestionAnswer, { kind: 'numeric' }>;
  onChange(next: QuestionAnswer): void;
}) {
  // Text while typing, so "-" or "0." can be on the way to a number.
  const [answer, setAnswer] = useState(String(value.value));
  const [amount, setAmount] = useState(
    String(
      value.tolerance.type === 'relative' ? value.tolerance.amount * 100 : value.tolerance.amount,
    ),
  );
  const setTolerance = (type: 'absolute' | 'relative', text: string) => {
    const number = numberOrNull(text);
    if (number === null || number < 0) return;
    onChange({
      ...value,
      tolerance: { type, amount: type === 'relative' ? number / 100 : number },
    });
  };
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Answer" className="w-40">
        {(id) => (
          <Input
            id={id}
            inputMode="decimal"
            value={answer}
            onChange={(event) => {
              setAnswer(event.target.value);
              const number = numberOrNull(event.target.value);
              if (number !== null) onChange({ ...value, value: number });
            }}
          />
        )}
      </Field>
      <Field label="Unit" className="w-28">
        {(id) => (
          <Input
            id={id}
            value={value.unit}
            placeholder="e.g. ms"
            onChange={(event) => onChange({ ...value, unit: event.target.value })}
          />
        )}
      </Field>
      <Field label="Accept within" className="w-32">
        {(id) => (
          <Input
            id={id}
            inputMode="decimal"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              setTolerance(value.tolerance.type, event.target.value);
            }}
          />
        )}
      </Field>
      <Field label="Tolerance" className="w-40">
        {(id) => (
          <select
            id={id}
            className={selectClasses}
            value={value.tolerance.type}
            onChange={(event) =>
              setTolerance(event.target.value as 'absolute' | 'relative', amount)
            }
          >
            <option value="absolute">± in the unit</option>
            <option value="relative">± per cent</option>
          </select>
        )}
      </Field>
    </div>
  );
}

function ShortEditor({
  value,
  onChange,
}: {
  value: Extract<QuestionAnswer, { kind: 'short' }>;
  onChange(next: QuestionAnswer): void;
}) {
  const [text, setText] = useState(value.accepted.join('\n'));
  return (
    <Field
      label="Accepted answers"
      hint="One per line. Case, spacing and a final full stop do not matter; anything else, you grade yourself."
    >
      {(id, hint) => (
        <textarea
          id={id}
          aria-describedby={hint}
          rows={3}
          className={textareaClasses}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            onChange({
              ...value,
              accepted: event.target.value
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean),
            });
          }}
        />
      )}
    </Field>
  );
}
