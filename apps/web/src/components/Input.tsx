import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

const fieldClasses = cn(
  'w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text',
  'placeholder:text-subtle disabled:cursor-not-allowed disabled:opacity-60',
  'aria-invalid:border-danger',
);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, type = 'text', ...props }, ref) {
    return (
      <input ref={ref} type={type} className={cn(fieldClasses, 'h-9', className)} {...props} />
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, rows = 4, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(fieldClasses, 'py-2 leading-relaxed', className)}
      {...props}
    />
  );
});
