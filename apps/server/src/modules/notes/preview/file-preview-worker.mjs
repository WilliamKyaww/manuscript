import { parentPort, workerData } from 'node:worker_threads';
import WordExtractor from 'word-extractor';

// Legacy OLE parsing stays off the server thread, with a parent-enforced deadline and memory limit.
try {
  const document = await new WordExtractor().extract(Buffer.from(workerData));
  parentPort.postMessage({ text: document.getBody().slice(0, 500_000) });
} catch {
  parentPort.postMessage({ error: 'This Word file is damaged, encrypted or unsupported.' });
}
