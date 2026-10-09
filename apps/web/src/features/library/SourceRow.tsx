import { fileUrl, type SourceKind, type SourceSummary } from '@skb/core';
import { Link } from '@tanstack/react-router';
import {
  Download,
  File,
  FileCode,
  FileText,
  FileType,
  Image,
  MoreHorizontal,
  Music,
  Presentation,
  RotateCcw,
  Trash2,
  TriangleAlert,
  Video,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge, type BadgeTone } from '../../components/Badge';
import { Button } from '../../components/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/DropdownMenu';
import { IconButton } from '../../components/IconButton';
import { ProgressBar } from '../../components/ProgressBar';
import { formatBytes, formatDateTime } from '../../lib/format';
import { KIND_LABELS } from './links';

const ICONS: Partial<Record<SourceKind, ReactNode>> = {
  pdf: <FileText size={18} />,
  pptx: <Presentation size={18} />,
  docx: <FileType size={18} />,
  markdown: <FileCode size={18} />,
  audio: <Music size={18} />,
  video: <Video size={18} />,
  image: <Image size={18} />,
};

export function SourceIcon({ kind }: { kind: SourceKind }) {
  return <>{ICONS[kind] ?? <File size={18} />}</>;
}

const STATUS: Record<SourceSummary['status'], { label: string; tone: BadgeTone }> = {
  pending: { label: 'Waiting', tone: 'neutral' },
  processing: { label: 'Importing', tone: 'info' },
  ready: { label: 'Ready', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
};

/** "40 slides · 5.2 MB" */
function details(source: SourceSummary): string {
  const parts = [KIND_LABELS[source.kind]];
  if (source.pageCount !== null) {
    const unit = source.kind === 'pptx' ? 'slide' : 'page';
    parts.push(`${source.pageCount} ${unit}${source.pageCount === 1 ? '' : 's'}`);
  }
  parts.push(formatBytes(source.sizeBytes));
  return parts.join(' · ');
}

export function SourceStatus({ source }: { source: SourceSummary }) {
  if (source.missing) return <Badge tone="warning">File missing</Badge>;
  const status = STATUS[source.status];
  return <Badge tone={status.tone}>{status.label}</Badge>;
}

/** Progress of an import that is waiting or running. */
export function ImportProgress({ source }: { source: SourceSummary }) {
  if (source.status !== 'pending' && source.status !== 'processing') return null;
  const job = source.job;
  const retrying = job?.status === 'queued' && job.attempts > 0;
  const label = retrying
    ? 'Trying again shortly'
    : (job?.message ?? (job?.status === 'running' ? 'Importing' : 'Waiting to start'));
  return (
    <ProgressBar
      value={job?.status === 'running' ? job.progress : null}
      label={label}
      className="mt-2 max-w-md"
    />
  );
}

export function SourceRow({
  source,
  onRetry,
  onDelete,
  retrying,
}: {
  source: SourceSummary;
  onRetry(): void;
  onDelete(): void;
  retrying: boolean;
}) {
  const name = source.title;
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border bg-surface p-3">
      <span aria-hidden="true" className="mt-0.5 text-muted">
        <SourceIcon kind={source.kind} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            to="/library/$sourceId"
            params={{ sourceId: source.id }}
            className="truncate font-medium hover:underline focus-visible:outline-2 focus-visible:outline-focus"
          >
            {name}
          </Link>
          <SourceStatus source={source} />
        </div>
        <p className="mt-0.5 truncate text-xs text-muted">
          {details(source)} · added {formatDateTime(new Date(source.createdAt))}
        </p>
        <ImportProgress source={source} />
        {source.status === 'failed' && !source.missing && (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="text-sm text-danger">{source.error ?? 'The import failed.'}</p>
            <Button size="sm" onClick={onRetry} loading={retrying}>
              Retry
            </Button>
          </div>
        )}
        {source.missing && (
          <p className="mt-2 text-sm text-warning">
            The original is no longer at “{source.path}”. Put it back (or move it anywhere inside
            Sources) and it is found again; or delete this source.
          </p>
        )}
        {source.status === 'ready' && source.warnings.length > 0 && (
          <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted">
            <TriangleAlert aria-hidden="true" size={13} className="mt-px shrink-0 text-warning" />
            <span>{source.warnings.map((warning) => warning.message).join(' ')}</span>
          </p>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            label={`Actions for ${name}`}
            icon={<MoreHorizontal size={16} />}
            size="sm"
            tooltip={false}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            icon={<Download size={14} />}
            disabled={source.missing}
            onSelect={() => window.open(fileUrl(source.path), '_blank', 'noopener')}
          >
            Open the original file
          </DropdownMenuItem>
          <DropdownMenuItem
            icon={<RotateCcw size={14} />}
            disabled={source.missing}
            onSelect={onRetry}
          >
            Import again
          </DropdownMenuItem>
          <DropdownMenuItem icon={<Trash2 size={14} />} tone="danger" onSelect={onDelete}>
            Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
