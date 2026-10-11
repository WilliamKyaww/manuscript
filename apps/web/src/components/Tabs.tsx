import { Tabs as RadixTabs } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export const Tabs = RadixTabs.Root;

export function TabsList({
  children,
  label,
  className,
}: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <RadixTabs.List
      aria-label={label}
      className={cn('@container flex gap-1 overflow-x-auto border-b border-border', className)}
    >
      {children}
    </RadixTabs.List>
  );
}

type TabsTriggerProps = {
  value: string;
  /** Five tabs or more in a narrow panel: every name shows only from 28rem rather than 19rem. */
  crowded?: boolean;
} & (
  | { children: ReactNode; icon?: undefined }
  | {
      /** Plain text: it is also the accessible name while only the icon shows. */
      children: string;
      /**
       * For a narrow panel: the icon always shows; the name on the selected tab once the list has
       * room (12rem), and on every tab once it has room for them all (19rem). Container queries, so
       * the names follow the panel's width as it is resized, not the window's.
       */
      icon: ReactNode;
    }
);

export function TabsTrigger({ value, children, icon, crowded }: TabsTriggerProps) {
  return (
    <RadixTabs.Trigger
      value={value}
      {...(icon && typeof children === 'string' ? { 'aria-label': children, title: children } : {})}
      className={cn(
        'group -mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent font-medium text-muted',
        icon ? 'px-1.5 py-1.5 text-xs' : 'px-3 py-2 text-sm',
        'hover:text-text data-[state=active]:border-accent data-[state=active]:text-text',
      )}
    >
      {icon && (
        <span aria-hidden="true" className="flex">
          {icon}
        </span>
      )}
      <span
        className={cn(
          icon &&
            (crowded
              ? 'hidden @min-[12rem]:group-data-[state=active]:inline @min-[28rem]:inline'
              : 'hidden @min-[12rem]:group-data-[state=active]:inline @min-[19rem]:inline'),
        )}
        {...(icon ? { 'aria-hidden': true } : {})}
      >
        {children}
      </span>
    </RadixTabs.Trigger>
  );
}

export function TabsContent({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <RadixTabs.Content value={value} className={cn('focus-visible:outline-none', className)}>
      {children}
    </RadixTabs.Content>
  );
}
