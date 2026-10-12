import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';
import { externalUrl } from '../links/external';

/**
 * Links in the editor's text (Phase 26): `[words](address)`, `<address>` and a bare address, found
 * from the Markdown syntax tree. `[[wikilinks]]` are not these (they have no address).
 */

export interface EditorLink {
  kind: 'markdown' | 'autolink' | 'bare';
  /** The whole link, marks included. */
  from: number;
  to: number;
  /** The address as written. */
  url: string;
  /** The address as a web link (http or https), or null for a link to a file or note. */
  href: string | null;
  /** Where the address is written (what "Edit" selects). */
  address: { from: number; to: number };
  /** The link's words, for `[words](address)`. */
  text: { from: number; to: number } | null;
}

function fromNode(state: EditorState, node: SyntaxNode): EditorLink | null {
  if (node.name === 'Link') {
    const url = node.getChild('URL');
    const [open, close] = node.getChildren('LinkMark');
    if (!url) return null;
    const address = state.sliceDoc(url.from, url.to);
    return {
      kind: 'markdown',
      from: node.from,
      to: node.to,
      url: address,
      href: externalUrl(address.replace(/^<|>$/gu, '')),
      address: { from: url.from, to: url.to },
      text: open && close ? { from: open.to, to: close.from } : null,
    };
  }
  if (node.name === 'Autolink') {
    const url = node.getChild('URL');
    if (!url) return null;
    const address = state.sliceDoc(url.from, url.to);
    return {
      kind: 'autolink',
      from: node.from,
      to: node.to,
      url: address,
      href: externalUrl(address),
      address: { from: url.from, to: url.to },
      text: null,
    };
  }
  if (node.name === 'URL' && node.parent?.name !== 'Link' && node.parent?.name !== 'Autolink') {
    const address = state.sliceDoc(node.from, node.to);
    return {
      kind: 'bare',
      from: node.from,
      to: node.to,
      url: address,
      href: externalUrl(address),
      address: { from: node.from, to: node.to },
      text: null,
    };
  }
  return null;
}

/** The link at a position of the document, if there is one. */
export function linkAt(state: EditorState, position: number): EditorLink | null {
  const tree = syntaxTree(state);
  for (const side of [1, -1] as const) {
    for (
      let node: SyntaxNode | null = tree.resolveInner(position, side);
      node;
      node = node.parent
    ) {
      if (node.name === 'Link' || node.name === 'Autolink' || node.name === 'URL') {
        const link = fromNode(state, node.name === 'URL' && node.parent ? node.parent : node);
        const found = link ?? fromNode(state, node);
        if (found && found.from <= position && position <= found.to) return found;
      }
    }
  }
  return null;
}
