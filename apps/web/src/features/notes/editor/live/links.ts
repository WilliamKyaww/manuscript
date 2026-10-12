import type { EditorState } from '@codemirror/state';
import { Decoration, WidgetType } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import '../../links/links.css';
import { githubLabel, parseGitHubUrl } from '../../links/github';
import { githubMarkSvg } from '../../links/github-mark';
import { linkAt } from '../links';
import type { Item } from './lines';

/**
 * Web links in live preview (Phase 26): `[words](address)` is drawn as its words, `<address>` and a
 * bare address as the address, each followed by the external-link mark; a link to GitHub becomes a
 * mention (the mark and a short name), or keeps its words with the mark before them. A drawn link
 * carries its address (`data-href`), which is what a click on it opens. Move the cursor into a link
 * and its source comes back, as for every other element.
 */

class ExternalMarkWidget extends WidgetType {
  constructor(readonly href: string) {
    super();
  }
  override eq(other: ExternalMarkWidget): boolean {
    return other.href === this.href;
  }
  override toDOM(): HTMLElement {
    const mark = document.createElement('span');
    mark.className = 'cm-link-external-mark';
    mark.dataset.href = this.href;
    mark.setAttribute('aria-hidden', 'true');
    return mark;
  }
  override ignoreEvent(): boolean {
    return false;
  }
}

class GitHubMarkWidget extends WidgetType {
  constructor(readonly href: string) {
    super();
  }
  override eq(other: GitHubMarkWidget): boolean {
    return other.href === this.href;
  }
  override toDOM(): HTMLElement {
    const mark = document.createElement('span');
    mark.className = 'cm-github-mark';
    mark.dataset.href = this.href;
    // A constant drawing of GitHub's mark, never note content.
    mark.innerHTML = githubMarkSvg(14);
    return mark;
  }
  override ignoreEvent(): boolean {
    return false;
  }
}

class GitHubChipWidget extends WidgetType {
  constructor(
    readonly href: string,
    readonly label: string,
    readonly title: string,
  ) {
    super();
  }
  override eq(other: GitHubChipWidget): boolean {
    return other.href === this.href && other.label === this.label;
  }
  override toDOM(): HTMLElement {
    const chip = document.createElement('span');
    chip.className = 'cm-github-chip';
    chip.dataset.href = this.href;
    chip.title = this.title;
    chip.innerHTML = githubMarkSvg(14);
    const label = document.createElement('span');
    label.className = 'cm-github-label';
    label.textContent = this.label;
    chip.append(label);
    return chip;
  }
  override ignoreEvent(): boolean {
    return false;
  }
}

const hidden = Decoration.replace({});
const webText = (href: string, github: boolean) =>
  Decoration.mark({
    class: github ? 'cm-link cm-github-text' : 'cm-link cm-link-web',
    attributes: { 'data-href': href },
  });

/**
 * What live preview draws for the link at `node` (a Link, an Autolink or a bare URL), or nothing
 * while the cursor touches it. Links that are not to the web keep the drawing they had: words only.
 */
export function linkItems(
  state: EditorState,
  node: SyntaxNode,
  touches: (from: number, to: number) => boolean,
): Item[] {
  const link = linkAt(state, node.from + (node.name === 'Link' ? 1 : 0));
  if (!link || link.from !== node.from || link.to !== node.to || touches(link.from, link.to))
    return [];
  const items: Item[] = [];
  const hide = (from: number, to: number) => {
    if (to > from) items.push({ from, to, deco: hidden, hide: true, replace: true });
  };
  const href = link.href;
  const github = href ? parseGitHubUrl(href) : null;
  const words = link.text ? state.sliceDoc(link.text.from, link.text.to) : null;

  if (
    href &&
    github &&
    (link.kind !== 'markdown' || githubLabel(github, words, href) === github.label)
  ) {
    // A link that is only its address: the mention replaces it.
    items.push({
      from: link.from,
      to: link.to,
      deco: Decoration.replace({
        widget: new GitHubChipWidget(href, githubLabel(github, words, href), github.title),
      }),
      replace: true,
    });
    return items;
  }

  if (link.kind === 'markdown' && link.text) {
    // [words](address "title"): the [ before, and everything from ] on, go.
    hide(link.from, link.text.from);
    hide(link.text.to, link.to);
    if (!href) return items;
    if (github)
      items.push({
        from: link.text.from,
        to: link.text.from,
        deco: Decoration.widget({ widget: new GitHubMarkWidget(href), side: -1 }),
      });
    items.push({ from: link.text.from, to: link.text.to, deco: webText(href, Boolean(github)) });
    if (!github)
      items.push({
        from: link.text.to,
        to: link.text.to,
        deco: Decoration.widget({ widget: new ExternalMarkWidget(href), side: 1 }),
      });
    return items;
  }

  if (!href) return items;
  if (link.kind === 'autolink') {
    hide(link.from, link.address.from);
    hide(link.address.to, link.to);
  }
  items.push({ from: link.address.from, to: link.address.to, deco: webText(href, false) });
  items.push({
    from: link.address.to,
    to: link.address.to,
    deco: Decoration.widget({ widget: new ExternalMarkWidget(href), side: 1 }),
  });
  return items;
}
