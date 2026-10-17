import { Worker } from 'node:worker_threads';
import { ValidationError } from '@skb/core';
import { z } from 'zod';

let active = 0;
export async function legacyWord(bytes: Uint8Array): Promise<string> {
  if (Buffer.from(bytes.subarray(0, 8)).toString('hex') !== 'd0cf11e0a1b11ae1')
    throw new ValidationError('This is not a supported binary Word document.');
  if (active >= 2)
    throw new ValidationError('Two Word previews are opening. Please try again shortly.');
  active++;
  try {
    return await new Promise<string>((resolve, reject) => {
      let settled = false;
      const worker = new Worker(new URL('./file-preview-worker.mjs', import.meta.url), {
        workerData: bytes,
        execArgv: [],
        resourceLimits: { maxOldGenerationSizeMb: 64 },
      });
      const finish = (error: string | null, text = '') => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        void worker.terminate();
        if (error) reject(new ValidationError(error));
        else resolve(text);
      };
      const timer = setTimeout(
        () => finish('This Word file took too long to preview. Open the original instead.'),
        5000,
      );
      worker.once('message', (value: unknown) => {
        const parsed = z
          .object({ text: z.string().max(500_000).optional(), error: z.string().optional() })
          .safeParse(value);
        if (!parsed.success) finish('The Word preview could not be read.');
        else finish(parsed.data.error ?? null, parsed.data.text ?? '');
      });
      worker.once('error', () => finish('The Word preview could not be read.'));
      worker.once('exit', (code) => {
        if (code !== 0) finish('The Word preview stopped before it finished.');
      });
    });
  } finally {
    active--;
  }
}
