import { ProblemDetailsSchema } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useState } from 'react';
import { ErrorState, LoadingState } from '../../../components/States';

const PdfViewer = lazy(() => import('../../library/viewer/PdfViewer'));
export function LayoutPreview({ path }: { path: string }) {
  const [page, setPage] = useState(1);
  const pdf = useQuery({
    queryKey: ['file-layout', path],
    retry: false,
    gcTime: 0,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/file-layout?path=${encodeURIComponent(path)}`, { signal });
      if (!response.ok) {
        const problem = ProblemDetailsSchema.safeParse(await response.json());
        throw new Error(
          problem.success ? problem.data.detail : 'Page layout could not be prepared.',
        );
      }
      return new Uint8Array(await response.arrayBuffer());
    },
  });
  if (pdf.isError)
    return <ErrorState message={pdf.error.message} onRetry={() => void pdf.refetch()} />;
  return (
    <Suspense fallback={<LoadingState label="Preparing page layout" />}>
      {pdf.data ? (
        <PdfViewer url={pdf.data} page={page} onNavigate={setPage} />
      ) : (
        <LoadingState label="Preparing page layout with LibreOffice" />
      )}
    </Suspense>
  );
}
