import { Command } from 'cmdk';
import { Dialog as RadixDialog, VisuallyHidden } from 'radix-ui';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

/**
 * Obsidian's "suggester" (tasks 23.08–23.09): type to narrow a list, arrows to move, Enter to choose.
 * Used to choose the folder to move a file to and the note to merge one into.
 */

export interface Suggestion {
  id: string;
  label: string;
  /** A second line, e.g. the folder a note is in. */
  detail?: string;
  /** Other words it can be found by (aliases). */
  keywords?: readonly string[];
}

const itemClasses =
  'flex cursor-default items-center gap-3 rounded-md px-3 py-2 text-sm text-text select-none data-[selected=true]:bg-surface-hover';

/** Prefix matches first, then matches anywhere; at most `limit`. */
export function rankSuggestions(
  query: string,
  items: readonly Suggestion[],
  limit = 50,
): Suggestion[] {
  const wanted = query.trim().toLocaleLowerCase('en-GB');
  if (wanted === '') return items.slice(0, limit);
  const scored: { item: Suggestion; score: number }[] = [];
  for (const item of items) {
    const texts = [item.label, item.detail ?? '', ...(item.keywords ?? [])].map((text) =>
      text.toLocaleLowerCase('en-GB'),
    );
    const label = texts[0] ?? '';
    const score = label.startsWith(wanted)
      ? 3
      : label.includes(wanted)
        ? 2
        : texts.some((text) => text.includes(wanted))
          ? 1
          : 0;
    if (score > 0) scored.push({ item, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label, 'en-GB'))
    .slice(0, limit)
    .map((entry) => entry.item);
}

export function SuggestDialog({
  open,
  onOpenChange,
  title,
  placeholder,
  items,
  icon,
  empty,
  onChoose,
  footer,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Read out as the dialogue's name, e.g. "Move “Paxos” to a folder". */
  title: string;
  placeholder: string;
  items: readonly Suggestion[];
  icon?: ReactNode;
  empty: string;
  onChoose(id: string): void;
  footer?: ReactNode;
}) {
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);
  const matches = useMemo(() => rankSuggestions(query, items), [query, items]);

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-overlay" />
        <RadixDialog.Content
          aria-describedby={undefined}
          data-suggest-dialog
          className="fixed top-[14vh] left-1/2 z-50 w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-surface-raised shadow-lg"
        >
          <VisuallyHidden.Root>
            <RadixDialog.Title>{title}</RadixDialog.Title>
          </VisuallyHidden.Root>
          <Command label={title} shouldFilter={false} loop>
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder={placeholder}
              className="h-12 w-full border-b border-border bg-transparent px-4 text-sm text-text outline-none placeholder:text-subtle"
            />
            <Command.List className="max-h-[min(22rem,55vh)] overflow-y-auto p-2">
              {matches.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-muted">{empty}</p>
              )}
              {matches.map((item) => (
                <Command.Item
                  key={item.id}
                  value={item.id}
                  onSelect={() => onChoose(item.id)}
                  className={itemClasses}
                >
                  {icon && (
                    <span aria-hidden="true" className="flex shrink-0 text-muted">
                      {icon}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{item.label}</span>
                    {item.detail && (
                      <span className="block truncate text-xs text-muted">{item.detail}</span>
                    )}
                  </span>
                </Command.Item>
              ))}
            </Command.List>
          </Command>
          {footer && (
            <div className="border-t border-border px-4 py-2 text-xs text-muted">{footer}</div>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
