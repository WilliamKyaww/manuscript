import { Tooltip as RadixTooltip } from 'radix-ui';
import type { ReactNode } from 'react';
import { keyLabels } from '../app/shortcuts/registry';
import { isApplePlatform } from '../lib/platform';
import { Kbd } from './Kbd';

export const TooltipProvider = RadixTooltip.Provider;

export interface TooltipProps {
  content: ReactNode;
  /** Optional shortcut shown after the content, e.g. `mod+k`. */
  shortcut?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  children: ReactNode;
}

/** Hover/focus hint. The trigger must already have an accessible name; tooltips are supplementary. */
export function Tooltip({ content, shortcut, side = 'top', children }: TooltipProps) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          className="z-50 flex items-center gap-2 rounded-md bg-text px-2.5 py-1.5 text-xs font-medium text-bg shadow-md"
        >
          {content}
          {shortcut && (
            <span className="flex gap-0.5 opacity-80">
              {keyLabels(shortcut, isApplePlatform()).map((label) => (
                <Kbd key={label} tone="inverse">
                  {label}
                </Kbd>
              ))}
            </span>
          )}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
