import { noteNameFromPath } from '@skb/core/markdown';
import { ancestorsOf } from '../tree/buildTree';

/**
 * Folder / … / note above a note, as Obsidian shows it (task 23.04); a folder reveals itself in the
 * file tree. In a narrow pane the folders give way before the note's own name.
 */
export function NoteBreadcrumb({
  path,
  onFolder,
}: {
  path: string;
  onFolder(folder: string): void;
}) {
  const folders = ancestorsOf(path);
  return (
    <nav aria-label="Location" className="flex min-w-0 items-baseline text-sm whitespace-nowrap">
      {folders.length > 0 && (
        <>
          <span className="min-w-0 shrink-[4] truncate text-muted">
            {folders.map((folder, index) => (
              <span key={folder}>
                {index > 0 && (
                  <span aria-hidden="true" className="px-1 text-subtle">
                    /
                  </span>
                )}
                <button
                  type="button"
                  className="rounded-sm hover:text-text hover:underline"
                  onClick={() => onFolder(folder)}
                >
                  {folder.slice(folder.lastIndexOf('/') + 1)}
                </button>
              </span>
            ))}
          </span>
          {/* Outside the part that shortens, so the folders never run into the note's name. */}
          <span aria-hidden="true" className="shrink-0 px-1 text-subtle">
            /
          </span>
        </>
      )}
      <span aria-current="page" className="min-w-0 truncate font-medium">
        {noteNameFromPath(path)}
      </span>
    </nav>
  );
}
