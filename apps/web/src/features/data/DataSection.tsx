import {
  type DataOverview,
  exportDownloadPath,
  type JobSummary,
  type VaultInspection,
} from '@skb/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Download, FolderOpen, RefreshCw, Trash2 } from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { IconButton } from '../../components/IconButton';
import { Input } from '../../components/Input';
import { StickySection } from '../../components/Page';
import { ProgressBar } from '../../components/ProgressBar';
import { ErrorState, LoadingState } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { onServerEvent } from '../../lib/events';
import { formatBytes, formatCount, formatDateTime } from '../../lib/format';
import { notifyError } from '../../lib/notify';
import { Field } from '../learning/Field';
import { dataKeys, dataOverviewQuery, useDataActions } from './api';
import { CodeGraphsPanel } from './CodeGraphsPanel';

/**
 * Settings → Data (tasks 16.01–16.09): everything the student owns can leave the application in open
 * formats and come back — export, restore, concepts as notes, switching vault, and importing the
 * graph of a coursework repository. Nothing here depends on an AI model.
 */

/** Revealing the folder in the file manager is a desktop feature (Phase 18); here the path is copied. */
async function copyPath(path: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(path);
    toast.success('Path copied');
  } catch {
    toast.error('The path could not be copied', { description: path });
  }
}

const DATA_JOBS = new Set(['data.export', 'data.restore', 'data.rescan']);
const finished = (job: JobSummary) =>
  job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled';

/** The export, restore or rescan that is running, followed through the event stream. */
function useDataJob(initial: JobSummary | null) {
  const queryClient = useQueryClient();
  const [job, setJob] = useState<JobSummary | null>(initial);
  useEffect(() => setJob((current) => current ?? initial), [initial]);
  useEffect(
    () =>
      onServerEvent((event) => {
        if (event.type !== 'job.updated' || !DATA_JOBS.has(event.job.kind)) return;
        setJob(event.job);
        if (!finished(event.job)) return;
        void queryClient.invalidateQueries({ queryKey: dataKeys.all });
        if (event.job.status === 'succeeded')
          toast.success(
            event.job.kind === 'data.export'
              ? 'Export finished'
              : event.job.kind === 'data.restore'
                ? 'Restore finished'
                : 'Files read again',
            event.job.message ? { description: event.job.message } : {},
          );
        else if (event.job.status === 'failed')
          toast.error('That did not finish', {
            ...(event.job.error ? { description: event.job.error } : {}),
          });
      }),
    [queryClient],
  );
  return job;
}

export function DataSection() {
  const api = useApi();
  const overview = useQuery(dataOverviewQuery(api));
  const job = useDataJob(overview.data?.job ?? null);
  const busy = job !== null && !finished(job);
  return (
    <StickySection
      title="Data"
      description="Your notes, sources and study data are yours: take everything out in open formats, bring it back, or open another vault."
    >
      {overview.isPending && <LoadingState label="Loading data details" />}
      {overview.isError && (
        <ErrorState message={overview.error.message} onRetry={() => void overview.refetch()} />
      )}
      {overview.data && (
        <div className="space-y-8">
          {job && (
            <div role="status" className="rounded-md border border-border p-3 text-sm">
              <ProgressBar
                value={finished(job) ? 1 : job.progress}
                label={job.message ?? (finished(job) ? 'Done' : 'Working')}
              />
              {job.status === 'failed' && job.error && (
                <p className="mt-2 text-danger">{job.error}</p>
              )}
            </div>
          )}
          <ExportPanel overview={overview.data} busy={busy} />
          <RestorePanel overview={overview.data} busy={busy} />
          <VaultsPanel overview={overview.data} />
          <ConceptNotesPanel />
          <RescanPanel busy={busy} />
          <CodeGraphsPanel />
        </div>
      )}
    </StickySection>
  );
}

type Overview = DataOverview;

