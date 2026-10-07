/**
 * The vault as a folder tree for the file tree view, built from the flat lists the server sends.
 * Folders come first; names sort naturally ("Week 2" before "Week 10") in British English order.
 */

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
}

export interface AttachmentNode {
  kind: 'attachment';
  path: string;
  name: string;
  mediaType: string;
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

function sortChildren(folder: FolderNode): void {
  folder.children.sort((a, b) => {
    if ((a.kind === 'folder') !== (b.kind === 'folder')) return a.kind === 'folder' ? -1 : 1;
    return collator.compare(a.name, b.name) || collator.compare(a.path, b.path);
  });
  for (const child of folder.children) if (child.kind === 'folder') sortChildren(child);
}

/** The parts of the server's note tree that the view needs. */
export interface TreeSource {
  notes: readonly { id: string; path: string; title: string }[];
  folders: readonly string[];
  attachments: readonly { path: string; mediaType: string }[];
}

export function buildTree(data: TreeSource, options: { attachments: boolean }): FolderNode {
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
    });
  }
  if (options.attachments) {
    for (const attachment of data.attachments) {
      folderAt(parentOf(attachment.path)).children.push({
        kind: 'attachment',
        path: attachment.path,
        name: baseName(attachment.path),
        mediaType: attachment.mediaType,
      });
    }
  }
  sortChildren(root);
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
