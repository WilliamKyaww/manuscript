import { ProblemDetailsSchema } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorState, LoadingState } from '../../../components/States';
import { PdfFrame } from './PdfFrame';

export function LayoutPreview({ path }: { path: string }) {
  const [page, setPage] = useState(1);
  const pdf = useQuery({
    queryKey: ['file-layout', path],
    retry: false,
    gcTime: 0,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/file-layout?path=${encodeURIComponent(path)}`, { signal });
      if (!response.ok) {
        const problem = ProblemDetailsSchema.safeParse(await response.json().catch(() => null));
        throw new Error(
          problem.success ? problem.data.detail : 'Page layout could not be prepared.',
        );
      }
      return new Uint8Array(await response.arrayBuffer());
    },
  });
  if (pdf.isError)
    return (
      <ErrorState
        title="Page layout is not available"
        message={pdf.error.message}
        onRetry={() => void pdf.refetch()}
      />
    );
  if (!pdf.data) return <LoadingState label="Preparing page layout with LibreOffice" />;
  return (
    <PdfFrame url={pdf.data} page={page} onNavigate={setPage} loading="Preparing page layout" />
  );
}
