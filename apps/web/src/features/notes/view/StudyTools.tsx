import type { GenerationScope, NoteDetail } from '@skb/core';
import type { HeadingRef } from '@skb/core/markdown';
import { Link2, Sparkles, SquarePlus } from 'lucide-react';
import { type RefObject, useEffect, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '../../../components/DropdownMenu';
import { IconButton } from '../../../components/IconButton';
import { MenuEntries } from '../../../components/MenuEntries';
import { notifyError, notifySuccess } from '../../../lib/notify';
import { useInboxActions } from '../../inbox/api';
import { GenerateDialog } from '../../inbox/GenerateDialog';
import { useQuickAdd } from '../../review/quick-add';
import type { MarkdownEditorHandle } from '../editor/MarkdownEditor';
import type { EditorMode } from '../notes-store';

/**
 * The study tools of a note's header (tasks 8.08, 11.09, 11.12): a card from the selection,
 * generating from the note or the selection, and link suggestions — three buttons in a wide pane,
 * one menu in a narrow one (task 23.04), so that the note's name keeps its room.
 */

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

/** The study tools' actions, for the editor's selection toolbar and menu (Phase 26). */
export interface StudyActions {
  makeCard(): void;
  generate(): void;
}

export function StudyTools({
  note,
  editor,
  mode,
  headings,
  actions,
}: {
  note: NoteDetail;
  editor: RefObject<MarkdownEditorHandle | null>;
  mode: EditorMode;
  headings: readonly HeadingRef[];
  /** Filled in with the actions, so that the selection toolbar runs the same ones. */
  actions?: { current: StudyActions | null };
}) {
  const inbox = useInboxActions();
  const [generating, setGenerating] = useState<GenerationScope | null>(null);

  const selection = () => {
    const selected = mode === 'preview' ? null : (editor.current?.getSelection() ?? null);
    const text = selected?.text ?? window.getSelection()?.toString() ?? '';
    const line = selected?.line ?? 1;
    return {
      text: text.trim(),
      locator: {
        kind: 'markdown' as const,
        noteId: note.id,
        headingPath: headingPathAt(headings, line),
        line,
      },
    };
  };

  /** "Make card from selection" (task 8.08): the selected text, and a way back to this line. */
  const makeCard = () => {
    const { text, locator } = selection();
    useQuickAdd.getState().open({ front: text, locator });
  };

  /** Generate from the selection if there is one, otherwise from the whole note (task 11.12). */
  const generate = () => {
    const { text, locator } = selection();
    setGenerating(
      text
        ? { kind: 'selection', text, title: note.title, locator }
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

  useEffect(() => {
    if (actions) actions.current = { makeCard, generate };
  });

  const suggesting = inbox.suggestLinks.isPending;
  return (
    <>
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
          disabled={suggesting}
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
                  disabled: suggesting,
                  onSelect: suggestLinks,
                },
              ]}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {generating && (
        <GenerateDialog
          scope={generating}
          title={generating.kind === 'selection' ? `the selection in “${note.title}”` : note.title}
          onClose={() => setGenerating(null)}
        />
      )}
    </>
  );
}
