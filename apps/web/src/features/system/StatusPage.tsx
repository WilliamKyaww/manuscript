import { type HealthResponse, healthEndpoint } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../../lib/api/client';
import { useApi } from '../../lib/api/context';

/**
 * Phase 1 landing page: proves the browser ↔ server ↔ database path works end to end.
 * Phase 2 replaces this with the application shell; the status panel moves to Settings › About.
 */
export function StatusPage() {
  const api = useApi();
  const health = useQuery({
    queryKey: ['system', 'health'],
    queryFn: () => api.request(healthEndpoint),
  });

  return (
    <main className="min-h-dvh bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <header className="mb-10">
          <h1 className="text-3xl font-semibold tracking-tight">Study Knowledge Base</h1>
          <p className="mt-2 text-stone-600 dark:text-stone-400">
            Personal knowledge and learning OS — foundation build. The application shell arrives in
            Phase 2.
          </p>
        </header>

        <section
          aria-labelledby="server-status-heading"
          className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900"
        >
          <h2 id="server-status-heading" className="text-lg font-medium">
            Local server
          </h2>
          <div className="mt-4">
            {health.isPending && (
              <p role="status" className="text-stone-600 dark:text-stone-400">
                Checking the local server…
              </p>
            )}
            {health.isError && (
              <StatusError error={health.error} onRetry={() => void health.refetch()} />
            )}
            {health.isSuccess && <HealthDetails health={health.data} />}
          </div>
        </section>
      </div>
    </main>
  );
}

function HealthDetails({ health }: { health: HealthResponse }) {
  const rows: [string, string][] = [
    ['Version', `${health.version} (${health.mode})`],
    ['Vault', `${health.vault.name} — ${health.vault.path}`],
    [
      'Database',
      `SQLite ${health.database.sqliteVersion}, ${health.database.appliedMigrations} migration${health.database.appliedMigrations === 1 ? '' : 's'} applied`,
    ],
    ['Running for', formatUptime(health.uptimeSeconds)],
  ];
  return (
    <>
      <p className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400">
        <span aria-hidden="true" className="inline-block size-2.5 rounded-full bg-emerald-500" />
        Healthy
      </p>
      <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-stone-500 dark:text-stone-400">{label}</dt>
            <dd className="break-all">{value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function StatusError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const apiError = error instanceof ApiError ? error : null;
  let title = 'Something went wrong';
  let message = error.message;
  if (apiError?.isUnauthenticated) {
    title = 'Sign-in required';
    message =
      'This page needs the sign-in link from the server. Start the application with run-web.bat, or open the link printed in the server window.';
  } else if (apiError?.code === 'unreachable') {
    title = 'Cannot reach the local server';
    message =
      'Make sure the server is running (run-web.bat, or npm run dev while developing), then try again.';
  }
  return (
    <div role="alert">
      <p className="font-medium text-amber-700 dark:text-amber-400">{title}</p>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{message}</p>
      {!apiError?.isUnauthenticated && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-stone-700 dark:hover:bg-stone-800"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
