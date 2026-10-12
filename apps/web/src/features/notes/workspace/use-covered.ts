import { type RefObject, useEffect, useState } from 'react';

/**
 * Whether something of the page's own is drawn over an element (Phase 26): a dialogue anywhere, or a
 * menu, pop-over, tooltip or toast that overlaps it. The web pane needs this because its page is a
 * native view above the document: while it is covered, it shows a picture of itself instead.
 */

/** Overlays that cover the element only where they overlap it. */
const FLOATING = [
  '[data-radix-popper-content-wrapper]',
  '[data-sonner-toast]',
  '[data-overlay]',
  '.cm-tooltip',
].join(',');
/** Modal dialogues dim the whole window, so they always cover it. */
const MODAL = '[role="dialog"]:not([aria-modal="false"]),[role="alertdialog"]';

function overlaps(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

export function isCovered(element: Element, root: ParentNode = document): boolean {
  const box = element.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return false;
  for (const modal of root.querySelectorAll(MODAL)) {
    // A dialogue inside the element itself (none today) would not hide it.
    if (!element.contains(modal) && modal.getClientRects().length > 0) return true;
  }
  for (const floating of root.querySelectorAll(FLOATING)) {
    if (element.contains(floating)) continue;
    const rect = floating.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && overlaps(rect, box)) return true;
  }
  return false;
}

export function useCovered(target: RefObject<HTMLElement | null>, enabled: boolean): boolean {
  const [covered, setCovered] = useState(false);
  useEffect(() => {
    if (!enabled) {
      setCovered(false);
      return;
    }
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const element = target.current;
        setCovered(element ? isCovered(element) : false);
      });
    };
    // Menus, pop-overs and dialogues are portals: children of the body that come and go. Watching
    // only those (not the whole document) keeps typing in a note beside the pane cheap.
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true });
    window.addEventListener('resize', check);
    check();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', check);
    };
  }, [target, enabled]);
  return covered;
}
