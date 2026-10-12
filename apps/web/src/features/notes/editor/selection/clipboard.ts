import type { EditorView } from '@codemirror/view';
import { notifyError } from '../../../../lib/notify';
import { useEditorPrefs } from '../editor-prefs';
import { htmlToMarkdown, insertText } from './paste';

/**
 * Cut, Copy and Paste from the editor's menus (Phase 26). The keyboard's own shortcuts go through the
 * browser as usual; the menus use the clipboard API, which a browser may ask permission for (the
 * desktop app allows it for its own pages).
 */

export async function copySelection(view: EditorView): Promise<void> {
  const { from, to } = view.state.selection.main;
  if (from === to) return;
  try {
    await navigator.clipboard.writeText(view.state.sliceDoc(from, to));
  } catch (error) {
    notifyError(error);
  }
  view.focus();
}

export async function cutSelection(view: EditorView): Promise<void> {
  const { from, to } = view.state.selection.main;
  if (from === to || view.state.readOnly) return;
  try {
    await navigator.clipboard.writeText(view.state.sliceDoc(from, to));
    view.dispatch({ changes: { from, to }, userEvent: 'delete.cut' });
  } catch (error) {
    notifyError(error);
  }
  view.focus();
}

export async function pasteFromClipboard(
  view: EditorView,
  { plain }: { plain: boolean },
): Promise<void> {
  if (view.state.readOnly) return;
  try {
    let text: string | null = null;
    if (!plain && useEditorPrefs.getState().convertPastedHtml && 'read' in navigator.clipboard) {
      const items = await navigator.clipboard.read();
      const item = items.find((entry) => entry.types.includes('text/html'));
      if (item) {
        const html = await (await item.getType('text/html')).text();
        const plainText = item.types.includes('text/plain')
          ? await (await item.getType('text/plain')).text()
          : '';
        text = htmlToMarkdown(html, plainText) ?? plainText;
      }
    }
    text ??= await navigator.clipboard.readText();
    if (text) insertText(view, text);
  } catch {
    notifyError(
      new Error(
        'The clipboard could not be read from the menu. Press Ctrl+V (or Ctrl+Shift+V for plain text) instead.',
      ),
    );
  }
  view.focus();
}
