import { fileUrl, type GenerationScope, type Locator, type SourceSummary } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { Download, Sparkles, SquarePlus, TriangleAlert } from 'lucide-react';
import { lazy, type ReactNode, Suspense, useState } from 'react';
import { Button, buttonClasses } from '../../../components/Button';
import { Page } from '../../../components/Page';
import { Pane } from '../../../components/Pane';
import { EmptyState, ErrorState, LoadingState } from '../../../components/States';
import { ApiError } from '../../../lib/api/client';
import { useApi } from '../../../lib/api/context';
import { notifyError } from '../../../lib/notify';
import { GenerateDialog } from '../../inbox/GenerateDialog';
import { useQuickAdd } from '../../review/quick-add';
import { sectionsQuery, sourceQuery, useLiveImportProgress, useRetrySource } from '../api';
import type { ViewerSearch } from '../links';
import { ImportProgress, SourceStatus } from '../SourceRow';
import { DocumentViewer } from './DocumentViewer';
import { ImageViewer, MediaViewer } from './MediaViewer';
import { SlidesViewer } from './SlidesViewer';

// pdf.js is large: it loads only when a PDF is opened.
const PdfViewer = lazy(() => import('./PdfViewer'));

/** One source, opened where a link points (task 5.18): `/library/<id>?page=…|slide=…|section=…`. */
export function SourceViewerPage() {
  const api = useApi();
  const navigate = useNavigate();
  const { sourceId } = useParams({ strict: false }) as { sourceId: string };
  const search = useSearch({ strict: false }) as ViewerSearch;
  const source = useQuery(sourceQuery(api, sourceId));
  useLiveImportProgress();
  const parsed = source.data?.status === 'ready' || (source.data?.sectionCount ?? 0) > 0;
  const sections = useQuery({ ...sectionsQuery(api, sourceId), enabled: Boolean(parsed) });
  const [generating, setGenerating] = useState<{ scope: GenerationScope; title: string } | null>(
    null,
  );

  const go = (next: ViewerSearch) =>
    void navigate({
      to: '/library/$sourceId',
      params: { sourceId },
      search: next,
      replace: true,
    });

  if (source.isPending) {
    return (
      <Page title="Library" breadcrumbs={[{ label: 'Library', to: '/library' }]}>
        <LoadingState label="Opening the source" />
      </Page>
    );
  }
  if (source.isError) {
    const missing = source.error instanceof ApiError && source.error.status === 404;
    return (
      <Page title="Library" breadcrumbs={[{ label: 'Library', to: '/library' }]}>
        {missing ? (
          <EmptyState
            title="This source is not in the library"
            description="It may have been deleted. Deleted sources can be restored from the trash in the Notes section."
            action={
              <Link to="/library" className={buttonClasses()}>
                Back to the library
              </Link>
            }
          />
        ) : (
          <ErrorState message={source.error.message} onRetry={() => void source.refetch()} />
        )}
      </Page>
    );
  }

  const data = source.data;
  /** "Make card from selection" (task 8.08): the selected text, and where it is in the source. */
  /** Where the reader is: the page, slide, moment or section on screen. */
  const locatorHere = (): Locator | undefined => {
    const section =
      sections.data?.sections.find((candidate) => candidate.ordinal === search.section) ??
      sections.data?.sections[0];
    if (data.kind === 'pdf') return { kind: 'pdf', sourceId: data.id, page: search.page ?? 1 };
    if (data.kind === 'pptx')
      return {
        kind: 'slides',
        sourceId: data.id,
        slide: search.slide ?? 1,
        part: search.notes ? 'notes' : 'body',
      };
    if (data.kind === 'audio' || data.kind === 'video') {
      const at = (search.t ?? 0) * 1000;
      const playing = [...(sections.data?.sections ?? [])]
        .reverse()
        .find((candidate) => candidate.locator.kind === 'media' && candidate.locator.startMs <= at);
      return playing?.locator ?? section?.locator;
    }
    return section?.locator;
  };
  const makeCard = () => {
    const front = window.getSelection()?.toString().trim() ?? '';
    const locator = locatorHere();
    useQuickAdd.getState().open({ front, ...(locator ? { locator } : {}) });
  };
  /** Generate from the selection if there is one, otherwise from the source (task 11.12). */
  const generate = () => {
    const text = window.getSelection()?.toString().trim() ?? '';
    const locator = locatorHere();
    setGenerating(
      text && locator
        ? {
            scope: { kind: 'selection', text, locator, title: data.title },
            title: `the selection in “${data.title}”`,
          }
        : { scope: { kind: 'source', sourceId: data.id }, title: data.title },
    );
  };
  let body: ReactNode;
  if ((data.kind === 'audio' || data.kind === 'video') && !data.missing) {
    body = (
      <MediaViewer
        source={data}
        sections={sections.data?.sections ?? []}
        time={search.t}
        onNavigate={(t) => go({ t })}
      />
    );
  } else if (data.kind === 'image' && !data.missing) {
    body = <ImageViewer source={data} sections={sections.data?.sections ?? []} />;
  } else if (data.kind === 'pdf' && !data.missing) {
    body = (
      <Suspense fallback={<LoadingState label="Loading the PDF viewer" />}>
        <PdfViewer
          url={fileUrl(data.path)}
          page={search.page}
          onNavigate={(page) => go({ page })}
        />
      </Suspense>
    );
  } else if (sections.data && sections.data.sections.length > 0) {
    body =
      data.kind === 'pptx' ? (
        <SlidesViewer
          sections={sections.data.sections}
          slide={search.slide}
          notes={search.notes === true}
          onNavigate={(slide) => go({ slide })}
        />
      ) : (
        <DocumentViewer
          source={data}
          sections={sections.data.sections}
          section={search.section}
          onNavigate={(section) => go({ section })}
        />
      );
  } else {
    body = (
      <Pane title="Source" hideTitle className="flex-1">
        {sections.isFetching ? (
          <LoadingState label="Loading the text" />
        ) : (
          <EmptyState
            title={data.status === 'ready' ? 'No text in this source' : 'Not ready yet'}
            description={
              data.status === 'ready'
                ? 'Nothing could be extracted from this file. Open the original to read it.'
                : 'The text appears here as soon as the import has finished.'
            }
          />
        )}
      </Pane>
    );
  }

  return (
    <Page
      title={data.title}
      layout="panes"
      breadcrumbs={[{ label: 'Library', to: '/library' }, { label: data.moduleCode ?? 'Inbox' }]}
      description={data.path}
      toolbar={<StatusLine source={data} />}
      actions={
        !data.missing && (
          <>
            <Button onClick={makeCard}>
              <SquarePlus aria-hidden="true" size={16} />
              Card from selection
            </Button>
            <Button onClick={generate} disabled={data.status !== 'ready'}>
              <Sparkles aria-hidden="true" size={16} />
              Generate…
            </Button>
            <a href={fileUrl(data.path)} target="_blank" rel="noopener" className={buttonClasses()}>
              <Download aria-hidden="true" size={16} />
              Open original
            </a>
          </>
        )
      }
    >
      {body}
      {generating && (
        <GenerateDialog
          scope={generating.scope}
          title={generating.title}
          pageCount={data.pageCount}
          onClose={() => setGenerating(null)}
        />
      )}
    </Page>
  );
}

