import {
  ChevronDown,
  Copy,
  Highlighter,
  Link,
  MoreHorizontal,
  RemoveFormatting,
  Sparkles,
  X,
} from 'lucide-react';
import { Toolbar } from 'radix-ui';
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '../../../../components/DropdownMenu';
import { MenuEntries, type MenuEntry } from '../../../../components/MenuEntries';
import { Tooltip } from '../../../../components/Tooltip';
import { cn } from '../../../../lib/cn';
import { externalUrl } from '../../links/external';
import { clearFormatting, toggleInline } from '../format';
import { BLOCK_LABELS, type BlockKind, blockKindAt, setBlock } from '../format-blocks';
import { wrapMarkdownLink, wrapWikilink } from '../format-insert';
import {
  aiEntries,
  clipboardEntries,
  highlightEntries,
  INLINE_ENTRIES,
  insertEntries,
  run,
  type SelectionContext,
  studyEntries,
} from './actions';
import { copySelection } from './clipboard';
import { type EditorHub, placeOver, useHubVersion } from './hub';

/**
 * The toolbar over selected text (Phase 26), as in Notion: turn the lines into another kind of block,
 * the inline formats, a link to a note or the web, a comment, AI and the rest. It appears once the
 * selection is made (the mouse let go, or the keyboard still for a moment) and goes with Escape; Alt+F10
 * moves into it from the editor, the arrow keys move along it, and Escape goes back to the text.
 */

const SETTLE_MS = 160;
const BUTTON =
  'inline-flex h-7 min-w-7 shrink-0 items-center justify-center gap-1 rounded-md px-1.5 text-sm text-muted outline-none hover:bg-surface-hover hover:text-text focus-visible:ring-2 focus-visible:ring-focus data-[state=open]:bg-surface-hover data-[state=open]:text-text';

type Mode = 'tools' | 'link' | 'ai';

export function SelectionToolbar({
  hub,
  context,
}: {
  hub: EditorHub;
  context(): SelectionContext | null;
}) {
  const version = useHubVersion(hub);
  const view = hub.view;
  const bar = useRef<HTMLDivElement>(null);
  const [settled, setSettled] = useState('');
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [pointerDown, setPointerDown] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [inside, setInside] = useState(false);
  const [mode, setMode] = useState<Mode>('tools');
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  const selection = view?.state.selection.main;
  const key = selection ? `${selection.from}:${selection.to}` : '';

  // The selection has to stay still for a moment before the toolbar comes. Only the selection counts:
  // focus moving into one of the toolbar's own menus must not send the toolbar (and the menu) away.
  useEffect(() => {
    const timer = setTimeout(() => setSettled(key), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [key]);

  // A new selection brings the toolbar back after Escape, and starts with the tools.
  useEffect(() => {
    setDismissed((current) => (current !== null && current !== key ? null : current));
    setMode('tools');
  }, [key]);

  // A box asked for from the right-click menu ("Edit with AI…"): looked for on every change the
  // editor reports, since the request is a field of the hub rather than state.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` is what announces the request.
  useEffect(() => {
    if (!hub.wanted) return;
    setMode(hub.wanted);
    setDismissed(null);
    setSettled(key);
    hub.wanted = null;
  }, [hub, version, key]);

  useEffect(() => {
    if (!view) return;
    const down = (event: MouseEvent) => {
      if (event.button === 0) setPointerDown(true);
    };
    const up = () => setPointerDown(false);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !view.state.selection.main.empty) setDismissed(key);
      if (event.altKey && event.key === 'F10') {
        event.preventDefault();
        bar.current?.querySelector<HTMLElement>('button')?.focus();
      }
    };
    const scroll = () => hub.notify();
    view.contentDOM.addEventListener('mousedown', down);
    view.contentDOM.addEventListener('keydown', keydown);
    view.scrollDOM.addEventListener('scroll', scroll, { passive: true });
    document.addEventListener('mouseup', up);
    return () => {
      view.contentDOM.removeEventListener('mousedown', down);
      view.contentDOM.removeEventListener('keydown', keydown);
      view.scrollDOM.removeEventListener('scroll', scroll);
      document.removeEventListener('mouseup', up);
    };
  }, [view, hub, key]);

  const ctx = context();
  const visible =
    Boolean(view && ctx && selection && !selection.empty) &&
    settled === key &&
    !pointerDown &&
    dismissed !== key &&
    (view?.hasFocus || inside || menuOpen);

  // Measured again when the box changes (the link and AI boxes are wider than the tools).
  // biome-ignore lint/correctness/useExhaustiveDependencies: mode changes the toolbar's size.
  useLayoutEffect(() => {
    if (!visible || !view || !selection) {
      setPosition(null);
      return;
    }
    const size = {
      width: bar.current?.offsetWidth ?? 440,
      height: bar.current?.offsetHeight ?? 36,
    };
    setPosition(placeOver(view, selection.from, selection.to, size));
  }, [visible, view, selection, mode]);

  if (!visible || !view || !ctx || !selection) return null;
  const back = () => {
    setMode('tools');
    view.focus();
  };

  return createPortal(
    <div
      ref={bar}
      data-overlay
      data-selection-toolbar
      className="fixed z-40 animate-fade-in"
      style={position ? { left: position.left, top: position.top } : { left: -9999, top: -9999 }}
    >
      <Toolbar.Root
        aria-label="Format the selection"
        className="flex items-center gap-0.5 rounded-lg border border-border bg-surface-raised p-1 shadow-md"
        onFocus={() => setInside(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setInside(false);
        }}
        onMouseDown={(event) => {
          // Clicking the toolbar must not take the selection away from the text.
          if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !menuOpen) {
            event.preventDefault();
            if (mode !== 'tools') setMode('tools');
            else {
              setDismissed(key);
              view.focus();
            }
          }
        }}
      >
        {mode === 'link' ? (
          <LinkForm context={ctx} onDone={back} />
        ) : mode === 'ai' ? (
          <AiForm context={ctx} onDone={back} />
        ) : (
          <Tools context={ctx} setMode={setMode} onMenu={setMenuOpen} />
        )}
      </Toolbar.Root>
    </div>,
    document.body,
  );
}

