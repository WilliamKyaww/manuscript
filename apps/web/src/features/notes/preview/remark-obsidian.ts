import { fileUrl } from '@skb/core';
import GithubSlugger from 'github-slugger';
import type { Blockquote, Link, Paragraph, PhrasingContent, Root, RootContent, Text } from 'mdast';
import { findAndReplace } from 'mdast-util-find-and-replace';
import { SKIP, visit } from 'unist-util-visit';

/**
 * Obsidian's Markdown extensions as a remark plugin (knowledge-system.md §2, task 3.15): wikilinks,
 * embeds, tags, `==highlights==` and callouts, plus resolution of relative Markdown links and images
 * to notes and vault files. Links resolve with the same resolver the server uses.
 *
 * Everything is expressed as standard mdast nodes with `data.hName`/`hProperties`, so the output
 * still passes through rehype-sanitize like any other Markdown.
 */

export type PreviewTarget =
  | { kind: 'note'; id: string; path: string }
  | { kind: 'attachment'; path: string; mediaType: string }
  | { kind: 'unresolved' };

export interface ObsidianOptions {
  resolve(target: string): PreviewTarget;
}

const WIKILINK = /(!?)\[\[([^[\]\n]+?)\]\]/g;
const HIGHLIGHT = /==(?=\S)([^=\n]*?\S)==/g;
const TAG = /(?<=^|[\s([{,;:!?"'])#([\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)/gu;
const CALLOUT = /^\[!([A-Za-z][\w-]*)\]([+-])?[ \t]*/;
const IMAGE_SIZE = /^(\d+)(?:x(\d+))?$/;
const EXTERNAL = /^[a-z][a-z0-9+.-]*:|^\/\//i;

export function headingSlug(heading: string): string {
  return new GithubSlugger().slug(heading);
}

interface WikilinkParts {
  target: string;
  heading: string | null;
  blockRef: string | null;
  alias: string | null;
}

export function parseWikilink(inner: string): WikilinkParts {
  const pipe = inner.indexOf('|');
  const linkPart = (pipe === -1 ? inner : inner.slice(0, pipe)).replace(/\\$/, '');
  const alias = pipe === -1 ? null : inner.slice(pipe + 1).trim() || null;
  const hash = linkPart.indexOf('#');
  const target = (hash === -1 ? linkPart : linkPart.slice(0, hash)).trim();
  const fragment = hash === -1 ? '' : linkPart.slice(hash + 1).trim();
  return {
    target,
    heading: fragment && !fragment.startsWith('^') ? fragment : null,
    blockRef: fragment.startsWith('^') ? fragment.slice(1) || null : null,
    alias,
  };
}

function text(value: string): Text {
  return { type: 'text', value };
}

function noteHref(id: string, heading: string | null): string {
  return `/notes/${encodeURIComponent(id)}${heading ? `#${headingSlug(heading)}` : ''}`;
}

function wikilink(parts: WikilinkParts, options: ObsidianOptions): PhrasingContent {
  const { target, heading, alias } = parts;
  const label =
    alias ?? (target === '' ? (heading ?? '') : heading ? `${target} › ${heading}` : target);
  if (target === '') {
    return {
      type: 'link',
      url: heading ? `#${headingSlug(heading)}` : '#',
      children: [text(label)],
      data: { hProperties: { className: ['wikilink'] } },
    };
  }
  const resolved = options.resolve(target);
  if (resolved.kind === 'note') {
    return {
      type: 'link',
      url: noteHref(resolved.id, heading),
      children: [text(label)],
      data: { hProperties: { className: ['wikilink'], dataNoteId: resolved.id } },
    };
  }
  if (resolved.kind === 'attachment') {
    return {
      type: 'link',
      url: fileUrl(resolved.path),
      children: [text(label)],
      data: { hProperties: { className: ['wikilink', 'wikilink-file'], dataFile: 'true' } },
    };
  }
  return {
    type: 'link',
    url: '#',
    title: `“${target}” does not exist yet`,
    children: [text(label)],
    data: {
      hProperties: { className: ['wikilink', 'wikilink-unresolved'], dataUnresolved: target },
    },
  };
}

/** An embed placeholder; the preview component renders the real thing (note, PDF, audio, video). */
function embed(parts: WikilinkParts, options: ObsidianOptions): PhrasingContent {
  const { target, heading, alias } = parts;
  const resolved = target === '' ? ({ kind: 'unresolved' } as const) : options.resolve(target);
  if (resolved.kind === 'attachment' && resolved.mediaType.startsWith('image/')) {
    const size = alias ? IMAGE_SIZE.exec(alias) : null;
    return {
      type: 'image',
      url: fileUrl(resolved.path),
      alt: size ? target : (alias ?? target),
      data: size
        ? { hProperties: { width: size[1], ...(size[2] ? { height: size[2] } : {}) } }
        : undefined,
    };
  }
  const properties: Record<string, string> = { className: 'embed' };
  if (resolved.kind === 'note') {
    properties.dataEmbed = 'note';
    properties.dataEmbedId = resolved.id;
    if (heading) properties.dataEmbedHeading = heading;
  } else if (resolved.kind === 'attachment') {
    properties.dataEmbed = 'file';
    properties.dataEmbedPath = resolved.path;
    properties.dataEmbedMediaType = resolved.mediaType;
    if (heading) properties.dataEmbedFragment = heading;
  } else {
    properties.dataEmbed = 'missing';
    properties.dataEmbedTarget = target;
  }
  // A link-shaped node (valid phrasing content) renamed to a span; the preview replaces it.
  return {
    type: 'link',
    url: '#',
    children: [text(alias ?? target)],
    data: { hName: 'span', hProperties: properties },
  };
}

function isEmbed(node: RootContent | PhrasingContent): boolean {
  return (
    node.type === 'link' &&
    node.data?.hName === 'span' &&
    Boolean(node.data?.hProperties?.dataEmbed)
  );
}

/** `[!type]` callouts: blockquotes become boxes (or <details> when foldable with + or -). */
function transformCallout(node: Blockquote): void {
  const first = node.children[0];
  if (first?.type !== 'paragraph') return;
  const head = first.children[0];
  if (head?.type !== 'text') return;
  const match = CALLOUT.exec(head.value);
  if (!match?.[1]) return;
  const type = match[1].toLowerCase();
  const fold = match[2];
  head.value = head.value.slice(match[0].length);

  // The title is the rest of the first line; the remainder of the paragraph is the body.
  const title: PhrasingContent[] = [];
  const rest: PhrasingContent[] = [];
  let inTitle = true;
  for (const child of first.children) {
    if (!inTitle) {
      rest.push(child);
    } else if (child.type === 'text' && child.value.includes('\n')) {
      const newline = child.value.indexOf('\n');
      if (newline > 0) title.push(text(child.value.slice(0, newline)));
      const after = child.value.slice(newline + 1);
      if (after) rest.push(text(after));
      inTitle = false;
    } else {
      title.push(child);
    }
  }
  const hasTitle = title.some((child) => child.type !== 'text' || child.value.trim() !== '');
  const titleNode: Paragraph = {
    type: 'paragraph',
    children: hasTitle ? title : [text(type.charAt(0).toUpperCase() + type.slice(1))],
    data: { hName: fold ? 'summary' : 'div', hProperties: { className: ['callout-title'] } },
  };
  const body: RootContent[] = [];
  if (rest.some((child) => child.type !== 'text' || child.value.trim() !== '')) {
    body.push({ type: 'paragraph', children: rest });
  }
  body.push(...node.children.slice(1));
  node.children = [
    titleNode,
    {
      type: 'blockquote',
      children: body as Blockquote['children'],
      data: { hName: 'div', hProperties: { className: ['callout-content'] } },
    },
  ];
  node.data = {
    hName: fold ? 'details' : 'div',
    hProperties: {
      className: ['callout', `callout-${type}`],
      dataCallout: type,
      ...(fold === '+' ? { open: true } : {}),
    },
  };
}

function resolveRelative(
  node: Link | { type: 'image'; url: string; data?: Link['data'] },
  options: ObsidianOptions,
): void {
  if (
    node.data?.hProperties?.className ||
    EXTERNAL.test(node.url) ||
    node.url.startsWith('#') ||
    node.url.startsWith('/')
  )
    return;
  let decoded = node.url;
  try {
    decoded = decodeURI(node.url);
  } catch {
    // Keep the URL as written.
  }
  const hash = decoded.indexOf('#');
  const target = hash === -1 ? decoded : decoded.slice(0, hash);
  const fragment = hash === -1 ? null : decoded.slice(hash + 1);
  if (target === '') return;
  const resolved = options.resolve(target);
  if (resolved.kind === 'note') {
    node.url = noteHref(resolved.id, fragment);
    node.data = {
      ...node.data,
      hProperties: {
        ...node.data?.hProperties,
        className: ['internal-link'],
        dataNoteId: resolved.id,
      },
    };
  } else if (resolved.kind === 'attachment') {
    node.url = fileUrl(resolved.path);
  } else if (node.type === 'link') {
    node.url = '#';
    node.data = {
      ...node.data,
      hProperties: { className: ['wikilink-unresolved'], dataUnresolved: target },
    };
  }
}

export function remarkObsidian(options: ObsidianOptions) {
  return (tree: Root) => {
    visit(tree, 'blockquote', (node) => {
      transformCallout(node);
    });
    visit(tree, (node) => {
      if (node.type === 'link' || node.type === 'image') resolveRelative(node, options);
    });
    findAndReplace(
      tree,
      [
        [
          WIKILINK,
          (_: string, bang: string, inner: string) => {
            const parts = parseWikilink(inner);
            return bang ? embed(parts, options) : wikilink(parts, options);
          },
        ],
        [
          HIGHLIGHT,
          (_: string, value: string) => ({
            type: 'emphasis',
            children: [text(value)],
            data: { hName: 'mark' },
          }),
        ],
        [
          TAG,
          (match: string, tag: string) => ({
            type: 'emphasis',
            children: [text(match)],
            data: {
              hName: 'span',
              hProperties: { className: ['tag'], dataTag: tag.toLowerCase() },
            },
          }),
        ],
      ],
      { ignore: ['link', 'linkReference', 'inlineCode', 'code', 'inlineMath', 'math'] },
    );
    // An embed alone in its paragraph is a block: render it as one.
    visit(tree, 'paragraph', (node, index, parent) => {
      const meaningful = node.children.filter(
        (child) => child.type !== 'text' || child.value.trim() !== '',
      );
      if (
        meaningful.length !== 1 ||
        !meaningful[0] ||
        !isEmbed(meaningful[0]) ||
        index === undefined ||
        !parent
      )
        return;
      const only = meaningful[0];
      if (only.type === 'link' && only.data) only.data.hName = 'div';
      node.data = { hName: 'div', hProperties: { className: ['embed-block'] } };
      return SKIP;
    });
  };
}
