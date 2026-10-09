import type { QuestionPrompt, QuestionResponse } from '@skb/core';
import { useState } from 'react';
import { Input } from '../../components/Input';
import { cn } from '../../lib/cn';
import { numberOrNull } from '../learning/Field';
import { CardMarkdown } from '../review/CardMarkdown';
import { textareaClasses } from './AnswerKeyEditor';

/** How each kind of question is answered (task 9.11). */

/** Whether a response says enough to be checked. */
export function isComplete(response: QuestionResponse | null): response is QuestionResponse {
  if (!response) return false;
  switch (response.kind) {
    case 'mcq':
      return response.choice !== '';
    case 'multi':
      return response.choices.length > 0;
    case 'true_false':
    case 'numeric':
      return true;
    default:
      return response.text.trim() !== '';
  }
}

const optionClasses = (checked: boolean, disabled: boolean) =>
  cn(
    'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm',
    checked ? 'border-accent bg-accent-subtle' : 'border-border-strong hover:bg-surface-hover',
    disabled && 'cursor-default opacity-80 hover:bg-transparent',
  );

export function ResponseInput({
  prompt,
  value,
  onChange,
  disabled = false,
  name,
}: {
  prompt: QuestionPrompt;
  value: QuestionResponse | null;
  onChange(next: QuestionResponse): void;
  disabled?: boolean;
  /** Distinguishes the radio groups of several questions on one page (mock exams). */
  name?: string;
}) {
  const group = name ?? `response-${prompt.id}`;
  switch (prompt.kind) {
    case 'mcq':
    case 'multi': {
      const single = prompt.kind === 'mcq';
      const chosen =
        value?.kind === 'mcq' ? [value.choice] : value?.kind === 'multi' ? value.choices : [];
      return (
        <fieldset className="space-y-2" disabled={disabled}>
          <legend className="sr-only">
            {single ? 'Choose one answer' : 'Choose every right answer'}
          </legend>
          {!single && <p className="text-xs text-muted">Choose every right answer.</p>}
          {(prompt.options ?? []).map((option, index) => {
            const checked = chosen.includes(option.id);
            return (
              <label key={option.id} className={optionClasses(checked, disabled)}>
                <input
                  type={single ? 'radio' : 'checkbox'}
                  name={group}
                  className="mt-1"
                  checked={checked}
                  onChange={() =>
                    onChange(
                      single
                        ? { kind: 'mcq', choice: option.id }
                        : {
                            kind: 'multi',
                            choices: checked
                              ? chosen.filter((id) => id !== option.id)
                              : [...chosen, option.id],
                          },
                    )
                  }
                />
                <span className="w-5 shrink-0 font-medium text-muted">{index + 1}</span>
                <CardMarkdown content={option.text} cardId={prompt.id} className="min-w-0 flex-1" />
              </label>
            );
          })}
        </fieldset>
      );
    }
    case 'true_false':
      return (
        <fieldset className="flex gap-2" disabled={disabled}>
          <legend className="sr-only">True or false</legend>
          {[true, false].map((answer) => {
            const checked = value?.kind === 'true_false' && value.value === answer;
            return (
              <label
                key={String(answer)}
                className={cn(optionClasses(checked, disabled), 'flex-1')}
              >
                <input
                  type="radio"
                  name={group}
                  checked={checked}
                  onChange={() => onChange({ kind: 'true_false', value: answer })}
                />
                {answer ? 'True' : 'False'}
              </label>
            );
          })}
        </fieldset>
      );
    case 'numeric':
      return (
        <NumericInput
          unit={prompt.unit}
          disabled={disabled}
          value={value?.kind === 'numeric' ? value.value : null}
          onChange={(number) => onChange({ kind: 'numeric', value: number })}
        />
      );
    case 'short':
      return (
        <Input
          aria-label="Your answer"
          disabled={disabled}
          value={value?.kind === 'short' ? value.text : ''}
          onChange={(event) => onChange({ kind: 'short', text: event.target.value })}
        />
      );
    default: {
      const kind = prompt.kind;
      return (
        <textarea
          aria-label="Your answer"
          disabled={disabled}
          rows={kind === 'code' ? 10 : 6}
          spellCheck={kind !== 'code'}
          className={cn(textareaClasses, kind !== 'code' && 'font-sans')}
          placeholder={
            kind === 'code'
              ? `Your solution${prompt.language ? ` (${prompt.language})` : ''}`
              : kind === 'derivation'
                ? 'Work it through step by step'
                : 'Explain in your own words'
          }
          value={value && 'text' in value ? value.text : ''}
          onChange={(event) => onChange({ kind, text: event.target.value })}
        />
      );
    }
  }
}

function NumericInput({
  unit,
  value,
  onChange,
  disabled,
}: {
  unit: string | null;
  value: number | null;
  onChange(next: number): void;
  disabled: boolean;
}) {
  const [text, setText] = useState(value === null ? '' : String(value));
  return (
    <div className="flex items-center gap-2">
      <Input
        aria-label="Your answer"
        inputMode="decimal"
        className="w-48"
        disabled={disabled}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          const number = numberOrNull(event.target.value);
          if (number !== null) onChange(number);
        }}
      />
      {unit && <span className="text-sm text-muted">{unit}</span>}
    </div>
  );
}
