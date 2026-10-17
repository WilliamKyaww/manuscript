import { type FilePreview, filePreviewEndpoint, fileUrl } from '@skb/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import Markdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { Button } from '../../../components/Button';
import { ErrorState, LoadingState } from '../../../components/States';
import { useApi } from '../../../lib/api/context';
import { baseName } from '../tree/buildTree';
import { LayoutPreview } from './LayoutPreview';
import { PdfFrame } from './PdfFrame';

export function FileTab({ path }: { path: string }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const preview = useQuery({
    queryKey: ['file-preview', path],
    queryFn: () => api.request(filePreviewEndpoint, { query: { path } }),
    staleTime: 0,
  });
  const [mode, setMode] = useState<'reading' | 'layout' | 'source'>('reading');
  const [page, setPage] = useState(1);
  const office = /\.(docx?|xlsx)$/i.test(path);
  const source = /\.(csv|json|xml|html)$/i.test(path);
  const url = fileUrl(path);
  return (
    <section
      aria-label={`File preview: ${baseName(path)}`}
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      data-file-preview
    >
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-chrome-line px-3 py-2">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium" title={path}>
          {baseName(path)}
        </h2>
        <span className="text-xs text-muted">Read-only</span>
        {(office || source) && (
          <fieldset aria-label="Preview mode" className="flex gap-1">
            <Button
              size="sm"
              variant={mode === 'reading' ? 'primary' : 'secondary'}
              aria-pressed={mode === 'reading'}
              onClick={() => setMode('reading')}
            >
              Reading
            </Button>
            {office && (
              <Button
                size="sm"
                variant={mode === 'layout' ? 'primary' : 'secondary'}
                aria-pressed={mode === 'layout'}
                onClick={() => setMode('layout')}
              >
                Page layout
              </Button>
            )}
            {source && (
              <Button
                size="sm"
                variant={mode === 'source' ? 'primary' : 'secondary'}
                aria-pressed={mode === 'source'}
                onClick={() => setMode('source')}
              >
                Source
              </Button>
            )}
          </fieldset>
        )}
        <Button
          size="sm"
          onClick={() =>
            mode === 'layout'
              ? void queryClient.invalidateQueries({ queryKey: ['file-layout', path] })
              : void preview.refetch()
          }
        >
          Refresh
        </Button>
        <a
          className="text-sm text-accent underline underline-offset-2"
          href={url}
          download={baseName(path)}
        >
          Download
        </a>
      </header>
      {mode === 'layout' && <LayoutPreview path={path} />}
      {mode !== 'layout' && preview.isPending && <LoadingState label="Opening file" />}
      {mode !== 'layout' && preview.isError && (
        <ErrorState
          title="This file cannot be previewed"
          message={preview.error.message}
          onRetry={() => void preview.refetch()}
        />
      )}
      {mode !== 'layout' && preview.data && (
        <>
          {preview.data.notice && (
            <p className="shrink-0 border-b border-chrome-line px-3 py-2 text-xs text-muted">
              {preview.data.notice}
            </p>
          )}
          {preview.data.kind === 'pdf' ? (
            <PdfFrame url={url} page={page} onNavigate={setPage} loading="Opening PDF" />
          ) : (
            <Reading preview={preview.data} source={mode === 'source'} url={url} />
          )}
        </>
      )}
    </section>
  );
}

function Reading({ preview, source, url }: { preview: FilePreview; source: boolean; url: string }) {
  const [sheet, setSheet] = useState(0);
  const [imageError, setImageError] = useState(false);
  if (source)
    return (
      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-sm">
        {preview.sourceText}
      </pre>
    );
  if (preview.language === 'html')
    return (
      <iframe
        title={`HTML preview: ${baseName(preview.path)}`}
        sandbox=""
        className="min-h-0 w-full flex-1 border-0 bg-white"
        srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">${preview.text}`}
      />
    );
  if (preview.kind === 'image' && imageError)
    return (
      <ErrorState
        message="This image could not be displayed. It may be damaged or use an unsupported encoding. You can still download the original."
        onRetry={() => setImageError(false)}
      />
    );
  if (preview.kind === 'image')
    return (
      <div className="flex-1 overflow-auto p-4">
        <img
          src={url}
          alt={baseName(preview.path)}
          // White behind it: a diagram with a transparent background and dark lines would vanish on a dark theme.
          className="mx-auto max-w-full bg-white"
          onError={() => setImageError(true)}
        />
      </div>
    );
  if (preview.kind === 'unsupported')
    return (
      <p className="p-4 text-sm text-muted">
        A preview is not available for this file type. Download it to open in another application.
      </p>
    );
  if (preview.kind === 'table' && !source) {
    const current = preview.sheets[sheet] ?? preview.sheets[0];
    return (
      <>
        <div className="flex shrink-0 items-center gap-2 border-b border-chrome-line px-3 py-2">
          {preview.sheets.length > 1 && (
            <>
              <label htmlFor={`sheet-${encodeURIComponent(preview.path)}`} className="text-sm">
                Sheet
              </label>
              <select
                id={`sheet-${encodeURIComponent(preview.path)}`}
                className="rounded border border-divider bg-surface px-2 py-1 text-sm"
                value={sheet}
                onChange={(event) => setSheet(Number(event.target.value))}
              >
                {preview.sheets.map((item, index) => (
                  <option key={item.name} value={index}>
                    {item.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <span className="text-xs text-muted">
            {current?.rows.length ?? 0} {current?.rows.length === 1 ? 'row' : 'rows'}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table
            className="w-full border-collapse text-left text-sm tabular-nums"
            aria-label={current?.name ?? 'Data'}
          >
            <tbody>
              {current?.rows.map((row, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: read-only cells are identified by their fixed row/column addresses.
                <tr key={`${index}`} className="border-b border-divider">
                  <th
                    scope="row"
                    className="sticky left-0 w-12 bg-surface px-3 py-2 text-right font-normal text-muted"
                  >
                    {index + 1}
                  </th>
                  {row.map((cell, column) => (
                    <td
                      // biome-ignore lint/suspicious/noArrayIndexKey: a column's position is its spreadsheet address.
                      key={`${column}`}
                      className="max-w-96 whitespace-pre-wrap border-l border-divider px-3 py-2 align-top break-words"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!current?.rows.length && <p className="p-4 text-sm text-muted">This sheet is empty.</p>}
        </div>
      </>
    );
  }
  if (preview.kind === 'document' && !source)
    return (
      <div className="min-h-0 flex-1 overflow-auto p-6">
        <article className="markdown-body mx-auto max-w-prose">
          <Markdown
            remarkPlugins={[remarkGfm]}
            skipHtml
            disallowedElements={['img']}
            components={{ a: ({ children }) => <span>{children}</span> }}
          >
            {preview.text}
          </Markdown>
        </article>
      </div>
    );
  if (preview.kind === 'code' && preview.text.length <= 50_000) {
    const fence = '`'.repeat(
      [...preview.text.matchAll(/`+/g)].reduce(
        (longest, match) => Math.max(longest, match[0].length + 1),
        3,
      ),
    );
    return (
      <div className="markdown-body min-h-0 flex-1 overflow-auto p-4 text-sm">
        <Markdown
          rehypePlugins={[rehypeHighlight]}
        >{`${fence}${preview.language}\n${preview.text}\n${fence}`}</Markdown>
      </div>
    );
  }
  return (
    <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-sm leading-relaxed">
      {preview.text || 'This file is empty.'}
    </pre>
  );
}
