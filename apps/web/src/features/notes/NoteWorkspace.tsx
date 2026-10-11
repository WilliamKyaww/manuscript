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
import {
  ArrowLeftFromLine,
  Link2,
  ListTree,
  Network,
  Sparkles,
  SquarePlus,
  Tags,
} from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { IconButton } from '../../components/IconButton';
import { Pane } from '../../components/Pane';
import { LoadingState } from '../../components/States';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/Tabs';
import { useApi } from '../../lib/api/context';
import { cn } from '../../lib/cn';
import { notifyError, notifySuccess } from '../../lib/notify';
import { conceptsQuery } from '../concepts/api';
import { ConceptDialog } from '../concepts/ConceptDialog';
import { LocalGraph } from '../graph/LocalGraph';
import { useInboxActions } from '../inbox/api';
import { GenerateDialog } from '../inbox/GenerateDialog';
import { useQuickAdd } from '../review/quick-add';
import { useUploadAttachment } from './api';
import { ConflictBanner } from './editor/ConflictBanner';
import { MarkdownEditor, type MarkdownEditorHandle } from './editor/MarkdownEditor';
import { type SaveStatus, useNoteSession } from './editor/useNoteSession';
import { type SidePanel, useNotesUi } from './notes-store';
import { BacklinksPanel } from './panels/BacklinksPanel';
import { OutlinePanel } from './panels/OutlinePanel';
import { PropertiesPanel } from './panels/PropertiesPanel';
import type { PreviewTarget } from './preview/remark-obsidian';
import { LivePreviewToggle, ModeToggle } from './ViewControls';

/**
 * One open note (tasks 3.14–3.18): the editor and/or preview, save status and conflicts, and the
 * details panel (outline, backlinks, properties). Keyed by note id, so state never leaks between notes.
 */

export interface NoteWorkspaceProps {
  note: NoteDetail;
  tree: NoteTree | undefined;
  resolver: LinkResolver;
  /** 1-based line to show when opening (from backlinks). */
  line?: number;
  onCreateFromLink(title: string, folder: string): void;
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
}: NoteWorkspaceProps) {
  const navigate = useNavigate();
  const editor = useRef<MarkdownEditorHandle>(null);
  const preview = useRef<HTMLDivElement>(null);
  const session = useNoteSession(note, editor);
  const { mode, setMode, panel, setPanel, livePreview, setLivePreview } = useNotesUi();
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
    const ui = useNotesUi.getState();
    if (ui.justCreated !== note.id) return;
    ui.setJustCreated(null);
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => editor.current?.focus());
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [note.id]);

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

  const goToHeading = (heading: HeadingRef) => {
    if (mode === 'preview') {
      preview.current
        ?.querySelector(`[id="${CSS.escape(heading.slug)}"]`)
        ?.scrollIntoView({ block: 'start' });
    } else {
      editor.current?.goToLine(heading.line);
    }
  };

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

  const conflict = session.conflict;
  return (
    <Group orientation="horizontal" id="skb-note-layout" className="min-w-0 flex-1">
      <Panel id="note-text" minSize="30" className="min-w-0">
        <Pane
          title={mode === 'preview' ? 'Preview' : 'Editor'}
          hideTitle
          actions={
            <>
              <span
                aria-live="polite"
                className={cn(
                  'mr-2 text-xs',
                  session.status === 'failed' ? 'text-danger' : 'text-muted',
                )}
              >
                {session.readOnly ? 'Read-only' : STATUS_TEXT[session.status]}
                <span className="sr-only">{`, ${analysis.wordCount} words`}</span>
              </span>
              <span aria-hidden="true" className="mr-2 hidden text-xs text-subtle xl:inline">
                {analysis.wordCount} {analysis.wordCount === 1 ? 'word' : 'words'}
              </span>
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
              {mode !== 'preview' && (
                <LivePreviewToggle on={livePreview} onChange={setLivePreview} />
              )}
              <ModeToggle mode={mode} onChange={setMode} />
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
          bodyClassName="flex overflow-hidden"
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
        </Pane>
      </Panel>
      <Separator className="w-px bg-border outline-none hover:bg-accent focus-visible:bg-focus data-[separator=active]:bg-accent" />
      <Panel
        id="note-details"
        defaultSize="26"
        minSize="16"
        collapsible
        collapsedSize="0"
        className="min-w-0"
      >
        <Tabs
          value={panel}
          onValueChange={(value) => setPanel(value as SidePanel)}
          className="h-full"
        >
          <Pane
            title="Details"
            toolbar={
              <TabsList label="Note details" className="-mb-1.5 border-b-0">
                <TabsTrigger value="outline" icon={<ListTree size={14} />}>
                  Outline
                </TabsTrigger>
                <TabsTrigger value="backlinks" icon={<ArrowLeftFromLine size={14} />}>
                  Backlinks
                </TabsTrigger>
                <TabsTrigger value="properties" icon={<Tags size={14} />}>
                  Properties
                </TabsTrigger>
                <TabsTrigger value="graph" icon={<Network size={14} />}>
                  Graph
                </TabsTrigger>
              </TabsList>
            }
          >
            <TabsContent value="outline">
              <OutlinePanel headings={analysis.headings} onSelect={goToHeading} />
            </TabsContent>
            <TabsContent value="backlinks">
              <BacklinksPanel noteId={note.id} />
            </TabsContent>
            <TabsContent value="properties">
              <PropertiesPanel
                text={liveText}
                readOnly={session.readOnly}
                onChange={(text) => {
                  editor.current?.setText(text);
                  setLiveText(text);
                }}
              />
            </TabsContent>
            <TabsContent value="graph">
              <div className="p-3">
                <LocalGraph node={note.id} height={240} />
              </div>
            </TabsContent>
          </Pane>
        </Tabs>
      </Panel>
    </Group>
  );
}
