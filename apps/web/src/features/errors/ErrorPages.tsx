import { type ErrorComponentProps, Link } from '@tanstack/react-router';
import { MapPinOff } from 'lucide-react';
import { Button } from '../../components/Button';
import { Page } from '../../components/Page';
import { EmptyState, ErrorState } from '../../components/States';

export function NotFoundPage() {
  return (
    <Page title="Page not found">
      <EmptyState
        icon={<MapPinOff size={22} />}
        title="There is nothing at this address"
        description="The link may be out of date, or the page may not exist yet."
        action={
          <Button asChild variant="primary">
            <Link to="/">Go to Today</Link>
          </Button>
        }
      />
    </Page>
  );
}

/** Route-level error boundary: the shell stays usable while one page fails. */
export function RouteErrorPage({ error, reset }: ErrorComponentProps) {
  return (
    <Page title="Something went wrong">
      <ErrorState
        message="This page failed to load. You can try again, or go to another section."
        onRetry={reset}
        details={error instanceof Error ? (error.stack ?? error.message) : String(error)}
      />
    </Page>
  );
}
