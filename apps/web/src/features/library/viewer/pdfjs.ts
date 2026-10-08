import { GlobalWorkerOptions, getDocument, TextLayer } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/**
 * pdf.js in the browser (ADR-0019): the standard build with its worker as a separate same-origin
 * script (allowed by the CSP's `worker-src 'self'`). Character maps, standard fonts and image
 * decoders are served under `/pdfjs/` (see `pdfjsAssets` in vite.config.ts) so PDFs that rely on
 * them — CJK text, non-embedded fonts, JPEG 2000 images — render correctly, offline.
 */

GlobalWorkerOptions.workerSrc = workerUrl;

const ASSETS = '/pdfjs/';

export function openPdf(url: string) {
  return getDocument({
    url,
    cMapUrl: `${ASSETS}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${ASSETS}standard_fonts/`,
    wasmUrl: `${ASSETS}wasm/`,
    enableXfa: false,
  });
}

export type PdfDocument = Awaited<ReturnType<typeof openPdf>['promise']>;
export type PdfPage = Awaited<ReturnType<PdfDocument['getPage']>>;

export { TextLayer };
