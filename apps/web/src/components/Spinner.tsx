import { cn } from '../lib/cn';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  /** Accessible label; pass an empty string when the spinner is decorative (e.g. inside a busy button). */
  label?: string;
  className?: string;
}

const SIZES = { sm: 'size-3.5 border-2', md: 'size-5 border-2', lg: 'size-8 border-[3px]' };

export function Spinner({ size = 'md', label = 'Loading', className }: SpinnerProps) {
  const classes = cn(
    'inline-block shrink-0 animate-spin rounded-full border-current border-r-transparent motion-reduce:animate-none',
    SIZES[size],
    className,
  );
  if (!label) return <span aria-hidden="true" className={classes} />;
  return <span role="status" aria-label={label} className={classes} />;
}
