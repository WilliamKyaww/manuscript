import type { SourceSection, SourceSummary } from '@skb/core';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchServerEvent } from '../../lib/events';
import { type FakeFetch, HEALTH, renderApp, resetUiState } from '../../test/renderApp';
import { validateViewerSearch, viewerSearchFor } from './links';

const sourceId = (value: string) => value as SourceSummary['id'];
const SLIDES = sourceId('src_01J9Z3K4M2Q8R5T7V9X1Y3Z5B1');
const FAILED = sourceId('src_01J9Z3K4M2Q8R5T7V9X1Y3Z5B2');
const REPORT = sourceId('src_01J9Z3K4M2Q8R5T7V9X1Y3Z5B3');
const now = '2026-10-08T12:00:00.000Z';

const source = (overrides: Partial<SourceSummary> & Pick<SourceSummary, 'id'>): SourceSummary => ({
  kind: 'pdf',
  title: 'Untitled',
  path: 'Sources/Inbox/Untitled.pdf',
  originalName: 'Untitled.pdf',
  mediaType: 'application/pdf',
  sizeBytes: 1024,
  sha256: 'a'.repeat(64),
  pageCount: null,
  status: 'ready',
  error: null,
  moduleCode: null,
  sectionCount: 0,
  chunkCount: 0,
  warnings: [],
  missing: false,
  createdAt: now,
  ingestedAt: now,
  job: null,
  ...overrides,
});

const SOURCES: SourceSummary[] = [
  source({
    id: SLIDES,
    kind: 'pptx',
    title: 'Week 3 consensus',
    path: 'Sources/COC251/Week 3 consensus.pptx',
    moduleCode: 'COC251',
    pageCount: 2,
    sizeBytes: 5_452_595,
    status: 'processing',
    job: {
      id: 'job_01J9Z3K4M2Q8R5T7V9X1Y3Z5C1',
      kind: 'source.ingest',
      subject: SLIDES,
      status: 'running',
      progress: 0.25,
      message: 'Extracting text',
      error: null,
      attempts: 1,
      createdAt: now,
      updatedAt: now,
    },
  }),
  source({
    id: FAILED,
    title: 'Scanned handout',
    path: 'Sources/Inbox/Scanned handout.pdf',
    status: 'failed',
    error: 'The PDF is damaged or is not really a PDF.',
  }),
  source({
    id: REPORT,
    kind: 'docx',
    title: 'Coursework brief',
    path: 'Sources/Inbox/Coursework brief.docx',
    warnings: [{ code: 'no-text', message: 'The document contains no text.' }],
  }),
];

