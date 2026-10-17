import { lazy, Suspense } from 'react';
import { LoadingState } from '../../../components/States';

const PdfViewer = lazy(() => import('../../library/viewer/PdfViewer'));

/**
 * The PDF viewer is a thumbnail pane and a pages pane that are each as tall as their parent, made
 * for a row (the source page gives it one). Left in a column they stack at twice the height and
 * push the file's own header out of view.
 */
export function PdfFrame({
  url,
  page,
  onNavigate,
  loading,
}: {
  url: string | Uint8Array;
  page: number;
  onNavigate(page: number): void;
  loading: string;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1" data-pdf-frame>
      <Suspense fallback={<LoadingState label={loading} />}>
        <PdfViewer url={url} page={page} onNavigate={onNavigate} />
      </Suspense>
    </div>
  );
}
