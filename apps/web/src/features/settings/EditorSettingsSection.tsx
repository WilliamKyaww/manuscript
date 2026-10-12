import { Switch } from 'radix-ui';
import { useId } from 'react';
import { StickySection } from '../../components/Page';
import { cn } from '../../lib/cn';
import { desktopBridge } from '../../lib/desktop';
import { useEditorPrefs } from '../notes/editor/editor-prefs';

/**
 * Settings → Editor (Phase 26): how the editor treats selections, links and pasted text. Remembered
 * on this computer, like the appearance; none of it changes a note.
 */

function PreferenceSwitch({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange(on: boolean): void;
}) {
  const id = useId();
  const hint = useId();
  return (
    <div className="flex items-start justify-between gap-6 rounded-lg border border-border bg-surface p-4">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-medium">
          {label}
        </label>
        <p id={hint} className="mt-0.5 text-xs text-muted">
          {description}
        </p>
      </div>
      <Switch.Root
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        aria-describedby={hint}
        className={cn(
          'relative mt-0.5 inline-flex h-6 w-10 shrink-0 cursor-default items-center rounded-full border border-border-strong bg-surface-sunken p-0.5 outline-none',
          'transition-colors duration-(--skb-duration-fast) focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
          'data-[state=checked]:border-accent data-[state=checked]:bg-accent',
        )}
      >
        <Switch.Thumb
          className={cn(
            'block size-4 rounded-full bg-subtle shadow-sm transition-transform duration-(--skb-duration-fast)',
            'data-[state=checked]:translate-x-4 data-[state=checked]:bg-accent-contrast',
          )}
        />
      </Switch.Root>
    </div>
  );
}

export function EditorSettingsSection() {
  const prefs = useEditorPrefs();
  const desktop = Boolean(desktopBridge()?.web);
  return (
    <StickySection
      title="Editor"
      description="How the editor treats selected text, links and pasted text. Remembered on this computer."
    >
      <div className="space-y-3">
        <PreferenceSwitch
          label="Formatting toolbar on selection"
          description="Select text to format it, link it, turn it into a list or heading, or ask AI about it. The same commands are in the right-click menu and on the keyboard."
          checked={prefs.selectionToolbar}
          onChange={(on) => prefs.set('selectionToolbar', on)}
        />
        <PreferenceSwitch
          label="Open web links beside the note"
          description={
            desktop
              ? 'A click on a link to the web opens the page in a pane on the left of the note. Off, or with Ctrl+click, links open in your browser.'
              : 'In the desktop app, a click on a link to the web opens the page beside the note. In a browser, links always open in a new tab.'
          }
          checked={prefs.openLinksBeside}
          onChange={(on) => prefs.set('openLinksBeside', on)}
        />
        <PreferenceSwitch
          label="Keep formatting when pasting"
          description="Text pasted from a web page or a document keeps its headings, lists, links and tables as Markdown. Ctrl+Shift+V always pastes plain text."
          checked={prefs.convertPastedHtml}
          onChange={(on) => prefs.set('convertPastedHtml', on)}
        />
      </div>
    </StickySection>
  );
}
