import { find, parseXml, textContent } from './xml';

/** Shared bits of the Office Open XML formats. */

/** The document title from `docProps/core.xml` (`dc:title`), if it has one. */
export function coreTitle(xml: string | null): string | null {
  if (!xml) return null;
  try {
    const title = find(parseXml(xml, 'document properties'), 'title');
    const text = title ? textContent(title).replace(/\s+/g, ' ').trim() : '';
    return text === '' ? null : text.slice(0, 500);
  } catch {
    // Properties are optional; a broken properties part must not fail the import.
    return null;
  }
}