const SLIDE_SECTIONS: SourceSection[] = [
  {
    ordinal: 0,
    kind: 'slide',
    label: 'Slide 1',
    headingPath: ['Consensus'],
    locator: { kind: 'slides', sourceId: SLIDES, slide: 1, part: 'body' },
    text: 'Consensus\nWhy replicas agree',
    notes: null,
  },
  {
    ordinal: 1,
    kind: 'slide',
    label: 'Slide 2',
    headingPath: ['Paxos'],
    locator: { kind: 'slides', sourceId: SLIDES, slide: 2, part: 'body' },
    text: 'Paxos\nPrepare\nAccept',
    notes: 'Explain why a majority suffices.',
  },
];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function fakeServer() {
  const calls: { method: string; path: string; body?: BodyInit | null }[] = [];
  const fetch: FakeFetch = async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    calls.push({ method, path: url.pathname, body: init?.body ?? null });
    if (url.pathname === '/api/health') return json(HEALTH);
    if (url.pathname === '/api/tags') return json({ tags: [] });
    if (url.pathname === '/api/notes') {
      return json({
        notes: [],
        folders: [],
        attachments: [],
        index: {
          state: 'ready',
          notes: 0,
          attachments: 0,
          processed: 0,
          total: 0,
          lastScanAt: null,
          lastScanMs: null,
        },
      });
    }
    if (url.pathname === '/api/search') {
      return json({
        query: url.searchParams.get('q') ?? '',
        total: 1,
        totalCapped: false,
        offset: 0,
        limit: 20,
        highlights: ['majority'],
        tookMs: 2,
        results: [
          {
            kind: 'source',
            source: {
              id: FAILED,
              title: 'Scanned handout',
              kind: 'pdf',
              path: 'Sources/Inbox/Scanned handout.pdf',
            },
            section: { ordinal: 1, label: 'p. 2' },
            locator: { kind: 'pdf', sourceId: FAILED, page: 2, charStart: 0, charEnd: 120 },
            title: [{ text: 'Scanned handout › p. 2', match: false }],
            snippet: [
              { text: 'A ', match: false },
              { text: 'majority', match: true },
              { text: ' quorum is required.', match: false },
            ],
          },
        ],
      });
    }
    if (url.pathname === '/api/sources' && method === 'GET') return json({ sources: SOURCES });
    if (url.pathname === '/api/sources' && method === 'POST') {
      const form = init?.body;
      if (!(form instanceof FormData)) throw new Error('Expected a multipart upload.');
      const file = form.get('file') as File;
      return json(
        {
          duplicate: false,
          source: source({
            id: sourceId('src_01J9Z3K4M2Q8R5T7V9X1Y3Z5B9'),
            title: file.name.replace(/\.[^.]+$/, ''),
            status: 'pending',
          }),
        },
        201,
      );
    }
    if (url.pathname === `/api/sources/${FAILED}/retry`)
      return json({ ...SOURCES[1], status: 'pending', error: null });
    if (url.pathname === `/api/sources/${FAILED}` && method === 'DELETE')
      return json({ ok: true, trashId: null });
    if (url.pathname === `/api/sources/${SLIDES}`)
      return json({ ...SOURCES[0], status: 'ready', job: null, metadata: {} });
    if (url.pathname === `/api/sources/${SLIDES}/sections`)
      return json({ sections: SLIDE_SECTIONS });
    return json(
      { type: 'urn:skb:problem:not_found', title: 'Not found', status: 404, code: 'not_found' },
      404,
    );
  };
  return { fetch, calls };
}

beforeAll(() => {
  // happy-dom does not lay out pages; scrolling is only recorded.
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  resetUiState();
});

