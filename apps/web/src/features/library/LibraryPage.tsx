import { ModuleCodeSchema, SOURCE_ACCEPT, type SourceSummary } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { FileUp, Library, Search } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Page, StickySection } from '../../components/Page';
import { EmptyState, ErrorState, LoadingState, Skeleton } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { notifyError, notifySuccess } from '../../lib/notify';
import { readPreference, writePreference } from '../../lib/storage';
import { sourcesQuery, useDeleteSource, useLiveImportProgress, useRetrySource } from './api';
import { useFileDrop, useImportFiles } from './importing';
import { SourceRow } from './SourceRow';

/**
 * The source library (task 5.17): imported lecture material grouped by module, with drag-and-drop or
 * picker import, live progress, failures with a reason and a retry, and deletion to the trash.
 */

const MODULE_PREFERENCE = 'skb.library.module';
const INBOX = 'Inbox';

interface Group {
  label: string;
  sources: SourceSummary[];
}

function groupByModule(sources: readonly SourceSummary[]): Group[] {
  const groups = new Map<string, SourceSummary[]>();
  for (const source of sources) {
    const label = source.moduleCode ?? INBOX;
    groups.set(label, [...(groups.get(label) ?? []), source]);
  }
  // The inbox (where new imports land) first, then modules alphabetically.
  return [...groups]
    .sort(([a], [b]) => (a === INBOX ? -1 : b === INBOX ? 1 : a.localeCompare(b, 'en-GB')))
    .map(([label, items]) => ({ label, sources: items }));
}