function Panel({
  title,
  children,
  description,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function ExportPanel({ overview, busy }: { overview: Overview; busy: boolean }) {
  const actions = useDataActions();
  const { counts } = overview;
  return (
    <Panel
      title="Export everything"
      description={`One zip with your vault as it is on disk, a JSON file for every table of your data, flashcards as Anki text, the graph as JSON and GraphML, questions and quizzes, and a README. ${formatCount(counts.notes ?? 0, 'note')}, ${formatCount(counts.sources ?? 0, 'source')}, ${formatCount(counts.concepts ?? 0, 'concept')} and ${formatCount(counts.answers ?? 0, 'answer')} at the moment.`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          disabled={busy}
          loading={actions.startExport.isPending}
          onClick={() => actions.startExport.mutate(undefined, { onError: notifyError })}
        >
          <Download aria-hidden="true" size={16} />
          Export everything
        </Button>
        <span className="text-xs text-muted">
          Kept in <code className="font-mono">{overview.exportsFolder}</code>, outside your vault.
        </span>
      </div>
      {overview.exports.length === 0 ? (
        <p className="text-sm text-muted">No exports yet.</p>
      ) : (
        <ul aria-label="Exports" className="divide-y divide-border rounded-md border border-border">
          {overview.exports.map((entry) => (
            <li key={entry.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <span className="min-w-0 flex-1 break-all font-mono text-xs">{entry.name}</span>
              <span className="text-xs text-muted">
                {formatBytes(entry.sizeBytes)} · {formatDateTime(new Date(entry.createdAt))}
              </span>
              <a
                className="text-sm text-accent underline"
                href={exportDownloadPath(entry.name)}
                download={entry.name}
              >
                Download
              </a>
              <IconButton
                label={`Delete ${entry.name}`}
                icon={<Trash2 size={14} />}
                size="sm"
                onClick={() => actions.deleteExport.mutate(entry.name, { onError: notifyError })}
              />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function RestorePanel({ overview, busy }: { overview: Overview; busy: boolean }) {
  const actions = useDataActions();
  const [archive, setArchive] = useState('');
  const [target, setTarget] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    actions.restore.mutate(
      { archive: archive.trim(), target: target.trim() },
      { onError: notifyError },
    );
  };
  return (
    <Panel
      title="Restore from an export"
      description="Makes a new vault in an empty folder. It never merges into, or overwrites, the vault you are using. Open it afterwards from the list below."
    >
      <form
        className="grid gap-2 sm:grid-cols-2"
        onSubmit={submit}
        aria-label="Restore from an export"
      >
        <Field label="Export">
          {(id) => (
            <>
              <Input
                id={id}
                list="export-names"
                value={archive}
                placeholder={
                  overview.exports[0]?.name ?? 'Name of an export, or the path of a .zip'
                }
                onChange={(event) => setArchive(event.target.value)}
              />
              <datalist id="export-names">
                {overview.exports.map((entry) => (
                  <option key={entry.name} value={entry.name} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label="New vault folder">
          {(id) => (
            <Input
              id={id}
              value={target}
              placeholder="C:\Users\you\Documents\Manuscript (restored)"
              onChange={(event) => setTarget(event.target.value)}
            />
          )}
        </Field>
        <div className="sm:col-span-2">
          <Button
            type="submit"
            disabled={busy || archive.trim() === '' || target.trim() === ''}
            loading={actions.restore.isPending}
          >
            Restore into a new vault
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function VaultsPanel({ overview }: { overview: Overview }) {
  const actions = useDataActions();
  const [folder, setFolder] = useState('');
  const [inspection, setInspection] = useState<VaultInspection | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const inspect = (event: FormEvent) => {
    event.preventDefault();
    setNote(null);
    actions.inspect.mutate(folder.trim(), {
      onSuccess: setInspection,
      onError: notifyError,
    });
  };
  const open = (path: string) =>
    actions.switchVault.mutate(path, {
      onSuccess: (result) =>
        setNote(
          result.restarting
            ? 'Opening that vault… this page reloads when Manuscript is back.'
            : 'That vault will open the next time you start Manuscript. Close it and start it again to switch now.',
        ),
      onError: notifyError,
    });

  // After a restart the old page has nothing to talk to; reload once the server answers again.
  useEffect(() => {
    if (!note?.startsWith('Opening')) return;
    const timer = window.setInterval(() => {
      fetch('/api/ping')
        .then((response) => {
          if (response.ok) window.location.reload();
        })
        .catch(() => undefined);
    }, 2_000);
    const stop = window.setTimeout(() => window.clearInterval(timer), 120_000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [note]);

  return (
    <Panel
      title="Vaults on this computer"
      description="A vault is a folder of Markdown notes. Obsidian vaults are opened where they are: notes are read in place and only an id line is ever added to them."
    >
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[8rem_1fr]">
        <dt className="text-muted">In use now</dt>
        <dd className="flex flex-wrap items-center gap-2">
          <span className="break-all font-mono text-xs">{overview.vault.path}</span>
          <Button size="sm" variant="ghost" onClick={() => void copyPath(overview.vault.path)}>
            <Copy aria-hidden="true" size={14} />
            Copy path
          </Button>
        </dd>
      </dl>
      {overview.recentVaults.filter((entry) => !entry.current).length > 0 && (
        <ul
          aria-label="Recent vaults"
          className="divide-y divide-border rounded-md border border-border"
        >
          {overview.recentVaults
            .filter((entry) => !entry.current)
            .map((entry) => (
              <li
                key={entry.path}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{entry.name}</span>
                  <span className="block break-all font-mono text-xs text-muted">{entry.path}</span>
                </span>
                {!entry.exists && <Badge tone="warning">not found</Badge>}
                <Button size="sm" disabled={!entry.exists} onClick={() => open(entry.path)}>
                  <FolderOpen aria-hidden="true" size={14} />
                  Open
                </Button>
                <IconButton
                  label={`Forget ${entry.name}`}
                  icon={<Trash2 size={14} />}
                  size="sm"
                  onClick={() => actions.forgetVault.mutate(entry.path, { onError: notifyError })}
                />
              </li>
            ))}
        </ul>
      )}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={inspect}
        aria-label="Open a folder"
      >
        <Field label="Open another folder as a vault" className="min-w-64 flex-1">
          {(id) => (
            <Input
              id={id}
              value={folder}
              placeholder="C:\Users\you\Documents\Obsidian\Uni"
              onChange={(event) => {
                setFolder(event.target.value);
                setInspection(null);
              }}
            />
          )}
        </Field>
        <Button type="submit" disabled={folder.trim() === ''} loading={actions.inspect.isPending}>
          Look at it
        </Button>
      </form>
      {inspection && (
        <div className="space-y-2 rounded-md border border-border p-3 text-sm">
          <p>{inspection.summary}</p>
          <Button
            variant="primary"
            disabled={inspection.current || inspection.locked}
            loading={actions.switchVault.isPending}
            onClick={() => open(inspection.path)}
          >
            Open this vault
          </Button>
        </div>
      )}
      {note && (
        <p role="status" className="text-sm">
          {note}
        </p>
      )}
    </Panel>
  );
}

function ConceptNotesPanel() {
  const actions = useDataActions();
  const [folder, setFolder] = useState('Concepts');
  const [result, setResult] = useState<string | null>(null);
  return (
    <Panel
      title="Concepts as notes"
      description="Writes a Markdown note for each concept that has none — summary, aliases, modules and its relations as links — and makes it the concept’s note. Notes that exist are never overwritten. (Every export also carries them.)"
    >
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Folder">
          {(id) => (
            <Input id={id} value={folder} onChange={(event) => setFolder(event.target.value)} />
          )}
        </Field>
        <Button
          loading={actions.materialise.isPending}
          onClick={() =>
            actions.materialise.mutate(folder, {
              onSuccess: (value) =>
                setResult(
                  `${formatCount(value.created.length, 'note')} written in ${value.folder}; ${value.skipped} already had one.`,
                ),
              onError: notifyError,
            })
          }
        >
          Write notes for my concepts
        </Button>
      </div>
      {result && (
        <p role="status" className="text-sm">
          {result}
        </p>
      )}
    </Panel>
  );
}

function RescanPanel({ busy }: { busy: boolean }) {
  const actions = useDataActions();
  return (
    <Panel
      title="Read the files again"
      description="The search, links and graph are made from the files in your vault. If you changed files while Manuscript was closed or a sync tool is behind, this brings the index up to date. It changes none of your files."
    >
      <Button
        disabled={busy}
        loading={actions.rescan.isPending}
        onClick={() => actions.rescan.mutate(undefined, { onError: notifyError })}
      >
        <RefreshCw aria-hidden="true" size={16} />
        Read the files again
      </Button>
    </Panel>
  );
}
