import { XMLParser } from 'fast-xml-parser';
import { SourceParseError } from './errors';

/**
 * A small, safe XML tree for reading Office parts. Document type declarations are refused outright
 * (OOXML never uses them), which rules out entity-expansion attacks; the five XML entities and
 * numeric character references are decoded here in one pass so `&amp;#38;` stays literal.
 * Element names keep their namespace prefix; helpers match on the local name, because prefixes
 * are conventional rather than guaranteed.
 */

export interface XmlElement {
  name: string;
  attributes: Readonly<Record<string, string>>;
  children: XmlNode[];
}
export type XmlNode = XmlElement | string;

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  processEntities: false,
  htmlEntities: false,
  ignoreDeclaration: true,
  ignorePiTags: true,
  maxNestedTags: 256,
});

const NAMED: Readonly<Record<string, string>> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
};

export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(
    /&(#\d{1,7}|#x[0-9a-fA-F]{1,6}|lt|gt|amp|quot|apos);/g,
    (whole, entity: string) => {
      if (!entity.startsWith('#')) return NAMED[entity] ?? whole;
      const code =
        entity[1] === 'x' ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    },
  );
}

type Ordered = Record<string, unknown>;

function convert(items: unknown): XmlNode[] {
  if (!Array.isArray(items)) return [];
  const nodes: XmlNode[] = [];
  for (const item of items as Ordered[]) {
    for (const [key, value] of Object.entries(item)) {
      if (key === ':@') continue;
      if (key === '#text') {
        nodes.push(decodeEntities(String(value)));
        continue;
      }
      const raw = (item[':@'] ?? {}) as Record<string, unknown>;
      const attributes: Record<string, string> = {};
      for (const [name, attribute] of Object.entries(raw))
        attributes[name] = decodeEntities(String(attribute));
      nodes.push({ name: key, attributes, children: convert(value) });
    }
  }
  return nodes;
}

/** Parses a document into a synthetic root element whose children are the top-level nodes. */
export function parseXml(xml: string, description: string): XmlElement {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new SourceParseError(
      `The ${description} contains a document type declaration, which is not allowed.`,
    );
  }
  try {
    return { name: '#root', attributes: {}, children: convert(parser.parse(xml)) };
  } catch (error) {
    throw new SourceParseError(`The ${description} is damaged (its XML could not be read).`, {
      cause: error,
    });
  }
}

export function localName(name: string): string {
  return name.slice(name.indexOf(':') + 1);
}

export function isElement(node: XmlNode | undefined): node is XmlElement {
  return typeof node === 'object' && node !== null;
}

export function elements(node: XmlElement, name?: string): XmlElement[] {
  return node.children.filter(
    (child): child is XmlElement => isElement(child) && (!name || localName(child.name) === name),
  );
}

export function child(node: XmlElement | undefined, name: string): XmlElement | undefined {
  return node ? elements(node, name)[0] : undefined;
}

/** Follows a path of local names, e.g. `path(slide, 'cSld', 'spTree')`. */
export function path(node: XmlElement | undefined, ...names: string[]): XmlElement | undefined {
  let current = node;
  for (const name of names) current = child(current, name);
  return current;
}

/** First descendant (depth first, document order) with this local name. */
export function find(node: XmlElement, name: string): XmlElement | undefined {
  for (const childNode of node.children) {
    if (!isElement(childNode)) continue;
    if (localName(childNode.name) === name) return childNode;
    const found = find(childNode, name);
    if (found) return found;
  }
  return undefined;
}

/** Every descendant with this local name, in document order (not descending into matches). */
export function findAll(node: XmlElement, name: string, into: XmlElement[] = []): XmlElement[] {
  for (const childNode of node.children) {
    if (!isElement(childNode)) continue;
    if (localName(childNode.name) === name) into.push(childNode);
    else findAll(childNode, name, into);
  }
  return into;
}

/** An attribute by local name (`r:id` is found as `id` only when no unprefixed `id` exists). */
export function attribute(node: XmlElement | undefined, name: string): string | undefined {
  if (!node) return undefined;
  if (name in node.attributes) return node.attributes[name];
  for (const [key, value] of Object.entries(node.attributes)) {
    if (key.includes(':') && localName(key) === localName(name)) return value;
  }
  return undefined;
}

/** All text below a node, in document order. */
export function textContent(node: XmlNode): string {
  if (!isElement(node)) return node;
  return node.children.map(textContent).join('');
}
