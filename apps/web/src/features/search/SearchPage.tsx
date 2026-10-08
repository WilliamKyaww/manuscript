import {
  FILTER_KEYS,
  type FilterKey,
  parseSearchQuery,
  RESULT_KINDS,
  type SearchResult,
  withFilter,
  withoutFilter,
} from '@skb/core';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { FileText, Search, X } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Highlighted } from '../../components/Highlighted';
import { Page } from '../../components/Page';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { KIND_LABELS, viewerSearchFor } from '../library/links';
import { SourceIcon } from '../library/SourceRow';
import { tagsQuery, treeQuery } from '../notes/api';
import { searchQuery } from './api';
import { SEARCH_INPUT_ID } from './search-ids';

/**
 * Full-text search (task 4.07). The query lives in the address (`/search?q=…`); typing updates it
 * after a short pause. Filters can be typed (`tag:exam`) or picked from the menus, and are shown as
 * removable chips. A note opens at its first matching line; a source passage opens its page, slide or
 * section in the viewer.
 */

const TYPING_DELAY_MS = 200;

const FILTER_LABELS: Record<FilterKey, string> = {
  tag: 'Tag',
  type: 'Type',
  folder: 'Folder',
  module: 'Module',
  kind: 'Kind',
};

const selectClasses =
  'h-8 rounded-md border border-border-strong bg-surface px-2 text-sm text-text hover:bg-surface-hover';

