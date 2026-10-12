import { type EditorView, WidgetType } from '@codemirror/view';
import type { CalloutType } from '@skb/core/markdown';
import { CALLOUT_ICON_BODY } from '../../callouts/icons';

/** Inline widgets of live preview (Phase 25): list markers, task checkboxes, callout titles, images. */

/** A list marker: a bullet, or the number as written, in a box of one width so that text lines up. */
export class ListMarkerWidget extends WidgetType {
  constructor(readonly label: string | null) {
    super();
  }

  override eq(other: ListMarkerWidget): boolean {
    return other.label === this.label;
  }

  override toDOM(): HTMLElement {
    const marker = document.createElement('span');
    marker.className = this.label === null ? 'cm-list-bullet' : 'cm-list-number';
    marker.textContent = this.label ?? '•';
    if (this.label === null) marker.setAttribute('aria-hidden', 'true');
    return marker;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

/** A task's checkbox. Clicking it changes the character between the brackets: `[ ]` ⇄ `[x]`. */
export class CheckboxWidget extends WidgetType {
  constructor(
    /** What is between the brackets: a space, `x`, or any character a theme gives a meaning to. */
    readonly status: string,
    /** Position of that character in the document. */
    readonly at: number,
  ) {
    super();
  }

  override eq(other: CheckboxWidget): boolean {
    return other.status === this.status && other.at === this.at;
  }

  override toDOM(view: EditorView): HTMLElement {
    const done = this.status !== ' ';
    const box = document.createElement('span');
    box.className = 'cm-task-box';
    box.dataset.task = this.status;
    box.setAttribute('role', 'checkbox');
    box.setAttribute('aria-checked', done ? 'true' : 'false');
    if (done && this.status.toLowerCase() !== 'x') box.textContent = this.status;
    else if (done) box.textContent = '✓';
    box.addEventListener('mousedown', (event) => {
      event.preventDefault();
      const current = view.state.sliceDoc(this.at, this.at + 1);
      if (current === '') return;
      view.dispatch({
        changes: { from: this.at, to: this.at + 1, insert: current === ' ' ? 'x' : ' ' },
      });
    });
    return box;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

/** The title line of a callout: its icon and, when it has no title of its own, its type's name. */
export class CalloutTitleWidget extends WidgetType {
  constructor(
    readonly type: CalloutType,
    readonly label: string | null,
  ) {
    super();
  }

  override eq(other: CalloutTitleWidget): boolean {
    return other.type === this.type && other.label === this.label;
  }

  override toDOM(): HTMLElement {
    const title = document.createElement('span');
    title.className = 'cm-callout-head';
    const icon = document.createElement('span');
    icon.className = 'cm-callout-icon';
    icon.setAttribute('aria-hidden', 'true');
    // The icon is a constant from lucide's data (callouts/icons.ts), never note content.
    icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${CALLOUT_ICON_BODY[this.type]}</svg>`;
    title.append(icon);
    if (this.label !== null) {
      const text = document.createElement('span');
      text.className = 'cm-callout-label';
      text.textContent = this.label;
      title.append(text);
    }
    return title;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

/** An image embedded from the vault: `![[diagram.png]]` or `![[diagram.png|300]]`. */
export class ImageWidget extends WidgetType {
  constructor(
    readonly url: string,
    readonly alt: string,
    readonly width: number | null,
    readonly height: number | null,
  ) {
    super();
  }

  override eq(other: ImageWidget): boolean {
    return (
      other.url === this.url &&
      other.alt === this.alt &&
      other.width === this.width &&
      other.height === this.height
    );
  }

  override toDOM(view: EditorView): HTMLElement {
    const image = document.createElement('img');
    image.className = 'cm-embed-image';
    image.src = this.url;
    image.alt = this.alt;
    if (this.width) image.width = this.width;
    if (this.height) image.height = this.height;
    // The line's height changes once the picture is known.
    image.addEventListener('load', () => view.requestMeasure());
    return image;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}
