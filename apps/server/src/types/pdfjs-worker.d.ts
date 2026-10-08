// pdf.js ships its worker without type declarations. The server only hands the module to pdf.js
// (as `globalThis.pdfjsWorker`) so that it runs in-process inside the single-file bundle.
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown;
}
