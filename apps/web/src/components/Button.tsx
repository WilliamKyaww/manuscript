import { Slot } from 'radix-ui';
import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '../lib/cn';
import { Spinner } from './Spinner';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'link'
  | 'danger'
  | 'danger-outline';
export type ButtonSize = 'sm' | 'md';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-contrast hover:bg-accent-hover border border-transparent',
  secondary: 'bg-surface text-text border border-border-strong hover:bg-surface-hover',
  ghost: 'bg-transparent text-text border border-transparent hover:bg-surface-hover',
  // A way to another page, among buttons: coloured as a link so it does not read as a heading.
  link: 'bg-transparent text-accent border border-transparent hover:bg-surface-hover',
  danger: 'bg-danger text-danger-contrast border border-transparent hover:opacity-90',
  // In a page's header: a way to delete that is there, but is not the first thing the eye lands on.
  'danger-outline': 'bg-surface text-danger border border-danger hover:bg-danger-subtle',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
  /** Render the child element (e.g. a router Link) with button styling. */
  asChild?: boolean;
}

export const buttonClasses = (variant: ButtonVariant = 'secondary', size: ButtonSize = 'md') =>
  cn(
    'inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap',
    'transition-colors duration-(--skb-duration-fast) disabled:pointer-events-none disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
  );

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    asChild = false,
    className,
    children,
    disabled,
    type,
    ...props
  },
  ref,
) {
  const classes = cn(buttonClasses(variant, size), className);
  if (asChild) {
    return (
      <Slot.Root ref={ref} className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner size="sm" label="" />}
      {children}
    </button>
  );
});
