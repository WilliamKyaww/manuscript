import { Check, Copy, ExternalLink, Globe } from 'lucide-react';
import { useEffect, useState } from 'react';
import { IconButton } from '../../../components/IconButton';
import { notifyError } from '../../../lib/notify';
import { displayUrl, openInBrowser } from './external';
import { parseGitHubUrl } from './github';
import { GitHubMark } from './github-mark';

/**
 * The card a web link shows when the pointer rests on it (Phase 26), as in Notion: where it goes,
 * with Copy, Edit (in the editor) and Open in browser. The same card serves the editor and the
 * reading view.
 */

export function LinkCard({ url, onEdit }: { url: string; onEdit?: () => void }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  const github = parseGitHubUrl(url);
  const copy = () => navigator.clipboard.writeText(url).then(() => setCopied(true), notifyError);
  return (
    <div
      data-link-card
      className="flex max-w-[min(30rem,calc(100vw-2rem))] items-center gap-1 rounded-lg border border-border bg-surface-raised py-1 pr-1 pl-2.5 text-sm shadow-md"
    >
      <span aria-hidden="true" className="flex shrink-0 text-subtle">
        {github ? <GitHubMark size={13} /> : <Globe size={13} />}
      </span>
      <span title={url} className="min-w-0 flex-1 truncate px-1 text-muted select-text">
        {displayUrl(url)}
      </span>
      <IconButton
        label={copied ? 'Copied' : 'Copy link'}
        icon={copied ? <Check size={14} /> : <Copy size={14} />}
        size="sm"
        tooltip={false}
        title={copied ? 'Copied' : 'Copy link'}
        onClick={() => void copy()}
      />
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="h-7 shrink-0 rounded-md px-2 text-sm font-medium text-muted hover:bg-surface-hover hover:text-text focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
        >
          Edit
        </button>
      )}
      <IconButton
        label="Open in browser"
        icon={<ExternalLink size={14} />}
        size="sm"
        tooltip={false}
        title="Open in browser (Ctrl+click)"
        onClick={() => openInBrowser(url)}
      />
    </div>
  );
}
