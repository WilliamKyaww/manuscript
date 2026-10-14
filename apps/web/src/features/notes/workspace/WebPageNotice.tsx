import { Button } from '../../../components/Button';
import type { DesktopWebIssue } from '../../../lib/desktop';

/** This sits above the native view: an HTTP error can itself contain an interactive challenge. */
export function WebPageNotice({
  issue,
  onRetry,
  onOpen,
}: {
  issue: DesktopWebIssue;
  onRetry(): void;
  onOpen(): void;
}) {
  const message =
    issue.kind === 'http'
      ? issue.code === 401 || issue.code === 403
        ? 'This site has restricted access. Complete any verification shown below, or try your system browser.'
        : `The site returned an error. Its response is shown below; you can try again or use your system browser.`
      : issue.kind === 'crash'
        ? 'This web page stopped unexpectedly. Try loading it again, or open it in your system browser.'
        : 'This web page could not be loaded. Check your connection, try again, or open it in your system browser.';
  const detail =
    issue.kind === 'http'
      ? `HTTP ${issue.code}`
      : issue.kind === 'crash'
        ? `Renderer exit code: ${issue.code}`
        : `Network error: ${issue.code}`;
  return (
    <div
      data-web-page-notice
      role="status"
      className="flex-none border-b border-chrome-line bg-surface px-3 py-2 text-sm"
    >
      <p className="text-muted">{message}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
        <Button size="sm" variant="ghost" onClick={onOpen}>
          Open in system browser
        </Button>
        <span className="text-xs text-subtle">{detail}</span>
      </div>
    </div>
  );
}