export function SearchPage() {
  const api = useApi();
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const urlQuery = typeof search.q === 'string' ? search.q : '';
  const [input, setInput] = useState(urlQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const ids = { tag: useId(), type: useId(), folder: useId(), kind: useId() };

  // The address follows the input after a pause; the input follows the address only for changes
  // made elsewhere (back/forward, the command palette) — never for the echo of our own update,
  // which would drop anything typed in between.
  const pushed = useRef<string | null>(null);
  useEffect(() => {
    if (urlQuery === pushed.current) return;
    pushed.current = null;
    setInput(urlQuery);
  }, [urlQuery]);
  const push = useCallback(
    (next: string) => {
      pushed.current = next.trim() ? next : '';
      void navigate({ to: '/search', search: next.trim() ? { q: next } : {}, replace: true });
    },
    [navigate],
  );
  useEffect(() => {
    if (input === urlQuery) return;
    const timer = setTimeout(() => push(input), TYPING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [input, urlQuery, push]);

  // Opening the page (directly or by Ctrl+Shift+F) is for typing a search.
  useEffect(() => inputRef.current?.focus(), []);

  const parsed = useMemo(() => parseSearchQuery(urlQuery), [urlQuery]);
  const results = useInfiniteQuery({ ...searchQuery(api, urlQuery), enabled: !parsed.empty });
  const tags = useQuery(tagsQuery(api));
  const tree = useQuery(treeQuery(api));
  const types = useMemo(
    () =>
      [
        ...new Set(
          (tree.data?.notes ?? [])
            .map((note) => note.type)
            .filter((type): type is string => Boolean(type)),
        ),
      ].sort(),
    [tree.data],
  );

  const setQuery = (next: string) => {
    setInput(next);
    push(next);
    inputRef.current?.focus();
  };

  const pages = results.data?.pages ?? [];
  const first = pages[0];
  const items = pages.flatMap((page) => page.results);
  const chips = FILTER_KEYS.flatMap((key) => [
    ...parsed.filters[key].map((value) => ({ key, value, negated: false })),
    ...parsed.excludedFilters[key].map((value) => ({ key, value, negated: true })),
  ]);

  return (
    <Page
      title="Search"
      width="wide"
      toolbar={
        <div className="space-y-2 pb-3">
          <search>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setQuery(input);
              }}
              className="flex items-center gap-2"
            >
              <div className="relative min-w-0 flex-1">
                <Search
                  aria-hidden="true"
                  size={16}
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
                />
                <input
                  ref={inputRef}
                  id={SEARCH_INPUT_ID}
                  type="search"
                  aria-label="Search notes and sources"
                  placeholder='Search notes and sources — try "leader election" tag:exam -draft'
                  autoComplete="off"
                  spellCheck={false}
                  data-autofocus
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  className="h-10 w-full rounded-md border border-border-strong bg-surface pr-3 pl-9 text-sm text-text placeholder:text-subtle"
                />
              </div>
            </form>
          </search>
          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect
              id={ids.tag}
              label="Tag"
              values={(tags.data?.tags ?? []).map((tag) => tag.tag)}
              onPick={(value) => setQuery(withFilter(input, 'tag', value))}
            />
            <FilterSelect
              id={ids.type}
              label="Type"
              values={types}
              onPick={(value) => setQuery(withFilter(input, 'type', value))}
            />
            <FilterSelect
              id={ids.folder}
              label="Folder"
              values={tree.data?.folders ?? []}
              onPick={(value) => setQuery(withFilter(input, 'folder', value))}
            />
            <FilterSelect
              id={ids.kind}
              label="Kind"
              values={RESULT_KINDS}
              onPick={(value) => setQuery(withFilter(input, 'kind', value))}
            />
            {chips.map((chip) => (
              <span
                key={`${chip.negated ? '-' : ''}${chip.key}:${chip.value}`}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-sunken py-0.5 pr-1 pl-2.5 text-xs"
              >
                {chip.negated ? 'not ' : ''}
                {FILTER_LABELS[chip.key].toLowerCase()}:{' '}
                <strong className="font-medium">{chip.value}</strong>
                <button
                  type="button"
                  aria-label={`Remove the ${FILTER_LABELS[chip.key].toLowerCase()} filter ${chip.value}`}
                  onClick={() => setQuery(withoutFilter(input, chip.key, chip.value))}
                  className="rounded-full p-0.5 text-muted hover:bg-surface-hover hover:text-text"
                >
                  <X aria-hidden="true" size={12} />
                </button>
              </span>
            ))}
          </div>
        </div>
      }
    >
      {parsed.empty && <SyntaxHelp />}
      {!parsed.empty && results.isPending && <LoadingState label="Searching" />}
      {!parsed.empty && results.isError && (
        <ErrorState message={results.error.message} onRetry={() => void results.refetch()} />
      )}
      {!parsed.empty && first && (
        <>
          <p role="status" className="mb-4 text-sm text-muted">
            {first.total === 0
              ? 'Nothing matches.'
              : `${first.total}${first.totalCapped ? '+' : ''} ${first.total === 1 && !first.totalCapped ? 'result' : 'results'} · ${first.tookMs} ms`}
          </p>
          {first.total === 0 && (
            <EmptyState
              icon={<Search size={20} />}
              title="Nothing found"
              description="Try fewer or shorter words — every word must appear — or remove a filter."
            />
          )}
          <ol aria-label="Search results" className="space-y-2">
            {items.map((result) => (
              <li key={resultKey(result)}>
                <ResultLink result={result} />
              </li>
            ))}
          </ol>
          {results.hasNextPage && (
            <div className="mt-4 flex justify-center">
              <Button
                onClick={() => void results.fetchNextPage()}
                loading={results.isFetchingNextPage}
              >
                Show more results
              </Button>
            </div>
          )}
        </>
      )}
    </Page>
  );
}

const resultKey = (result: SearchResult) =>
  result.kind === 'note' ? result.note.id : `${result.source.id}:${result.section.ordinal}`;

const resultClasses =
  'block rounded-lg border border-border bg-surface p-3 hover:border-border-strong hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus';

/** A note opens at its first matching line; a source passage at its page, slide or section. */
function ResultLink({ result }: { result: SearchResult }) {
  const snippet = result.snippet.length > 0 && (
    <Highlighted parts={result.snippet} className="mt-1.5 line-clamp-2 block text-sm text-muted" />
  );
  if (result.kind === 'note') {
    return (
      <Link
        to="/notes/$noteId"
        params={{ noteId: result.note.id }}
        search={result.line ? { line: result.line } : {}}
        className={resultClasses}
      >
        <span className="flex items-center gap-2">
          <FileText aria-hidden="true" size={15} className="shrink-0 text-muted" />
          <Highlighted parts={result.title} className="truncate font-medium" />
          {result.note.type && <Badge>{result.note.type}</Badge>}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted">{result.note.path}</span>
        {snippet}
      </Link>
    );
  }
  return (
    <Link
      to="/library/$sourceId"
      params={{ sourceId: result.source.id }}
      search={viewerSearchFor(result.locator, result.section.ordinal)}
      className={resultClasses}
    >
      <span className="flex items-center gap-2">
        <span aria-hidden="true" className="flex shrink-0 text-muted [&_svg]:size-[15px]">
          <SourceIcon kind={result.source.kind} />
        </span>
        <Highlighted parts={result.title} className="truncate font-medium" />
        <Badge tone="info">{KIND_LABELS[result.source.kind]}</Badge>
      </span>
      <span className="mt-0.5 block truncate text-xs text-muted">
        {result.section.label} · {result.source.path}
      </span>
      {snippet}
    </Link>
  );
}

function FilterSelect({
  id,
  label,
  values,
  onPick,
}: {
  id: string;
  label: string;
  values: readonly string[];
  onPick(value: string): void;
}) {
  return (
    <>
      <label htmlFor={id} className="sr-only">
        Add a {label.toLowerCase()} filter
      </label>
      <select
        id={id}
        className={selectClasses}
        value=""
        disabled={values.length === 0}
        onChange={(event) => event.target.value && onPick(event.target.value)}
      >
        <option value="">{label}…</option>
        {values.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    </>
  );
}

const SYNTAX: [string, string][] = [
  [
    'leader election',
    'notes and sources containing both words (and longer words starting with them)',
  ],
  ['"leader election"', 'the exact phrase'],
  ['paxos OR raft', 'either word'],
  ['-draft', 'leave out notes (and source passages) containing a word'],
  ['tag:exam or #exam', 'notes with a tag (and its sub-tags, such as exam/week-3)'],
  ['type:summary', 'notes of a type'],
  ['folder:"Week 1"', 'notes in a folder and its sub-folders'],
  ['module:COC251', 'notes and sources for a module'],
  ['kind:pdf', 'one kind of result: note, source, pdf, slides, docx or text'],
  ['-tag:draft', 'any filter can be turned round with a minus'],
];

function SyntaxHelp() {
  return (
    <div className="max-w-2xl">
      <h2 className="mb-2 text-sm font-semibold">How to search</h2>
      <p className="mb-3 text-sm text-muted">
        Titles count most, then headings, tags and text. Case and accents are ignored. Press{' '}
        <kbd>Ctrl</kbd>+<kbd>O</kbd> to jump to a note by name instead.
      </p>
      <table className="w-full text-sm">
        <tbody>
          {SYNTAX.map(([example, meaning]) => (
            <tr key={example} className="border-t border-border">
              <td className="py-1.5 pr-4 font-mono text-xs whitespace-nowrap">{example}</td>
              <td className="py-1.5 text-muted">{meaning}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
