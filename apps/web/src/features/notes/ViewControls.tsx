import { Columns2, Eye, PenLine, Pilcrow } from 'lucide-react';
import { ToggleGroup } from 'radix-ui';
import { IconButton } from '../../components/IconButton';
import type { EditorMode } from './notes-store';

/**
 * How a note is shown: the editor, the preview or both, and whether the editor hides its marks. The
 * names show once the note's pane (a container) is wide enough for them.
 */

const MODES: { value: EditorMode; label: string; icon: typeof PenLine }[] = [
  { value: 'edit', label: 'Edit', icon: PenLine },
  { value: 'split', label: 'Split', icon: Columns2 },
  { value: 'preview', label: 'Preview', icon: Eye },
];

export function ModeToggle({
  mode,
  onChange,
}: {
  mode: EditorMode;
  onChange(mode: EditorMode): void;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={mode}
      onValueChange={(value) => value && onChange(value as EditorMode)}
      aria-label="View"
      className="flex rounded-md border border-border bg-surface p-0.5"
    >
      {MODES.map(({ value, label, icon: Icon }) => (
        <ToggleGroup.Item
          key={value}
          value={value}
          aria-label={label}
          title={label}
          className="flex h-6 items-center gap-1 rounded-sm px-2 text-xs text-muted hover:text-text data-[state=on]:bg-accent-subtle data-[state=on]:text-text"
        >
          <Icon aria-hidden="true" size={13} />
          <span className="hidden @min-[52rem]:inline">{label}</span>
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

/** Live preview on or off (task 20.05). Off shows every #, * and bracket, as a plain text editor. */
export function LivePreviewToggle({ on, onChange }: { on: boolean; onChange(on: boolean): void }) {
  return (
    <IconButton
      label="Live preview: hide Markdown marks away from the cursor"
      icon={<Pilcrow size={16} />}
      size="sm"
      aria-pressed={on}
      className="aria-pressed:bg-accent-subtle aria-pressed:text-text"
      onClick={() => onChange(!on)}
    />
  );
}