describe('library page', () => {
  it('groups sources by module and shows progress, failures and warnings', async () => {
    const server = fakeServer();
    renderApp('/library', server.fetch);
    expect(await screen.findByRole('heading', { level: 1, name: 'Library' })).toBeInTheDocument();
    const inbox = await screen.findByRole('list', { name: 'Sources in Inbox' });
    const module = screen.getByRole('list', { name: 'Sources in COC251' });
    expect(within(module).getByRole('link', { name: 'Week 3 consensus' })).toHaveAttribute(
      'href',
      `/library/${SLIDES}`,
    );
    expect(within(module).getByText(/Slides · 2 slides · 5\.2 MB/)).toBeInTheDocument();
    expect(within(module).getByRole('progressbar', { name: 'Extracting text' })).toHaveAttribute(
      'aria-valuenow',
      '25',
    );
    expect(
      within(inbox).getByText('The PDF is damaged or is not really a PDF.'),
    ).toBeInTheDocument();
    expect(within(inbox).getByText('The document contains no text.')).toBeInTheDocument();

    // Progress events update the bar without a refetch.
    act(() =>
      dispatchServerEvent({
        type: 'job.updated',
        job: { ...(SOURCES[0]?.job as NonNullable<SourceSummary['job']>), progress: 0.75 },
      }),
    );
    // Cache updates reach components asynchronously.
    await waitFor(() =>
      expect(within(module).getByRole('progressbar', { name: 'Extracting text' })).toHaveAttribute(
        'aria-valuenow',
        '75',
      ),
    );

    const user = userEvent.setup();
    await user.click(within(inbox).getByRole('button', { name: 'Retry' }));
    await waitFor(() =>
      expect(server.calls.some((call) => call.path === `/api/sources/${FAILED}/retry`)).toBe(true),
    );
  });

  it('imports picked files into the chosen module and deletes after confirmation', async () => {
    const server = fakeServer();
    renderApp('/library', server.fetch);
    const user = userEvent.setup();
    await screen.findByRole('list', { name: 'Sources in Inbox' });
    await user.type(screen.getByRole('combobox', { name: /Module for new imports/ }), 'COC251');
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error('no file input');
    expect(input.accept).toContain('.pptx');
    await user.upload(input, new File(['%PDF-1.4'], 'Lecture 4.pdf', { type: 'application/pdf' }));
    await waitFor(() =>
      expect(
        server.calls.some((call) => call.method === 'POST' && call.path === '/api/sources'),
      ).toBe(true),
    );
    const upload = server.calls.find(
      (call) => call.method === 'POST' && call.path === '/api/sources',
    );
    const form = upload?.body;
    if (!(form instanceof FormData)) throw new Error('Expected a multipart upload.');
    expect(form.get('module')).toBe('COC251');
    expect(await screen.findByText('Importing “Lecture 4”')).toBeInTheDocument();

    await user.clear(screen.getByRole('combobox', { name: /Module for new imports/ }));
    await user.type(screen.getByRole('combobox', { name: /Module for new imports/ }), '../x');
    expect(screen.getByRole('alert')).toHaveTextContent('Module:');
    expect(screen.getByRole('button', { name: 'Import files' })).toBeDisabled();

    const inbox = screen.getByRole('list', { name: 'Sources in Inbox' });
    await user.click(within(inbox).getByRole('button', { name: 'Actions for Scanned handout' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this source?' });
    await user.click(within(dialog).getByRole('button', { name: 'Move to trash' }));
    await waitFor(() =>
      expect(
        server.calls.some(
          (call) => call.method === 'DELETE' && call.path === `/api/sources/${FAILED}`,
        ),
      ).toBe(true),
    );
  });
});

describe('source viewer', () => {
  it('opens slides at a slide and its speaker notes', async () => {
    const server = fakeServer();
    renderApp(`/library/${SLIDES}?slide=2&notes=1`, server.fetch);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Week 3 consensus' }),
    ).toBeInTheDocument();
    const slide = await screen.findByRole('article', { name: 'Slide 2: Paxos' });
    const notes = within(slide).getByRole('complementary', { name: 'Speaker notes for slide 2' });
    expect(notes).toHaveTextContent('Explain why a majority suffices.');
    expect(within(slide).getByText(/Prepare\s+Accept/)).toBeInTheDocument();
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(breadcrumb).getByRole('link', { name: 'Library' })).toHaveAttribute(
      'href',
      '/library',
    );
    expect(screen.getByRole('link', { name: /Open original/ })).toHaveAttribute(
      'href',
      '/api/files/Sources/COC251/Week%203%20consensus.pptx',
    );
  });

  it('explains when a source is not in the library', async () => {
    renderApp('/library/src_01J9Z3K4M2Q8R5T7V9X1Y3Z5B7', fakeServer().fetch);
    expect(
      await screen.findByRole('heading', { name: 'This source is not in the library' }),
    ).toBeInTheDocument();
  });
});

describe('search results from sources', () => {
  it('open the viewer at the page of the passage', async () => {
    renderApp('/search?q=majority', fakeServer().fetch);
    const results = await screen.findByRole('list', { name: 'Search results' });
    const link = within(results).getByRole('link', { name: /Scanned handout › p\. 2/ });
    expect(link).toHaveAttribute('href', `/library/${FAILED}?page=2`);
    expect(within(link).getByText('majority', { selector: 'mark' })).toBeInTheDocument();
    expect(within(link).getByText('PDF')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 result · 2 ms');
  });
});

describe('viewer links', () => {
  it('maps locators to viewer addresses and validates them', () => {
    expect(
      viewerSearchFor({ kind: 'pdf', sourceId: SLIDES, page: 12, charStart: 3, charEnd: 40 }, 11),
    ).toEqual({ page: 12 });
    expect(
      viewerSearchFor({ kind: 'slides', sourceId: SLIDES, slide: 3, part: 'notes' }, 2),
    ).toEqual({ slide: 3, notes: true });
    expect(
      viewerSearchFor({ kind: 'docx', sourceId: SLIDES, headingPath: ['A'], paragraph: 7 }, 4),
    ).toEqual({ section: 4 });
    expect(validateViewerSearch({ page: '3', slide: '0', notes: '1', section: '0' })).toEqual({
      page: 3,
      notes: true,
      section: 0,
    });
    expect(validateViewerSearch({ page: '-1', slide: 'x', section: '1.5' })).toEqual({});
  });
});
