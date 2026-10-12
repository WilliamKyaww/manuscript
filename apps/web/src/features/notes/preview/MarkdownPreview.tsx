import 'katex/dist/katex.min.css';
import './callout-icons.css';
import './preview.css';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import type { Element, ElementContent } from 'hast';
import { FilePlus, Lightbulb } from 'lucide-react';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import Markdown, { type Components, type Options as MarkdownOptions } from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/DropdownMenu';
import { useApi } from '../../../lib/api/context';
import { cn } from '../../../lib/cn';
import { noteQuery } from '../api';
import { useNotesUi } from '../notes-store';
import { FileEmbed } from './FileEmbed';
import { MermaidDiagram } from './MermaidDiagram';
import { prepareMarkdown } from './prepare';
import { rehypeHeadingIds, sanitizeSchema } from './rehype-plugins';
import { type PreviewTarget, remarkObsidian, remarkSoftBreaks } from './remark-obsidian';
import { sectionOf } from './section';

/**
 * Read view of a note (task 3.15): GFM, KaTeX maths, highlighted code, Mermaid diagrams (loaded
 * lazily), wikilinks, embeds, callouts, highlights and tags. Raw HTML is allowed but sanitised.
 */

export interface MarkdownPreviewProps {
  content: string;
  /** Resolves a link target as written in this note. */
  resolve(target: string): PreviewTarget;
  noteId: string;
  /** Offered for links to notes that do not exist yet. */
  onCreateNote?(title: string): void;
  /** Offered beside "Create note" for unresolved links (Phase 6). */
  onCreateConcept?(name: string): void;
  className?: string;
  /** Nesting level of embedded notes (they stop at three levels). */
  depth?: number;
}

interface PreviewContextValue {
  resolve(target: string): PreviewTarget;
  noteId: string;
  onCreateNote?(title: string): void;
  onCreateConcept?(name: string): void;
  depth: number;
  /** Notes already being shown in this chain of embeds (to stop loops). */
  chain: readonly string[];
}

const PreviewContext = createContext<PreviewContextValue | null>(null);
const MAX_EMBED_DEPTH = 3;

type PluginList = NonNullable<MarkdownOptions['rehypePlugins']>;

const REHYPE_PLUGINS: PluginList = [
  rehypeRaw,
  [rehypeSanitize, sanitizeSchema],
  rehypeKatex,
  [rehypeHighlight, { detect: false, plainText: ['mermaid', 'text', 'txt'] }],
  rehypeHeadingIds,
];

function hastText(node: ElementContent | Element): string {
  if (node.type === 'text') return node.value;
  if (node.type === 'element') return node.children.map(hastText).join('');
  return '';
}

function attribute(props: Record<string, unknown>, name: string): string | null {
  const value = props[name];
  return typeof value === 'string' && value !== '' ? value : null;
}

