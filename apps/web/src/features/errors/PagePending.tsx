import { Spinner } from '../../components/Spinner';

/**
 * Shown while a page's code is loading (routes are split into chunks). Only appears after a short
 * delay, and deliberately has no page title so focus management waits for the real page.
 */
export function PagePending() {
  return (
    <div className="flex flex-1 items-center justify-center text-muted">
      <Spinner size="lg" label="Loading page" />
    </div>
  );
}
