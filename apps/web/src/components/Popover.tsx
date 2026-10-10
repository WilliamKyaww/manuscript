import { Popover as RadixPopover } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export const Popover = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;
export const PopoverClose = RadixPopover.Close;

export function PopoverContent({
  children,
  align = 'center',
  className,
  label,
}: {
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  className?: string;
  /** Accessible name for the popover region. */
  label: string;
}) {
  return (
    <RadixPopover.Portal>
      <RadixPopover.Content
        align={align}
        sideOffset={6}
        aria-label={label}
        className={cn(
          'z-50 w-72 animate-fade-in rounded-md border border-border bg-surface-raised p-4 text-sm shadow-md',
          className,
        )}
      >
        {children}
      </RadixPopover.Content>
    </RadixPopover.Portal>
  );
}
