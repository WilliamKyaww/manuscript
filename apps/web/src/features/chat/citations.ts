import { CITATION, type Passage } from '@skb/core';
import { locatorHref } from '../library/links';

const escapeTitle = (text: string) => text.replaceAll('"', "'").replace(/\s+/gu, ' ');

/** Turns `[S1, S3]` into links that open each passage where it is (a page, slide or line). */
export function withCitationLinks(text: string, passages: readonly Passage[]): string {
  const byKey = new Map(passages.map((passage) => [passage.key, passage]));
  return text.replace(CITATION, (match, inner: string) => {
    const links = inner.split(/\s*[,;]\s*/u).map((key) => {
      const passage = byKey.get(key);
      if (!passage) return `[${key}]`;
      const title = escapeTitle(`${passage.title}${passage.label ? ` · ${passage.label}` : ''}`);
      return `[[${key}]](${locatorHref(passage.locator)} "${title}")`;
    });
    return links.length ? links.join(' ') : match;
  });
}
