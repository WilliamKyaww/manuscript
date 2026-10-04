import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export function Kbd({
  children,
  tone = 'default',
}: {
  children: ReactNode;
  tone?: 'default' | 'inverse';
}) {
  return (
    <kbd
      className={cn(
        'inline-flex min-w-5 items-center justify-center rounded-sm px-1 font-sans text-[0.7rem] leading-5 font-medium',
        tone === 'default'
          ? 'border border-border-strong bg-surface-sunken text-muted'
          : 'border border-current/30 text-inherit',
      )}
    >
      {children}
    </kbd>
  );
}