function PreviewLink({
  href,
  children,
  ...props
}: { href?: string; children?: ReactNode } & Record<string, unknown>) {
  const context = useContext(PreviewContext);
  const navigate = useNavigate();
  const className = typeof props.className === 'string' ? props.className : undefined;
  const noteId = attribute(props, 'data-note-id');
  const conceptId = attribute(props, 'data-concept-id');
  const unresolved = attribute(props, 'data-unresolved');
  if (noteId) {
    const hash = href?.includes('#') ? href.slice(href.indexOf('#') + 1) : undefined;
    return (
      <Link to="/notes/$noteId" params={{ noteId }} hash={hash} className={className}>
        {children}
      </Link>
    );
  }
  if (conceptId) {
    return (
      <Link to="/concepts/$conceptId" params={{ conceptId }} className={className}>
        {children}
      </Link>
    );
  }
  if (unresolved) {
    // Not a link to anywhere yet: an action that creates the note (or, where offered, a concept).
    const label = `“${unresolved}” does not exist yet — select to create it`;
    if (!context?.onCreateConcept) {
      return (
        <button
          type="button"
          className={className}
          title={label}
          onClick={() => context?.onCreateNote?.(unresolved)}
        >
          {children}
        </button>
      );
    }
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={className} title={label}>
            {children}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            icon={<FilePlus size={14} />}
            onSelect={() => context.onCreateNote?.(unresolved)}
          >
            Create note “{unresolved}”
          </DropdownMenuItem>
          <DropdownMenuItem
            icon={<Lightbulb size={14} />}
            onSelect={() => context.onCreateConcept?.(unresolved)}
          >
            Create concept “{unresolved}”
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
  if (href?.startsWith('#')) {
    return (
      <a
        href={href}
        className={className}
        onClick={(event) => {
          event.preventDefault();
          const target = event.currentTarget
            .closest('.markdown-body')
            ?.querySelector(`[id="${CSS.escape(href.slice(1))}"]`);
          target?.scrollIntoView({ block: 'start' });
          if (!target && href.length > 1) void navigate({ to: '.', hash: href.slice(1) });
        }}
      >
        {children}
      </a>
    );
  }
  const external = /^https?:/i.test(href ?? '') || attribute(props, 'data-file') !== null;
  return (
    <a
      href={href}
      className={className}
      title={attribute(props, 'title') ?? undefined}
      {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
    >
      {children}
    </a>
  );
}

function PreviewImage({
  src,
  alt,
  width,
  height,
}: {
  src?: string;
  alt?: string;
  width?: string | number;
  height?: string | number;
}) {
  if (src && /^https?:/i.test(src)) {
    // The content security policy only allows images from the app itself (no tracking pixels).
    return (
      <span className="external-image">
        External image not loaded:{' '}
        <a href={src} target="_blank" rel="noreferrer noopener">
          {alt || src}
        </a>
      </span>
    );
  }
  return <img src={src} alt={alt ?? ''} width={width} height={height} loading="lazy" />;
}

function NoteEmbed({ id, heading }: { id: string; heading: string | null }) {
  const api = useApi();
  const context = useContext(PreviewContext);
  const query = useQuery(noteQuery(api, id));
  if (!context) return null;
  if (context.chain.includes(id) || context.depth >= MAX_EMBED_DEPTH) {
    return (
      <p className="embed-note-limit">
        This note is already shown above, so it is not embedded again.
      </p>
    );
  }
  if (query.isPending) return <p className="embed-note-loading">Loading embedded note…</p>;
  if (query.isError) return <p className="embed-missing">The embedded note could not be loaded.</p>;
  const note = query.data;
  const section = sectionOf(note.content, heading);
  return (
    <div className="embed-note">
      <div className="embed-note-title">
        <Link to="/notes/$noteId" params={{ noteId: note.id }}>
          {note.title}
          {heading ? ` › ${heading}` : ''}
        </Link>
      </div>
      {section === null ? (
        <p className="embed-missing">There is no heading “{heading}” in this note.</p>
      ) : (
        <PreviewContext.Provider
          value={{ ...context, depth: context.depth + 1, chain: [...context.chain, id] }}
        >
          <PreviewBody content={section} resolve={context.resolve} />
        </PreviewContext.Provider>
      )}
    </div>
  );
}

function EmbedPlaceholder(props: Record<string, unknown> & { children?: ReactNode }) {
  const kind = attribute(props, 'data-embed');
  if (kind === 'note') {
    const id = attribute(props, 'data-embed-id');
    return id ? <NoteEmbed id={id} heading={attribute(props, 'data-embed-heading')} /> : null;
  }
  if (kind === 'file') {
    const path = attribute(props, 'data-embed-path');
    return path ? (
      <FileEmbed
        path={path}
        mediaType={attribute(props, 'data-embed-media-type') ?? 'application/octet-stream'}
        fragment={attribute(props, 'data-embed-fragment')}
      />
    ) : null;
  }
  return (
    <span className="embed-missing">
      Embedded file “{attribute(props, 'data-embed-target')}” not found
    </span>
  );
}

const COMPONENTS: Components = {
  a: ({ node: _node, ...props }) => <PreviewLink {...props} />,
  img: ({ node: _node, ...props }) => <PreviewImage {...props} />,
  span: ({ node: _node, ...props }) =>
    attribute(props, 'data-embed') ? <EmbedPlaceholder {...props} /> : <span {...props} />,
  div: ({ node: _node, ...props }) =>
    attribute(props, 'data-embed') ? <EmbedPlaceholder {...props} /> : <div {...props} />,
  pre: ({ node, children, ...props }) => {
    const code = node?.children.find(
      (child): child is Element => child.type === 'element' && child.tagName === 'code',
    );
    const classes = code?.properties.className;
    if (Array.isArray(classes) && classes.includes('language-mermaid') && code) {
      return <MermaidDiagram source={hastText(code).replace(/\n$/, '')} />;
    }
    return <pre {...props}>{children}</pre>;
  },
  table: ({ node: _node, ...props }) => (
    <div className="table-wrapper">
      <table {...props} />
    </div>
  ),
};

function PreviewBody({
  content,
  resolve,
}: {
  content: string;
  resolve(target: string): PreviewTarget;
}) {
  const source = useMemo(() => prepareMarkdown(content), [content]);
  const strict = useNotesUi((state) => state.strictLineBreaks);
  const remarkPlugins = useMemo<PluginList>(
    () => [
      remarkFrontmatter,
      remarkGfm,
      remarkMath,
      [remarkObsidian, { resolve }],
      ...(strict ? [] : [remarkSoftBreaks]),
    ],
    [resolve, strict],
  );
  return (
    <Markdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={REHYPE_PLUGINS}
      remarkRehypeOptions={{ allowDangerousHtml: true }}
      components={COMPONENTS}
    >
      {source}
    </Markdown>
  );
}

export function MarkdownPreview({
  content,
  resolve,
  noteId,
  onCreateNote,
  onCreateConcept,
  className,
  depth = 0,
}: MarkdownPreviewProps) {
  const value = useMemo<PreviewContextValue>(
    () => ({ resolve, noteId, onCreateNote, onCreateConcept, depth, chain: [noteId] }),
    [resolve, noteId, onCreateNote, onCreateConcept, depth],
  );
  return (
    <PreviewContext.Provider value={value}>
      <div className={cn('markdown-body', className)}>
        <PreviewBody content={content} resolve={resolve} />
      </div>
    </PreviewContext.Provider>
  );
}
