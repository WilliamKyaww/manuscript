import { X } from 'lucide-react';
import { Dialog as RadixDialog, VisuallyHidden } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { IconButton } from './IconButton';

export interface DialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Always required for accessibility; hide it visually with `hideTitle` if the design needs to. */
  title: string;
  description?: ReactNode;
  hideTitle?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Show the close (×) button in the top-right corner. */
  showClose?: boolean;
}

const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' };

/** Modal dialogue built on Radix: focus trap, Escape to close, focus return, labelled by its title. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  hideTitle = false,
  children,
  footer,
  size = 'md',
  className,
  showClose = true,
}: DialogProps) {
  const titleNode = (
    <RadixDialog.Title className="text-lg font-semibold">{title}</RadixDialog.Title>
  );
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 animate-fade-in bg-overlay" />
        <RadixDialog.Content
          className={cn(
            'fixed top-[12vh] left-1/2 z-50 flex max-h-[76vh] w-[calc(100vw-2rem)] -translate-x-1/2 flex-col animate-rise-in',
            'rounded-lg border border-border bg-surface-raised shadow-lg focus:outline-none',
            SIZES[size],
            className,
          )}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          {(!hideTitle || showClose) && (
            <div className="flex items-start justify-between gap-4 px-5 pt-4">
              <div className="min-w-0">
                {hideTitle ? <VisuallyHidden.Root>{titleNode}</VisuallyHidden.Root> : titleNode}
                {description && (
                  <RadixDialog.Description className="mt-1 text-sm text-muted">
                    {description}
                  </RadixDialog.Description>
                )}
              </div>
              {showClose && (
                <RadixDialog.Close asChild>
                  <IconButton label="Close" icon={<X size={18} />} size="sm" tooltip={false} />
                </RadixDialog.Close>
              )}
            </div>
          )}
          {hideTitle && !showClose && <VisuallyHidden.Root>{titleNode}</VisuallyHidden.Root>}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
