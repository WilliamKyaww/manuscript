import type { GenerationScope, NoteDetail, NoteTree } from '@skb/core';
import {
  analyseNote,
  folderOf,
  type HeadingRef,
  type LinkResolver,
  noteNameFromPath,
} from '@skb/core/markdown';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Link2, MoreVertical, Sparkles, SquarePlus } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '../../components/DropdownMenu';
import { IconButton } from '../../components/IconButton';
import { MenuEntries } from '../../components/MenuEntries';
import { Pane } from '../../components/Pane';
import { LoadingState } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { cn } from '../../lib/cn';
import { notifyError, notifySuccess } from '../../lib/notify';
import { conceptsQuery } from '../concepts/api';
import { ConceptDialog } from '../concepts/ConceptDialog';
import { useInboxActions } from '../inbox/api';
import { GenerateDialog } from '../inbox/GenerateDialog';
import { useQuickAdd } from '../review/quick-add';
import { useUploadAttachment } from './api';
import { ConflictBanner } from './editor/ConflictBanner';
import { MarkdownEditor, type MarkdownEditorHandle } from './editor/MarkdownEditor';
import { type SaveStatus, useNoteSession } from './editor/useNoteSession';
import { exportToPdf } from './export/PrintHost';
import { moreOptionsMenu } from './menus/file-menu';
import { useNotesUi } from './notes-store';
import { BacklinksPanel } from './panels/BacklinksPanel';
import type { PreviewTarget } from './preview/remark-obsidian';
import { ancestorsOf } from './tree/buildTree';
import { type FileActions, nodeForNote } from './useFileActions';
import { LivePreviewToggle, ModeToggle } from './ViewControls';
import { useActiveNote } from './workspace/active-note';
import { useWorkspace } from './workspace/workspace-store';

/**
 * One open note in a pane (tasks 3.14–3.18, 23.04): the editor and/or preview, save status and
 * conflicts, and the note's "More options" menu. Keyed by note id, so state never leaks between
 * notes. The view in the active pane tells the Details panel about itself (`useActiveNote`).
 */

export interface NoteWorkspaceProps {
  note: NoteDetail;
  tree: NoteTree | undefined;
  resolver: LinkResolver;
  /** 1-based line to show when opening (from backlinks). */
  line?: number;
  onCreateFromLink(title: string, folder: string): void;
  actions: FileActions;
  /** The pane this view is in, and whether that pane is the active one. */
  paneId: string;
  active: boolean;
}

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: 'Saved',
  unsaved: 'Unsaved changes',
  saving: 'Saving…',
  failed: 'Not saved — retrying',
};

const LIVE_DELAY_MS = 200;

/** The headings a line sits under, outermost first (for a card's source locator). */
export function headingPathAt(headings: readonly HeadingRef[], line: number): string[] {
  const path: HeadingRef[] = [];
  for (const heading of headings) {
    if (heading.line > line) break;
    while (path.length > 0 && (path.at(-1) as HeadingRef).level >= heading.level) path.pop();
    path.push(heading);
  }
  return path.map((heading) => heading.text);
}

// The preview (unified, KaTeX, highlight.js) is loaded only when a preview is first shown.
const MarkdownPreview = lazy(() =>
  import('./preview/MarkdownPreview').then((module) => ({ default: module.MarkdownPreview })),
);

