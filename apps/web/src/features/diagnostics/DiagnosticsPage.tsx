import {
  DIAGNOSTICS_BUNDLE_PATH,
  type Diagnostics,
  getDiagnosticsEndpoint,
  type LogEntry,
  logsEndpoint,
} from '@skb/core';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Download, RefreshCw } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Badge, type BadgeTone } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Page, StickySection } from '../../components/Page';
import { ErrorState, LoadingState } from '../../components/States';
import type { ApiClient } from '../../lib/api/client';
import { useApi } from '../../lib/api/context';
import { formatBytes, formatCount, formatDateTime, formatUptime } from '../../lib/format';
import { Field, selectClasses } from '../learning/Field';

/**
 * Diagnostics (task 17.06): what the installation is doing, the recent log, and a bundle of both that can
 * be sent to someone who is helping. Counts and states only — no note text, no keys.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const diagnosticsQuery = (api: ApiClient) =>
  queryOptions({
    queryKey: ['diagnostics', 'report'] as const,
    queryFn: () => api.request(getDiagnosticsEndpoint),
    refetchInterval: 15_000,
  });

const logsQuery = (api: ApiClient, level: Level, q: string) =>
  queryOptions({
    queryKey: ['diagnostics', 'logs', level, q] as const,
    queryFn: () => api.request(logsEndpoint, { query: { level, limit: 200, ...(q ? { q } : {}) } }),
  });

const LEVEL_TONES: Record<Level, BadgeTone> = {
  debug: 'neutral',
  info: 'info',
  warn: 'warning',
  error: 'danger',
};

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-[12rem_1fr]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DiagnosticsPage() {
  const api = useApi();
  const report = useQuery(diagnosticsQuery(api));
  return (
    <Page
      title="Diagnostics"
      description="What this installation is doing, its recent log, and a bundle you can send to someone helping you."
    >
      {report.isPending && <LoadingState label="Loading diagnostics" />}
      {report.isError && (
        <ErrorState message={report.error.message} onRetry={() => void report.refetch()} />
      )}
      {report.data && <Report data={report.data} />}
      <LogSection />
      <StickySection
        title="Diagnostics bundle"
        description="A zip with the details above, the applied migrations, your non-secret settings and the log. It holds no note text, no questions or answers and no AI keys, and shows your home folder as ~. Read it before you send it."
      >
        <a
          className="inline-flex items-center gap-2 rounded-md border border-border-strong bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-hover"
          href={DIAGNOSTICS_BUNDLE_PATH}
          download
        >
          <Download aria-hidden="true" size={16} />
          Download the bundle
        </a>
      </StickySection>
    </Page>
  );
}

function Report({ data }: { data: Diagnostics }) {
  return (
    <>
      <StickySection title="This installation">
        <Rows
          rows={[
            ['Version', `${data.app.version} (${data.app.mode})`],
            ['Running for', formatUptime(data.app.uptimeSeconds)],
            ['Node.js', `${data.app.node} on ${data.app.platform}`],
            [
              'Vault',
              <code key="v" className="font-mono text-xs">
                {data.vault.path}
              </code>,
            ],
            [
              'Database',
              `SQLite ${data.database.sqliteVersion}, ${formatCount(data.database.migrations, 'migration')} applied (${data.database.latestMigration ?? 'none'}), ${formatBytes(data.database.sizeBytes)}` +
                (data.database.walBytes > 0
                  ? ` and ${formatBytes(data.database.walBytes)} not yet folded in`
                  : ''),
            ],
            [
              'Holds',
              `${formatCount(data.counts.notes, 'note')}, ${formatCount(data.counts.sources, 'source')}, ${formatCount(data.counts.concepts, 'concept')}, ${formatCount(data.counts.cards, 'card')}, ${formatCount(data.counts.questions, 'question')}`,
            ],
            [
              'Backups',
              <span key="b">
                {data.backups.count === 0
                  ? 'None yet. '
                  : `${formatCount(data.backups.count, 'copy', 'copies')}, the latest ${formatDateTime(new Date(data.backups.latestAt ?? ''))}. `}
                <Link to="/settings" className="text-accent underline">
                  Settings → Data
                </Link>
              </span>,
            ],
          ]}
        />
      </StickySection>
      <StickySection
        title="Background jobs"
        description="Reading sources, making study materials, exports and the like."
      >
        <p className="text-sm">
          {data.jobs.running} running, {data.jobs.queued} waiting, {data.jobs.failed} failed.
        </p>
        {data.jobs.recentFailures.length > 0 && (
          <ul aria-label="Recent failures" className="mt-2 divide-y divide-border text-sm">
            {data.jobs.recentFailures.map((failure) => (
              <li key={`${failure.kind}-${failure.updatedAt}`} className="py-2">
                <span className="font-mono text-xs">{failure.kind}</span>{' '}
                <span className="text-xs text-muted">
                  {formatDateTime(new Date(failure.updatedAt))}
                </span>
                <p>{failure.error}</p>
              </li>
            ))}
          </ul>
        )}
      </StickySection>
    </>
  );
}

function LogSection() {
  const api = useApi();
  const [level, setLevel] = useState<Level>('info');
  const [text, setText] = useState('');
  const logs = useQuery(logsQuery(api, level, text.trim()));
  return (
    <StickySection
      title="Log"
      description="The newest entries first, from the files in the vault's .skb/logs folder (the last seven days)."
    >
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Field label="Show">
          {(id) => (
            <select
              id={id}
              className={selectClasses}
              value={level}
              onChange={(event) => setLevel(event.target.value as Level)}
            >
              <option value="debug">Everything</option>
              <option value="info">Information and above</option>
              <option value="warn">Warnings and errors</option>
              <option value="error">Errors only</option>
            </select>
          )}
        </Field>
        <Field label="Containing" className="min-w-48 flex-1">
          {(id) => <Input id={id} value={text} onChange={(event) => setText(event.target.value)} />}
        </Field>
        <Button onClick={() => void logs.refetch()} loading={logs.isFetching}>
          <RefreshCw aria-hidden="true" size={16} />
          Refresh
        </Button>
      </div>
      {logs.isPending && <LoadingState label="Loading the log" />}
      {logs.isError && (
        <ErrorState message={logs.error.message} onRetry={() => void logs.refetch()} />
      )}
      {logs.data && logs.data.entries.length === 0 && (
        <p className="text-sm text-muted">Nothing in the log at this level.</p>
      )}
      {logs.data && logs.data.entries.length > 0 && (
        <ol
          aria-label="Log entries"
          className="divide-y divide-border rounded-md border border-border"
        >
          {withKeys(logs.data.entries).map(({ key, entry }) => (
            <Entry key={key} entry={entry} />
          ))}
        </ol>
      )}
      {logs.data?.truncated && (
        <p className="mt-2 text-xs text-muted">Only the newest 200 are shown. Narrow the search.</p>
      )}
    </StickySection>
  );
}

/** Entries have no identity of their own: the same time, level and message get a running number. */
function withKeys(entries: LogEntry[]): { key: string; entry: LogEntry }[] {
  const seen = new Map<string, number>();
  return entries.map((entry) => {
    const base = `${entry.time}|${entry.level}|${entry.message}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { key: `${base}|${n}`, entry };
  });
}

function Entry({ entry }: { entry: LogEntry }) {
  const hasFields = Object.keys(entry.fields).length > 0;
  return (
    <li className="px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <time className="text-xs text-muted tabular-nums" dateTime={entry.time}>
          {formatDateTime(new Date(entry.time))}
        </time>
        <Badge tone={LEVEL_TONES[entry.level]}>{entry.level}</Badge>
        <span className="min-w-0 flex-1 break-words">{entry.message}</span>
      </div>
      {hasFields && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-muted">Details</summary>
          <pre className="mt-1 max-h-60 overflow-auto rounded bg-surface-sunken p-2 text-xs">
            {JSON.stringify(entry.fields, null, 2)}
          </pre>
        </details>
      )}
    </li>
  );
}