function Tools({
  context,
  setMode,
  onMenu,
}: {
  context: SelectionContext;
  setMode(mode: Mode): void;
  onMenu(open: boolean): void;
}) {
  const { view, readOnly } = context;
  const kind = blockKindAt(view.state);
  if (readOnly)
    return (
      <>
        <Button label="Copy" onClick={() => void copySelection(view)}>
          <Copy size={15} />
        </Button>
        <Menu
          label="Ask AI"
          text="Ask AI"
          icon={<Sparkles size={15} />}
          entries={aiEntries(context)}
          onMenu={onMenu}
        />
        <Menu
          label="More"
          icon={<MoreHorizontal size={15} />}
          entries={studyEntries(context)}
          onMenu={onMenu}
        />
      </>
    );
  const blocks: MenuEntry[] = [
    {
      kind: 'radio',
      label: 'Turn into',
      value: kind,
      options: (Object.keys(BLOCK_LABELS) as BlockKind[]).map((value) => ({
        value,
        label: BLOCK_LABELS[value],
      })),
      onValueChange: (value) => run(view, setBlock(value as BlockKind)),
    },
  ];
  return (
    <>
      <Menu label="Turn into" text={BLOCK_LABELS[kind]} entries={blocks} onMenu={onMenu} wide />
      <Toolbar.Separator className="mx-0.5 h-5 w-px bg-border" />
      {INLINE_ENTRIES.filter(
        (entry) => entry.format !== 'comment' && entry.format !== 'highlight',
      ).map((entry) => (
        <Button
          key={entry.format}
          label={entry.label}
          shortcut={entry.key}
          onClick={() => run(view, toggleInline(entry.format))}
        >
          {entry.icon}
        </Button>
      ))}
      <Menu
        label="Highlight"
        icon={<Highlighter size={15} />}
        entries={highlightEntries(view)}
        onMenu={onMenu}
      />
      <Button label="Link" shortcut="mod+shift+k" onClick={() => setMode('link')}>
        <Link size={15} />
      </Button>
      <Button label="Clear formatting" onClick={() => run(view, clearFormatting)}>
        <RemoveFormatting size={15} />
      </Button>
      <Toolbar.Separator className="mx-0.5 h-5 w-px bg-border" />
      <Button
        label="Comment (hidden in the reading view)"
        shortcut="mod+shift+m"
        onClick={() => run(view, toggleInline('comment'))}
      >
        {INLINE_ENTRIES.find((entry) => entry.format === 'comment')?.icon}
      </Button>
      <Menu
        label="Ask AI"
        text="Ask AI"
        icon={<Sparkles size={15} />}
        entries={[
          ...aiEntries(context).slice(0, -1),
          {
            label: 'Edit with AI…',
            icon: <Sparkles size={15} />,
            disabled: !context.ai.ready,
            onSelect: () => setMode('ai'),
          },
        ]}
        onMenu={onMenu}
      />
      <Menu
        label="More"
        icon={<MoreHorizontal size={15} />}
        entries={[
          ...studyEntries(context),
          { kind: 'separator' },
          { kind: 'submenu', label: 'Insert', entries: insertEntries(context) },
          { kind: 'separator' },
          ...clipboardEntries(context),
        ]}
        onMenu={onMenu}
      />
    </>
  );
}