/** Warnings that reading the source again can resolve, once AI is set up. */
const READ_AGAIN = new Set(['needs-ai', 'no-text', 'pages-without-text']);

function StatusLine({ source }: { source: SourceSummary }) {
  const retry = useRetrySource();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-3 text-sm">
      <SourceStatus source={source} />
      {source.status === 'failed' && !source.missing && (
        <span className="flex items-center gap-2 text-danger">
          {source.error}
          <Button
            size="sm"
            loading={retry.isPending}
            onClick={() => retry.mutate(source.id, { onError: notifyError })}
          >
            Retry
          </Button>
        </span>
      )}
      {source.status === 'ready' && source.warnings.length > 0 && (
        <span className="flex items-center gap-1 text-xs">
          <TriangleAlert aria-hidden="true" size={13} className="text-warning" />
          {source.warnings.map((warning) => warning.message).join(' ')}
          {!source.missing && source.warnings.some((warning) => READ_AGAIN.has(warning.code)) && (
            <Button
              size="sm"
              className="ml-1"
              loading={retry.isPending}
              onClick={() => retry.mutate(source.id, { onError: notifyError })}
            >
              Read again
            </Button>
          )}
        </span>
      )}
      <div className="w-full max-w-sm empty:hidden">
        <ImportProgress source={source} />
      </div>
    </div>
  );
}
