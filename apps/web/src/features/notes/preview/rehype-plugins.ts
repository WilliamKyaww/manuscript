import GithubSlugger from 'github-slugger';
import type { Element, ElementContent, Root } from 'hast';
import { defaultSchema, type Options as SanitizeSchema } from 'rehype-sanitize';
import { visit } from 'unist-util-visit';

/**
 * Sanitisation for note previews. Notes may contain raw HTML (Obsidian allows it), so everything is
 * filtered through GitHub's schema: no scripts, event handlers, iframes, forms or inline styles.
 * Added on top: highlights, foldable callouts, image sizes, maths and code classes, and the data
 * attributes our own Markdown extensions use.
 */
const defaults = defaultSchema.attributes ?? {};

/**
 * Classes notes may carry: the ones our Markdown extensions, GFM, footnotes and maths produce. Other
 * classes are dropped, so raw HTML cannot borrow the app's own (utility) classes to restyle the page.
 */
const CLASS_NAMES =
  /^(wikilink|internal-link|tag$|callout|embed|external-image|task-list-item|contains-task-list|footnotes$|data-footnote-backref$|sr-only$|language-|math-|table-wrapper$)/;

type AttributeList = NonNullable<SanitizeSchema['attributes']>[string];

/** An element's allowed attributes, with `className` limited to `CLASS_NAMES`. */
function withClasses(list: AttributeList | undefined): AttributeList {
  const others = (list ?? []).filter(
    (entry) => (Array.isArray(entry) ? entry[0] : entry) !== 'className',
  );
  return [...others, ['className', CLASS_NAMES]];
}

const OUR_DATA_ATTRIBUTES = [
  'dataNoteId',
  'dataConceptId',
  'dataUnresolved',
  'dataFile',
  'dataTag',
  'dataCallout',
  'dataEmbed',
  'dataEmbedId',
  'dataEmbedHeading',
  'dataEmbedPath',
  'dataEmbedMediaType',
  'dataEmbedFragment',
  'dataEmbedTarget',
];

export const sanitizeSchema: SanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'mark', 'details', 'summary', 'u', 'abbr'],
  attributes: {
    ...Object.fromEntries(Object.entries(defaults).map(([tag, list]) => [tag, withClasses(list)])),
    '*': [...withClasses(defaults['*']), ...OUR_DATA_ATTRIBUTES],
    details: [...withClasses(defaults.details), 'open'],
    img: [...withClasses(defaults.img), 'width', 'height'],
    // Code classes name the language (for highlighting) or mark maths (for KaTeX).
    code: [['className', /^language-./, 'math-inline', 'math-display']],
  },
};

function textOf(node: Element | ElementContent): string {
  if (node.type === 'text') return node.value;
  if (node.type === 'element') return node.children.map(textOf).join('');
  return '';
}

/**
 * Gives headings GitHub-style ids (the same slugs the outline and `[[Note#Heading]]` links use).
 * Runs after sanitisation, which would otherwise prefix the ids.
 */
export function rehypeHeadingIds() {
  return (tree: Root) => {
    const slugger = new GithubSlugger();
    visit(tree, 'element', (node) => {
      if (/^h[1-6]$/.test(node.tagName) && !node.properties.id) {
        node.properties.id = slugger.slug(textOf(node));
      }
    });
  };
}