function Button({
  label,
  shortcut,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <Tooltip content={label} shortcut={shortcut}>
      <Toolbar.Button type="button" aria-label={label} onClick={onClick} className={BUTTON}>
        <span aria-hidden="true" className="flex">
          {children}
        </span>
      </Toolbar.Button>
    </Tooltip>
  );
}

function Menu({
  label,
  text,
  icon,
  entries,
  onMenu,
  wide,
}: {
  label: string;
  text?: string;
  icon?: ReactNode;
  entries: MenuEntry[];
  onMenu(open: boolean): void;
  wide?: boolean;
}) {
  return (
    <DropdownMenu modal={false} onOpenChange={onMenu}>
      <DropdownMenuTrigger asChild>
        <Toolbar.Button
          type="button"
          aria-label={text && text !== label ? `${label}: ${text}` : label}
          className={cn(BUTTON, text && 'px-2 font-medium text-text')}
        >
          {icon && (
            <span aria-hidden="true" className="flex">
              {icon}
            </span>
          )}
          {text && <span className={cn('truncate', wide && 'max-w-28')}>{text}</span>}
          <ChevronDown aria-hidden="true" size={12} className="text-subtle" />
        </Toolbar.Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <MenuEntries entries={entries} as="dropdown" />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LinkForm({ context, onDone }: { context: SelectionContext; onDone(): void }) {
  const { view } = context;
  const [address, setAddress] = useState('');
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => field.current?.focus(), []);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const typed = address.trim();
    const url = externalUrl(/^[a-z][a-z0-9+.-]*:/iu.test(typed) ? typed : `https://${typed}`);
    if (!typed) return;
    run(view, wrapMarkdownLink(url ?? typed));
    onDone();
  };
  return (
    <form onSubmit={submit} className="flex items-center gap-1">
      <Link aria-hidden="true" size={14} className="ml-1 text-subtle" />
      <input
        ref={field}
        value={address}
        onChange={(event) => setAddress(event.target.value)}
        placeholder="Paste or type a link…"
        aria-label="Link address"
        className="h-7 w-64 rounded-md bg-surface-sunken px-2 text-sm outline-none focus:ring-2 focus:ring-focus"
      />
      <button type="submit" className={cn(BUTTON, 'font-medium text-text')}>
        Link
      </button>
      <Tooltip content="Link to a note instead: [[selection]]" shortcut={undefined}>
        <button
          type="button"
          className={cn(BUTTON, 'font-medium')}
          onClick={() => {
            run(view, wrapWikilink);
            onDone();
          }}
        >
          [[ ]] Note
        </button>
      </Tooltip>
      <button type="button" aria-label="Cancel" className={BUTTON} onClick={onDone}>
        <X aria-hidden="true" size={14} />
      </button>
    </form>
  );
}

function AiForm({ context, onDone }: { context: SelectionContext; onDone(): void }) {
  const [instruction, setInstruction] = useState('');
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => field.current?.focus(), []);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!instruction.trim()) return;
        context.askAi('custom', instruction.trim());
        onDone();
      }}
      className="flex items-center gap-1"
    >
      <Sparkles aria-hidden="true" size={14} className="ml-1 text-accent" />
      <input
        ref={field}
        value={instruction}
        onChange={(event) => setInstruction(event.target.value)}
        placeholder="Tell AI what to do with the selection…"
        aria-label="What AI should do with the selection"
        maxLength={500}
        className="h-7 w-80 rounded-md bg-surface-sunken px-2 text-sm outline-none focus:ring-2 focus:ring-focus"
      />
      <button type="submit" className={cn(BUTTON, 'font-medium text-text')}>
        Ask
      </button>
      <button type="button" aria-label="Cancel" className={BUTTON} onClick={onDone}>
        <X aria-hidden="true" size={14} />
      </button>
    </form>
  );
}
