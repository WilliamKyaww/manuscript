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
    default:
      return { section: sectionOrdinal };
  }
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
