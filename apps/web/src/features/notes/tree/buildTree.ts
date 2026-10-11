/**
 * The vault as a folder tree for the file tree view, built from the flat lists the server sends.
 * Folders come first; names sort naturally ("Week 2" before "Week 10") in British English order.
 * Files sort in one of Obsidian's six orders (task 23.02); folders always sort by name, reversed
 * only for "Z to A", as in Obsidian.
 */

export type SortOrder =
  | 'name-asc'
  | 'name-desc'
  | 'modified-desc'
  | 'modified-asc'
  | 'created-desc'
  | 'created-asc';

export const SORT_ORDERS: readonly { value: SortOrder; label: string }[] = [
  { value: 'name-asc', label: 'File name (A to Z)' },
  { value: 'name-desc', label: 'File name (Z to A)' },
  { value: 'modified-desc', label: 'Modified time (new to old)' },
  { value: 'modified-asc', label: 'Modified time (old to new)' },
  { value: 'created-desc', label: 'Created time (new to old)' },
  { value: 'created-asc', label: 'Created time (old to new)' },
];

export interface FolderNode {
  kind: 'folder';
  path: string;
  name: string;
  children: TreeNode[];
}

export interface NoteNode {
  kind: 'note';
  path: string;
  /** File name without `.md` — what the user manages and what wikilinks use. */
  name: string;
  id: string;
  title: string;
  /** Milliseconds since the epoch (0 when unknown), for sorting. */
  modified: number;
  created: number;
}

export interface AttachmentNode {
  kind: 'attachment';
  path: string;
  name: string;
  mediaType: string;
  modified: number;
  created: number;
}

export type TreeNode = FolderNode | NoteNode | AttachmentNode;

export interface VisibleNode {
  node: TreeNode;
  depth: number;
  /** Position among its siblings (1-based) and their number, for aria-posinset/aria-setsize. */
  position: number;
  siblings: number;
}

const collator = new Intl.Collator('en-GB', { numeric: true, sensitivity: 'base' });

export function parentOf(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Every folder that contains `path`, outermost first. */
export function ancestorsOf(path: string): string[] {
  const result: string[] = [];
  for (let parent = parentOf(path); parent !== ''; parent = parentOf(parent))
    result.unshift(parent);
  return result;
}

const byName = (a: TreeNode, b: TreeNode) =>
  collator.compare(a.name, b.name) || collator.compare(a.path, b.path);

function compareFor(sort: SortOrder): (a: TreeNode, b: TreeNode) => number {
  const time = (node: TreeNode, field: 'modified' | 'created') =>
    node.kind === 'folder' ? 0 : node[field];
  return (a, b) => {
    if ((a.kind === 'folder') !== (b.kind === 'folder')) return a.kind === 'folder' ? -1 : 1;
    if (a.kind === 'folder' || sort === 'name-asc')
      return sort === 'name-desc' ? byName(b, a) : byName(a, b);
    switch (sort) {
      case 'name-desc':
        return byName(b, a);
      case 'modified-desc':
        return time(b, 'modified') - time(a, 'modified') || byName(a, b);
      case 'modified-asc':
        return time(a, 'modified') - time(b, 'modified') || byName(a, b);
      case 'created-desc':
        return time(b, 'created') - time(a, 'created') || byName(a, b);
      case 'created-asc':
        return time(a, 'created') - time(b, 'created') || byName(a, b);
    }
  };
}

function sortChildren(folder: FolderNode, compare: (a: TreeNode, b: TreeNode) => number): void {
  folder.children.sort(compare);
  for (const child of folder.children) if (child.kind === 'folder') sortChildren(child, compare);
}

const millis = (iso: string | undefined) => {
  const value = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(value) ? 0 : value;
};

/** The parts of the server's note tree that the view needs. */
export interface TreeSource {
  notes: readonly {
    id: string;
    path: string;
    title: string;
    updatedAt?: string;
    createdAt?: string;
  }[];
  folders: readonly string[];
  attachments: readonly { path: string; mediaType: string; updatedAt?: string }[];
}

export function buildTree(
  data: TreeSource,
  options: { attachments: boolean; sort?: SortOrder },
): FolderNode {
  const root: FolderNode = { kind: 'folder', path: '', name: '', children: [] };
  const folders = new Map<string, FolderNode>([['', root]]);
  const folderAt = (path: string): FolderNode => {
    const existing = folders.get(path);
    if (existing) return existing;
    const node: FolderNode = { kind: 'folder', path, name: baseName(path), children: [] };
    folders.set(path, node);
    folderAt(parentOf(path)).children.push(node);
    return node;
  };
  for (const folder of data.folders) folderAt(folder);
  for (const note of data.notes) {
    folderAt(parentOf(note.path)).children.push({
      kind: 'note',
      path: note.path,
      name: baseName(note.path).replace(/\.md$/i, ''),
      id: note.id,
      title: note.title,
      modified: millis(note.updatedAt),
      created: millis(note.createdAt ?? note.updatedAt),
    });
  }
  if (options.attachments) {
    for (const attachment of data.attachments) {
      folderAt(parentOf(attachment.path)).children.push({
        kind: 'attachment',
        path: attachment.path,
        name: baseName(attachment.path),
        mediaType: attachment.mediaType,
        // The server knows only when an attachment last changed.
        modified: millis(attachment.updatedAt),
        created: millis(attachment.updatedAt),
      });
    }
  }
  sortChildren(root, compareFor(options.sort ?? 'name-asc'));
  return root;
}

/** The rows a tree view shows: children of expanded folders, depth first. */
export function visibleNodes(root: FolderNode, expanded: ReadonlySet<string>): VisibleNode[] {
  const rows: VisibleNode[] = [];
  const walk = (folder: FolderNode, depth: number) => {
    folder.children.forEach((node, index) => {
      rows.push({ node, depth, position: index + 1, siblings: folder.children.length });
      if (node.kind === 'folder' && expanded.has(node.path)) walk(node, depth + 1);
    });
  };
  walk(root, 1);
  return rows;
}