export function NoteWorkspace({
  note,
  tree,
  resolver,
  line,
  onCreateFromLink,
  actions,
  paneId,
  active,
}: NoteWorkspaceProps) {
  const navigate = useNavigate();
  const editor = useRef<MarkdownEditorHandle>(null);
  const preview = useRef<HTMLDivElement>(null);
  const session = useNoteSession(note, editor);
  const ui = useNotesUi();
  const { mode, setMode, livePreview, setLivePreview } = ui;
  const upload = useUploadAttachment();
  const [liveText, setLiveText] = useState(session.editorText);
  const liveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const analysis = useMemo(() => analyseNote(liveText), [liveText]);
  const folder = folderOf(note.path);

  useEffect(() => () => clearTimeout(liveTimer.current), []);
  useEffect(() => {
    if (line) editor.current?.goToLine(line);
  }, [line]);
  // A note just created is for writing in. Two frames, so that this comes after the page title takes
  // focus on arriving from another section (AppShell), which would otherwise take it back.
  useEffect(() => {
    const state = useNotesUi.getState();
    if (state.justCreated !== note.id || !active) return;
    state.setJustCreated(null);
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => editor.current?.focus());
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [note.id, active]);

  const mediaTypes = useMemo(
    () =>
      new Map(
        (tree?.attachments ?? []).map((attachment) => [attachment.path, attachment.mediaType]),
      ),
    [tree],
  );
  const resolve = useCallback(
    (target: string): PreviewTarget => {
      const result = resolver.resolve(target, note.path);
      if (result.kind === 'note') return { kind: 'note', id: result.noteId, path: result.path };
      if (result.kind === 'attachment') {
        const mediaType = mediaTypes.get(result.path) ?? 'application/octet-stream';
        return { kind: 'attachment', path: result.path, mediaType };
      }
      if (result.kind === 'concept')
        return { kind: 'concept', id: result.conceptId, name: result.name };
      return { kind: 'unresolved' };
    },
    [resolver, note.path, mediaTypes],
  );

  const api = useApi();
  const concepts = useQuery(conceptsQuery(api));
  const [newConcept, setNewConcept] = useState<string | null>(null);
  const [generating, setGenerating] = useState<GenerationScope | null>(null);
  const inbox = useInboxActions();
  const completions = useMemo(
    () => ({
      notes: () => {
        const notes = (tree?.notes ?? []).map((entry) => ({
          name: noteNameFromPath(entry.path),
          title: entry.title,
          folder: folderOf(entry.path),
          aliases: entry.aliases,
        }));
        // Concepts complete like notes; a note of the same name would win the link anyway.
        const noteNames = new Set(notes.map((entry) => entry.name.toLowerCase()));
        const conceptEntries = (concepts.data?.concepts ?? [])
          .filter((concept) => !noteNames.has(concept.name.toLowerCase()))
          .map((concept) => ({
            name: concept.name,
            title: concept.name,
            folder: '',
            aliases: concept.aliases,
          }));
        return [...notes, ...conceptEntries];
      },
      attachments: () =>
        (tree?.attachments ?? []).map((attachment) => ({
          name: attachment.path.slice(attachment.path.lastIndexOf('/') + 1),
          folder: folderOf(attachment.path),
        })),
      tags: () => [] as string[],
    }),
    [tree, concepts.data],
  );

  const onChange = (text: string) => {
    session.onEditorChange(text);
    clearTimeout(liveTimer.current);
    liveTimer.current = setTimeout(() => setLiveText(text), LIVE_DELAY_MS);
  };

  const followLink = (target: string) => {
    const resolved = resolve(target);
    if (resolved.kind === 'note')
      void navigate({ to: '/notes/$noteId', params: { noteId: resolved.id } });
    else if (resolved.kind === 'concept')
      void navigate({ to: '/concepts/$conceptId', params: { conceptId: resolved.id } });
    else if (resolved.kind === 'unresolved' && target.trim())
      onCreateFromLink(target.trim(), folder);
  };

  const uploadFiles = async (files: File[], at: number) => {
    const embeds: string[] = [];
    for (const file of files) {
      try {
        embeds.push((await upload.mutateAsync({ file })).embed);
      } catch (error) {
        notifyError(error);
      }
    }
    if (embeds.length > 0) editor.current?.insertAt(at, embeds.join('\n'));
  };

  const goToHeading = useCallback(
    (heading: HeadingRef) => {
      if (mode === 'preview') {
        preview.current
          ?.querySelector(`[id="${CSS.escape(heading.slug)}"]`)
          ?.scrollIntoView({ block: 'start' });
      } else {
        editor.current?.goToLine(heading.line);
      }
    },
    [mode],
  );

  // The Details panel follows the active pane's note: its outline and properties as typed.
  const owner = `${paneId}:${note.id}`;
  const saveNow = session.saveNow;
  useEffect(() => {
    if (!active) return;
    useActiveNote.getState().publish({
      owner,
      note,
      text: liveText,
      headings: analysis.headings,
      readOnly: session.readOnly,
      goToHeading,
      setText: (text) => {
        editor.current?.setText(text);
        setLiveText(text);
      },
      flush: saveNow,
    });
  }, [active, owner, note, liveText, analysis.headings, session.readOnly, goToHeading, saveNow]);
  useEffect(() => () => useActiveNote.getState().clear(owner), [owner]);

  /** "Make card from selection" (task 8.08): the selected text, and a way back to this line. */
  const makeCard = () => {
    const selected = mode === 'preview' ? null : (editor.current?.getSelection() ?? null);
    const text = selected?.text ?? window.getSelection()?.toString() ?? '';
    const line = selected?.line ?? 1;
    useQuickAdd.getState().open({
      front: text.trim(),
      locator: {
        kind: 'markdown',
        noteId: note.id,
        headingPath: headingPathAt(analysis.headings, line),
        line,
      },
    });
  };

  /** Generate from the selection if there is one, otherwise from the whole note (task 11.12). */
  const generate = () => {
    const selected = mode === 'preview' ? null : (editor.current?.getSelection() ?? null);
    const text = (selected?.text ?? window.getSelection()?.toString() ?? '').trim();
    const line = selected?.line ?? 1;
    setGenerating(
      text
        ? {
            kind: 'selection',
            text,
            title: note.title,
            locator: {
              kind: 'markdown',
              noteId: note.id,
              headingPath: headingPathAt(analysis.headings, line),
              line,
            },
          }
        : { kind: 'note', noteId: note.id },
    );
  };

  /** Link suggestions (task 11.09): unlinked mentions and notes close in meaning, to the Inbox. */
  const suggestLinks = () =>
    inbox.suggestLinks.mutate(note.id, {
      onSuccess: ({ created }) =>
        notifySuccess(
          created === 0
            ? 'No new links to suggest'
            : `${created} link suggestion${created === 1 ? '' : 's'} in the Inbox`,
        ),
      onError: notifyError,
    });

  // Items that move focus elsewhere (the find bar, the file tree) keep it there when the menu closes.
  const focusMoves = useRef(false);
  const search = (replace: boolean) => {
    focusMoves.current = true;
    if (mode === 'preview') setMode('edit');
    // After the editor is shown again.
    requestAnimationFrame(() => editor.current?.openSearch({ replace }));
  };

  const node = nodeForNote(note);
  const menu = moreOptionsMenu(
    node,
    {
      ...actions,
      reveal: (target) => {
        focusMoves.current = true;
        actions.reveal(target);
      },
    },
    {
      mode,
      setMode,
      livePreview,
      setLivePreview,
      backlinksInDocument: ui.backlinksInDocument,
      setBacklinksInDocument: ui.setBacklinksInDocument,
      find: () => search(false),
      replace: () => search(true),
      exportPdf: () =>
        exportToPdf({ noteId: note.id, title: note.title, content: liveText, resolve }),
      addProperty: ui.requestAddProperty,
      showPanel: ui.showDetails,
      readOnly: session.readOnly,
    },
  );

  const conflict = session.conflict;
  return (
    <div
      data-note-view
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      onFocusCapture={() => !active && useWorkspace.getState().focusPane(paneId)}
      onPointerDownCapture={() => !active && useWorkspace.getState().focusPane(paneId)}
    >
      <Pane
        title={note.title}
        hideTitle
        headerStart={<NoteBreadcrumb path={note.path} onFolder={ui.reveal} />}
        actions={
          <>
            <span
              aria-live="polite"
              className={cn(
                // Read out in any pane; shown once the pane has room for it.
                'sr-only mr-2 text-xs @min-[34rem]:not-sr-only',
                session.status === 'failed' ? 'text-danger' : 'text-muted',
              )}
            >
              {session.readOnly ? 'Read-only' : STATUS_TEXT[session.status]}
              <span className="sr-only">{`, ${analysis.wordCount} words`}</span>
            </span>
            <span
              aria-hidden="true"
              className="mr-2 hidden text-xs text-subtle @min-[48rem]:inline"
            >
              {analysis.wordCount} {analysis.wordCount === 1 ? 'word' : 'words'}
            </span>
            {/* The study tools: three buttons in a wide pane, one menu in a narrow one. */}
            <div className="hidden items-center gap-1 @min-[40rem]:flex">
              <IconButton
                label="Make a card from the selection"
                icon={<SquarePlus size={16} />}
                size="sm"
                onClick={makeCard}
              />
              <IconButton
                label="Generate from this note or the selection"
                icon={<Sparkles size={16} />}
                size="sm"
                onClick={generate}
              />
              <IconButton
                label="Suggest links"
                icon={<Link2 size={16} />}
                size="sm"
                disabled={inbox.suggestLinks.isPending}
                onClick={suggestLinks}
              />
            </div>
            <div className="flex @min-[40rem]:hidden">
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <IconButton label="Study tools" icon={<Sparkles size={16} />} size="sm" />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="min-w-60">
                  <MenuEntries
                    as="dropdown"
                    entries={[
                      {
                        label: 'Make a card from the selection',
                        icon: <SquarePlus size={15} />,
                        onSelect: makeCard,
                      },
                      {
                        label: 'Generate from this note or the selection',
                        icon: <Sparkles size={15} />,
                        onSelect: generate,
                      },
                      {
                        label: 'Suggest links',
                        icon: <Link2 size={15} />,
                        disabled: inbox.suggestLinks.isPending,
                        onSelect: suggestLinks,
                      },
                    ]}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {mode !== 'preview' && <LivePreviewToggle on={livePreview} onChange={setLivePreview} />}
            <ModeToggle mode={mode} onChange={setMode} />
            {/* Not modal, as in Obsidian: the page stays readable (and reachable) beside it. */}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <IconButton label="More options" icon={<MoreVertical size={16} />} size="sm" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="min-w-60"
                onCloseAutoFocus={(event) => {
                  if (focusMoves.current) event.preventDefault();
                  focusMoves.current = false;
                }}
              >
                <MenuEntries entries={menu} as="dropdown" />
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
        toolbar={
          conflict ? (
            <ConflictBanner
              conflict={conflict}
              onReload={session.reload}
              onKeepMine={session.keepMine}
              onRecreate={() => onCreateFromLink(`${note.title} (recovered)`, folder)}
              loadTheirs={session.loadTheirs}
              mine={session.currentText}
            />
          ) : undefined
        }
        className="@container"
        bodyClassName="flex flex-col overflow-hidden"
      >
        {generating && (
          <GenerateDialog
            scope={generating}
            title={
              generating.kind === 'selection' ? `the selection in “${note.title}”` : note.title
            }
            onClose={() => setGenerating(null)}
          />
        )}
        <div className="flex min-h-0 flex-1">
          <div className={cn('min-w-0 flex-1', mode === 'preview' && 'hidden')}>
            <MarkdownEditor
              ref={editor}
              docKey={note.id}
              initialText={session.editorText}
              readOnly={session.readOnly}
              lineSeparator={session.lineSeparator}
              completions={completions}
              livePreview={livePreview}
              className="h-full"
              onChange={onChange}
              onSave={() => void session.saveNow()}
              onFollowLink={followLink}
              onFiles={(files, at) => void uploadFiles(files, at)}
            />
          </div>
          {mode !== 'edit' && (
            <div
              ref={preview}
              data-scroll-region
              className={cn(
                'min-w-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5',
                mode === 'split' && 'border-l border-border',
              )}
            >
              <div className="mx-auto max-w-3xl">
                <Suspense fallback={<LoadingState label="Preparing preview" />}>
                  <MarkdownPreview
                    content={liveText}
                    resolve={resolve}
                    noteId={note.id}
                    onCreateNote={(title) => onCreateFromLink(title, folder)}
                    onCreateConcept={setNewConcept}
                  />
                </Suspense>
                {newConcept !== null && (
                  <ConceptDialog initialName={newConcept} onClose={() => setNewConcept(null)} />
                )}
              </div>
            </div>
          )}
        </div>
        {ui.backlinksInDocument && (
          <section
            aria-label={`Backlinks to ${note.title}`}
            data-scroll-region
            className="max-h-[40%] flex-none overflow-y-auto border-t border-border bg-surface"
          >
            <BacklinksPanel noteId={note.id} />
          </section>
        )}
      </Pane>
    </div>
  );
}

/** Folder › … › note, as Obsidian shows above a note; a folder reveals itself in the file tree. */
function NoteBreadcrumb({ path, onFolder }: { path: string; onFolder(folder: string): void }) {
  const folders = ancestorsOf(path);
  return (
    // In a narrow pane the folders give way before the note's own name.
    <nav aria-label="Location" className="flex min-w-0 items-baseline text-sm whitespace-nowrap">
      {folders.length > 0 && (
        <span className="min-w-0 shrink-[4] truncate text-muted">
          {folders.map((folder) => (
            <span key={folder}>
              <button
                type="button"
                className="rounded-sm hover:text-text hover:underline"
                onClick={() => onFolder(folder)}
              >
                {folder.slice(folder.lastIndexOf('/') + 1)}
              </button>
              <span aria-hidden="true" className="px-1 text-subtle">
                /
              </span>
            </span>
          ))}
        </span>
      )}
      <span aria-current="page" className="min-w-0 truncate font-medium">
        {noteNameFromPath(path)}
      </span>
    </nav>
  );
}
