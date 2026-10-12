import type { WritingAction } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';
import { useApi } from '../../../../lib/api/context';
import { aiStatusQuery } from '../../../ai/api';
import { useEditorPrefs } from '../editor-prefs';
import { AiPanel, useAiRequest } from './AiPanel';
import type { EditorTools, SelectionContext } from './actions';
import { EditorContextMenu } from './EditorContextMenu';
import { ExtractDialog } from './ExtractDialog';
import type { EditorHub } from './hub';
import { SelectionToolbar } from './SelectionToolbar';

/**
 * Everything that works on the editor's selection (Phase 26): the right-click menu around the text,
 * the toolbar over a selection, the AI suggestion and the extract dialogue. The editor shows it only
 * where the page around it offers these tools (the Notes page).
 */

export function SelectionLayer({
  hub,
  tools,
  readOnly,
  children,
}: {
  hub: EditorHub;
  tools: EditorTools;
  readOnly: boolean;
  children: ReactNode;
}) {
  const api = useApi();
  const navigate = useNavigate();
  const status = useQuery(aiStatusQuery(api));
  const toolbar = useEditorPrefs((state) => state.selectionToolbar);
  const [extracting, setExtracting] = useState<{ from: number; to: number; text: string } | null>(
    null,
  );
  const ai = {
    ready: status.data?.enabled === true && !status.data.month.exhausted,
    reason: status.data?.month.exhausted
      ? 'This month’s AI budget is used up.'
      : (status.data?.roles.chat.reason ?? null),
  };

  const context = (): SelectionContext | null => {
    const view = hub.view;
    if (!view) return null;
    const askAi = (action: WritingAction, instruction?: string) => {
      const { from, to } = view.state.selection.main;
      const original = view.state.sliceDoc(from, to);
      if (!original.trim()) return;
      useAiRequest
        .getState()
        .ask({ hub, action, instruction, from, to, original, title: tools.noteTitle });
    };
    return {
      view,
      readOnly,
      ai,
      askAi,
      // From the menus: the toolbar's own box takes the instruction.
      askAiCustom: () => {
        hub.wanted = 'ai';
        view.focus();
        hub.notify();
      },
      extract: () => {
        const { from, to } = view.state.selection.main;
        if (from !== to) setExtracting({ from, to, text: view.state.sliceDoc(from, to) });
      },
      setUpAi: () => void navigate({ to: '/settings' }),
      tools,
    };
  };

  return (
    <>
      <EditorContextMenu hub={hub} context={context}>
        {children}
      </EditorContextMenu>
      {toolbar && <SelectionToolbar hub={hub} context={context} />}
      <AiPanel hub={hub} />
      {extracting && (
        <ExtractDialog
          text={extracting.text}
          onClose={() => {
            setExtracting(null);
            hub.view?.focus();
          }}
          onExtract={async (title) => {
            const name = await tools.extract(title, extracting.text);
            const view = hub.view;
            if (!name || !view) return name;
            const { from, to, text } = extracting;
            // Where the text is now (it may have moved while the note was being made).
            const at =
              view.state.sliceDoc(from, to) === text
                ? from
                : view.state.doc.toString().indexOf(text);
            if (at !== -1)
              view.dispatch({
                changes: { from: at, to: at + text.length, insert: `[[${name}]]` },
                userEvent: 'input.extract',
              });
            return name;
          }}
        />
      )}
    </>
  );
}
