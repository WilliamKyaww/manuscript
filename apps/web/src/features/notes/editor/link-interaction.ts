import type { Extension } from '@codemirror/state';
import { EditorView, hoverTooltip } from '@codemirror/view';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { wantsBrowser } from '../links/external';
import { LinkCard } from '../links/LinkCard';
import { linkAt } from './links';

/**
 * How web links behave in the editor (Phase 26). A link drawn by live preview is clicked like a link:
 * a plain click opens it beside the note, Ctrl+click (⌘ on a Mac) or a middle click in the browser.
 * Its source is edited from the link card's Edit, the keyboard, or a click beside it. Where the source
 * is showing, a plain click places the cursor as usual and Ctrl+click opens the link in the browser.
 * Resting the pointer on any web link shows the card: the address, Copy, Edit and Open in browser.
 */

export interface LinkHandlers {
  /** A web link to open: in the browser when `browser`, otherwise beside the note. */
  openWebLink(url: string, browser: boolean): void;
}

/** Selects a link's address, which shows its source to be edited. */
export function editLinkAddress(view: EditorView, position: number): boolean {
  const link = linkAt(view.state, position);
  if (!link) return false;
  view.dispatch({
    selection: { anchor: link.address.from, head: link.address.to },
    scrollIntoView: true,
  });
  view.focus();
  return true;
}

const cardTheme = EditorView.theme({
  // The card draws its own surface; the tooltip around it stays out of the way.
  '.cm-tooltip.cm-tooltip-hover:has(> .cm-link-tooltip)': {
    border: 'none',
    background: 'transparent',
    boxShadow: 'none',
  },
});

export function linkInteraction(handlers: () => LinkHandlers): Extension {
  const card = hoverTooltip(
    (view, position) => {
      const link = linkAt(view.state, position);
      if (!link?.href) return null;
      const href = link.href;
      return {
        pos: link.from,
        end: link.to,
        above: false,
        create() {
          const dom = document.createElement('div');
          dom.className = 'cm-link-tooltip';
          dom.dataset.overlay = '';
          const root = createRoot(dom);
          root.render(
            createElement(LinkCard, {
              url: href,
              onEdit: view.state.readOnly ? undefined : () => editLinkAddress(view, link.from + 1),
            }),
          );
          // Unmounting during CodeMirror's update would be unmounting during a render.
          return { dom, destroy: () => queueMicrotask(() => root.unmount()) };
        },
      };
    },
    { hoverTime: 350 },
  );

  const clicks = EditorView.domEventHandlers({
    mousedown(event, view) {
      if (event.button !== 0 && event.button !== 1) return false;
      const drawn = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-href]');
      const browser = wantsBrowser(event);
      if (drawn?.dataset.href) {
        event.preventDefault();
        handlers().openWebLink(drawn.dataset.href, browser);
        return true;
      }
      if (!(event.ctrlKey || event.metaKey) && event.button !== 1) return false;
      const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
      const link = position === null ? null : linkAt(view.state, position);
      if (!link?.href) return false;
      event.preventDefault();
      handlers().openWebLink(link.href, true);
      return true;
    },
  });

  return [card, clicks, cardTheme];
}
