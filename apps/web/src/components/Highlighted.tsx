import type { TextPart } from '@skb/core';
import { cn } from '../lib/cn';

/**
 * Text with matched parts emphasised (search snippets, quick-switcher labels). Takes parts or
 * character ranges — never HTML — so highlighted user content cannot inject markup.
 */
export function Highlighted({
  parts,
  text,
  ranges,
  className,
}: {
  parts?: readonly TextPart[];
  text?: string;
  ranges?: readonly [number, number][];
  className?: string;
}) {
  const pieces: TextPart[] = parts ? [...parts] : [];
  if (!parts && text !== undefined) {
    let cursor = 0;
    for (const [start, end] of [...(ranges ?? [])].sort((a, b) => a[0] - b[0])) {
      if (start > cursor) pieces.push({ text: text.slice(cursor, start), match: false });
      pieces.push({ text: text.slice(Math.max(start, cursor), end), match: true });
      cursor = Math.max(cursor, end);
    }
    if (cursor < text.length) pieces.push({ text: text.slice(cursor), match: false });
  }
  return (
    <span className={className}>
      {pieces.map((piece, index) =>
        piece.match ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and never reordered.
          <mark key={index} className={cn('rounded-sm bg-warning-subtle px-0.5 text-text')}>
            {piece.text}
          </mark>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and never reordered.
          <span key={index}>{piece.text}</span>
        ),
      )}
    </span>
  );
}