export function LibraryPage() {
  const api = useApi();
  const sources = useQuery(sourcesQuery(api));
  useLiveImportProgress();
  const { importFiles, progress } = useImportFiles();
  const retry = useRetrySource();
  const remove = useDeleteSource();
  const [moduleCode, setModuleCode] = useState(() => readPreference(MODULE_PREFERENCE) ?? '');
  const [filter, setFilter] = useState('');
  const [deleting, setDeleting] = useState<SourceSummary | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const ids = { module: useId(), modules: useId(), filter: useId(), moduleError: useId() };

  const moduleResult = moduleCode.trim() === '' ? null : ModuleCodeSchema.safeParse(moduleCode);
  const moduleError =
    moduleResult && !moduleResult.success ? moduleResult.error.issues[0]?.message : null;
  const targetModule = moduleResult?.success ? moduleResult.data : null;
  const start = (files: File[]) => {
    if (moduleError) return;
    writePreference(MODULE_PREFERENCE, targetModule ?? '');
    void importFiles(files, targetModule);
  };
  const drop = useFileDrop(start);

  const all = sources.data?.sources ?? [];
  const knownModules = useMemo(
    () =>
      [...new Set(all.flatMap((source) => (source.moduleCode ? [source.moduleCode] : [])))].sort(),
    [all],
  );
  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? all.filter((source) =>
        `${source.title} ${source.originalName}`.toLowerCase().includes(needle),
      )
    : all;
  const groups = groupByModule(shown);

  const confirmDelete = () => {
    if (!deleting) return;
    remove.mutate(deleting.id, {
      onSuccess: () => {
        notifySuccess(
          `“${deleting.title}” moved to the trash`,
          'Restore it from the trash to bring it back.',
        );
        setDeleting(null);
      },
      onError: notifyError,
    });
  };

  return (
    <Page
      title="Library"
      description="Lecture slides, PDFs and documents — kept exactly as imported, searchable down to the page."
      width="wide"
      actions={
        <>
          <div className="flex flex-col">
            <label htmlFor={ids.module} className="sr-only">
              Module for new imports (optional)
            </label>
            <input
              id={ids.module}
              list={ids.modules}
              value={moduleCode}
              onChange={(event) => setModuleCode(event.target.value)}
              placeholder="Module (optional)"
              aria-invalid={moduleError ? true : undefined}
              aria-describedby={moduleError ? ids.moduleError : undefined}
              className="h-9 w-44 rounded-md border border-border-strong bg-surface px-2 text-sm text-text placeholder:text-subtle aria-invalid:border-danger"
            />
            <datalist id={ids.modules}>
              {knownModules.map((code) => (
                <option key={code} value={code} />
              ))}
            </datalist>
          </div>
          <Button
            variant="primary"
            onClick={() => fileInput.current?.click()}
            loading={progress !== null}
            disabled={Boolean(moduleError)}
          >
            <FileUp aria-hidden="true" size={16} />
            {progress ? `Uploading ${progress.done + 1} of ${progress.total}` : 'Import files'}
          </Button>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={SOURCE_ACCEPT}
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(event) => {
              start([...(event.target.files ?? [])]);
              event.target.value = '';
            }}
          />
        </>
      }
      toolbar={
        <div className="flex flex-wrap items-center gap-3 pb-3">
          <div className="relative w-full max-w-xs">
            <Search
              aria-hidden="true"
              size={14}
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted"
            />
            <label htmlFor={ids.filter} className="sr-only">
              Filter sources by name
            </label>
            <input
              id={ids.filter}
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter by name"
              className="h-8 w-full rounded-md border border-border-strong bg-surface pr-2 pl-8 text-sm text-text placeholder:text-subtle"
            />
          </div>
          {moduleError ? (
            <p id={ids.moduleError} role="alert" className="text-xs text-danger">
              Module: {moduleError}
            </p>
          ) : (
            <p className="text-xs text-muted">
              New files go to {targetModule ? `Sources/${targetModule}` : 'Sources/Inbox'}. Drop
              files anywhere on this page to import them.
            </p>
          )}
        </div>
      }
    >
      <div {...drop.props} data-drop-zone className="relative min-h-[60vh]">
        {drop.dragging && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent-subtle/80 text-sm font-medium text-accent"
          >
            Drop to import into {targetModule ?? INBOX}
          </div>
        )}
        {sources.isPending && (
          <LoadingState label="Loading the library">
            <div className="space-y-2">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-16 w-full" />
              ))}
            </div>
          </LoadingState>
        )}
        {sources.isError && (
          <ErrorState message={sources.error.message} onRetry={() => void sources.refetch()} />
        )}
        {sources.isSuccess && all.length === 0 && (
          <EmptyState
            icon={<Library size={20} />}
            title="Your library is empty"
            description="Import lecture slides (.pptx), PDFs, Word documents, Markdown or text files. The originals are copied into the Sources folder of your vault, unchanged, and their text becomes searchable — with the page or slide it came from."
            action={
              <Button variant="primary" onClick={() => fileInput.current?.click()}>
                <FileUp aria-hidden="true" size={16} />
                Import files
              </Button>
            }
          />
        )}
        {sources.isSuccess && all.length > 0 && shown.length === 0 && (
          <p className="text-sm text-muted">No source names contain “{filter}”.</p>
        )}
        {groups.map((group) => (
          <StickySection
            key={group.label}
            title={group.label}
            description={`${group.sources.length} ${group.sources.length === 1 ? 'source' : 'sources'}`}
          >
            <ul aria-label={`Sources in ${group.label}`} className="space-y-2">
              {group.sources.map((source) => (
                <SourceRow
                  key={source.id}
                  source={source}
                  retrying={retry.isPending && retry.variables === source.id}
                  onRetry={() => retry.mutate(source.id, { onError: notifyError })}
                  onDelete={() => setDeleting(source)}
                />
              ))}
            </ul>
          </StickySection>
        ))}
      </div>
      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this source?"
        size="sm"
        footer={
          <>
            <Button onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="danger" onClick={confirmDelete} loading={remove.isPending}>
              Move to trash
            </Button>
          </>
        }
      >
        <p className="text-sm">
          The original file “{deleting?.path}” moves to the trash, and its text leaves search.
          Restoring it from the trash brings the source back.
        </p>
      </Dialog>
    </Page>
  );
}
