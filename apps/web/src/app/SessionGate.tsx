import { useQuery } from '@tanstack/react-query';
import { KeyRound, ServerCrash } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../components/Button';
import { Spinner } from '../components/Spinner';
import { ApiError } from '../lib/api/client';
import { useApi } from '../lib/api/context';
import { healthQuery } from '../lib/queries';

/**
 * Checks the session before showing the app. Without a session the API answers 401 and the app
 * explains how to sign in; if the server cannot be reached it offers a retry. Once the app has loaded,
 * later failures are handled by the features themselves.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const api = useApi();
  const health = useQuery(healthQuery(api));

  if (health.data) return <>{children}</>;

  if (health.isPending) {
    return (
      <FullScreen>
        <Spinner size="lg" label="Starting Manuscript" className="text-accent" />
        <h1 className="mt-4 text-base font-medium text-muted">Connecting to the local server…</h1>
      </FullScreen>
    );
  }

  const error = health.error;
  if (error instanceof ApiError && error.isUnauthenticated) {
    return (
      <FullScreen>
        <Icon>
          <KeyRound size={24} />
        </Icon>
        <h1 className="text-xl font-semibold">Sign-in required</h1>
        <p className="mt-2 max-w-md text-sm text-muted" role="alert">
          This page needs the sign-in link from the server. Start the application with{' '}
          <code>run-web.bat</code>, or open the link printed in the server window.
        </p>
      </FullScreen>
    );
  }

  const unreachable = error instanceof ApiError && error.code === 'unreachable';
  return (
    <FullScreen>
      <Icon tone="danger">
        <ServerCrash size={24} />
      </Icon>
      <h1 className="text-xl font-semibold">
        {unreachable ? 'Cannot reach the local server' : 'The server reported a problem'}
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted" role="alert">
        {unreachable
          ? 'Make sure Manuscript is running (run-web.bat, or npm run dev while developing), then try again.'
          : (error?.message ?? 'An unknown error occurred.')}
      </p>
      <Button
        className="mt-6"
        variant="primary"
        onClick={() => void health.refetch()}
        loading={health.isFetching}
      >
        Try again
      </Button>
    </FullScreen>
  );
}

function FullScreen({ children }: { children: ReactNode }) {
  return (
    <main className="flex h-dvh flex-col items-center justify-center bg-bg px-6 text-center text-text">
      {children}
    </main>
  );
}

function Icon({ children, tone = 'accent' }: { children: ReactNode; tone?: 'accent' | 'danger' }) {
  return (
    <div
      aria-hidden="true"
      className={
        tone === 'accent'
          ? 'mb-4 flex size-14 items-center justify-center rounded-full bg-accent-subtle text-accent'
          : 'mb-4 flex size-14 items-center justify-center rounded-full bg-danger-subtle text-danger'
      }
    >
      {children}
    </div>
  );
}
