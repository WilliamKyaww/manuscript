import type { Locator, SourceKind } from '@skb/core';

/**
 * Deep links into the source viewer (`/library/<id>?page=12`). Every locator maps to search
 * parameters, so a search hit or (later) a citation opens the original exactly where the text is.
 */

export interface ViewerSearch {
  /** PDF page. */
  page?: number;
  /** Slide number. */
  slide?: number;
  /** Show the slide's speaker notes. */
  notes?: boolean;
  /** Section ordinal (documents and text). */
  section?: number;
  /** Seconds into a recording. */
  t?: number;
}

const positive = (value: unknown): number | undefined => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
};

export function validateViewerSearch(search: Record<string, unknown>): ViewerSearch {
  const result: ViewerSearch = {};
  const page = positive(search.page);
  const slide = positive(search.slide);
  const section = Number(search.section);
  if (page) result.page = page;
  if (slide) result.slide = slide;
  if (
    search.notes === true ||
    search.notes === 'true' ||
    search.notes === 1 ||
    search.notes === '1'
  )
    result.notes = true;
  if (Number.isInteger(section) && section >= 0) result.section = section;
  const time = Number(search.t);
  if (search.t !== undefined && Number.isFinite(time) && time >= 0) result.t = Math.floor(time);
  return result;
}

export function viewerSearchFor(locator: Locator, sectionOrdinal: number): ViewerSearch {
  switch (locator.kind) {
    case 'pdf':
      return { page: locator.page };
    case 'slides':
      return locator.part === 'notes'
        ? { slide: locator.slide, notes: true }
        : { slide: locator.slide };
    case 'media':
      return { t: Math.floor(locator.startMs / 1000) };
    default:
      return { section: sectionOrdinal };
  }
}

/**
 * An address for a locator kept without its section (a flashcard's source): PDF pages and slides
 * open where they were; other sources open at the start; a note opens at its line.
 */
export function locatorHref(locator: Locator): string {
  if ('noteId' in locator && locator.noteId) {
    const line = 'line' in locator && locator.line ? `?line=${locator.line}` : '';
    return `/notes/${locator.noteId}${line}`;
  }
  const sourceId = 'sourceId' in locator ? locator.sourceId : '';
  const search = new URLSearchParams();
  if (locator.kind === 'pdf') search.set('page', String(locator.page));
  if (locator.kind === 'slides') {
    search.set('slide', String(locator.slide));
    if (locator.part === 'notes') search.set('notes', '1');
  }
  if (locator.kind === 'media') search.set('t', String(Math.floor(locator.startMs / 1000)));
  const query = search.toString();
  return `/library/${sourceId}${query ? `?${query}` : ''}`;
}

export const KIND_LABELS: Record<SourceKind, string> = {
  pdf: 'PDF',
  pptx: 'Slides',
  docx: 'Word document',
  markdown: 'Markdown',
  text: 'Text',
  url: 'Web page',
  audio: 'Audio',
  video: 'Video',
  image: 'Image',
};
