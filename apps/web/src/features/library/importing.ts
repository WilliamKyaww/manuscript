import { type DragEvent, useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { describeError, notifySuccess } from '../../lib/notify';
import { useImportSource } from './api';

/**
 * Importing files into the library (task 5.17): one upload at a time, so a long batch shows steady
 * progress and one bad file cannot stop the rest; the outcome is summarised in a toast.
 */

export interface ImportProgress {
  done: number;
  total: number;
}

export function useImportFiles() {
  const importSource = useImportSource();
  const [progress, setProgress] = useState<ImportProgress | null>(null);

  const importFiles = useCallback(
    async (files: readonly File[], moduleCode: string | null) => {
      if (files.length === 0) return;
      setProgress({ done: 0, total: files.length });
      const imported: string[] = [];
      const duplicates: string[] = [];
      const failures: string[] = [];
      for (const [index, file] of files.entries()) {
        try {
          const result = await importSource.mutateAsync({ file, moduleCode });
          (result.duplicate ? duplicates : imported).push(result.source.title);
        } catch (error) {
          failures.push(`${file.name}: ${describeError(error).description}`);
        }
        setProgress({ done: index + 1, total: files.length });
      }
      setProgress(null);
      if (imported.length > 0) {
        notifySuccess(
          imported.length === 1
            ? `Importing “${imported[0]}”`
            : `Importing ${imported.length} files`,
          'The text is extracted in the background; you can keep working.',
        );
      }
      if (duplicates.length > 0) {
        toast.info(
          duplicates.length === 1
            ? `“${duplicates[0]}” is already in the library`
            : `${duplicates.length} files are already in the library`,
        );
      }
      if (failures.length > 0) {
        toast.error(
          failures.length === 1
            ? 'A file was not imported'
            : `${failures.length} files were not imported`,
          { description: failures.join('\n') },
        );
      }
    },
    [importSource],
  );

  return { importFiles, progress };
}

const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes('Files');

/** Drag-and-drop of files onto an element; ignores drags of text or links. */
export function useFileDrop(onFiles: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);
  // dragenter/dragleave fire for every child element; count them to know when the drag really left.
  const depth = useRef(0);
  return {
    dragging,
    props: {
      onDragEnter(event: DragEvent) {
        if (!hasFiles(event)) return;
        event.preventDefault();
        depth.current += 1;
        setDragging(true);
      },
      onDragOver(event: DragEvent) {
        if (!hasFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      },
      onDragLeave(event: DragEvent) {
        if (!hasFiles(event)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      },
      onDrop(event: DragEvent) {
        if (!hasFiles(event)) return;
        event.preventDefault();
        depth.current = 0;
        setDragging(false);
        onFiles([...event.dataTransfer.files]);
      },
    },
  };
}
