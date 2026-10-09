import { type ReactNode, useId } from 'react';
import { cn } from '../../lib/cn';

/** A labelled form control with an optional hint; `children` receives the control's id. */
export function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: ReactNode;
  className?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}) {
  const id = useId();
  const hintId = useId();
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children(id, hint ? hintId : undefined)}
      {hint && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export const selectClasses =
  'h-9 w-full rounded-md border border-border-strong bg-surface px-2 text-sm text-text';

/** A number from an input, or null when it is empty. */
export function numberOrNull(value: string): number | null {
  if (value.trim() === '') return null;
  const number = Number(value.replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

/** The message of a failed request inside a form. */
export function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger">
      {error}
    </p>
  );
}

/** Chips that toggle options on and off (checkboxes underneath). */
export const chipClasses = (on: boolean) =>
  cn(
    'cursor-pointer rounded-full border px-2.5 py-0.5 text-xs',
    on ? 'border-accent bg-accent-subtle' : 'border-border-strong hover:bg-surface-hover',
  );

export function Chips<T extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: readonly { value: T; label: string }[];
  value: readonly T[];
  onChange(next: T[]): void;
}) {
  if (options.length === 0) return null;
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const on = value.includes(option.value);
          return (
            <label key={option.value} className={chipClasses(on)}>
              <input
                type="checkbox"
                className="sr-only"
                checked={on}
                onChange={() =>
                  onChange(on ? value.filter((v) => v !== option.value) : [...value, option.value])
                }
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
