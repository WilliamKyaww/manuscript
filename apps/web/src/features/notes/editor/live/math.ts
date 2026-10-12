import 'katex/dist/katex.min.css';
import { WidgetType } from '@codemirror/view';

/**
 * Maths in live preview (Phase 25): `$x^2$` and `$$ … $$` drawn with KaTeX while the cursor is away.
 * KaTeX is loaded the first time a formula is drawn, so notes without maths never pay for it; until it
 * arrives the formula shows as its source.
 */

type Katex = typeof import('katex').default;
let loading: Promise<Katex> | null = null;

function loadKatex(): Promise<Katex> {
  loading ??= import('katex').then((module) => module.default);
  return loading;
}

export class MathWidget extends WidgetType {
  constructor(
    readonly tex: string,
    readonly display: boolean,
  ) {
    super();
  }

  override eq(other: MathWidget): boolean {
    return other.tex === this.tex && other.display === this.display;
  }

  override toDOM(): HTMLElement {
    const element = document.createElement(this.display ? 'div' : 'span');
    element.className = this.display ? 'cm-math cm-math-display' : 'cm-math cm-math-inline';
    element.textContent = this.display ? `$$${this.tex}$$` : `$${this.tex}$`;
    element.dataset.pending = 'true';
    void loadKatex()
      .then((katex) => {
        try {
          katex.render(this.tex, element, {
            displayMode: this.display,
            throwOnError: false,
            output: 'htmlAndMathml',
          });
          delete element.dataset.pending;
        } catch {
          // The source stays: a formula KaTeX cannot read is shown as it was written.
        }
      })
      .catch(() => undefined);
    return element;
  }

  override get estimatedHeight(): number {
    return this.display ? 48 : -1;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}
