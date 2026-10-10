import type {
  LanguageModelV4Content,
  LanguageModelV4FinishReason,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';

/**
 * A language model's finished reply as the stream it would have produced, so the test models can
 * stream like a real one: text word by word, tool calls whole, then the finish.
 */
export function streamOf(
  content: readonly LanguageModelV4Content[],
  finishReason: LanguageModelV4FinishReason,
  usage: LanguageModelV4Usage,
): ReadableStream<LanguageModelV4StreamPart> {
  const parts: LanguageModelV4StreamPart[] = [{ type: 'stream-start', warnings: [] }];
  content.forEach((item, index) => {
    if (item.type === 'text') {
      const id = `text-${index}`;
      parts.push({ type: 'text-start', id });
      for (const delta of item.text.match(/\S+\s*/gu) ?? [item.text])
        parts.push({ type: 'text-delta', id, delta });
      parts.push({ type: 'text-end', id });
    } else if (item.type === 'tool-call') parts.push(item);
  });
  parts.push({ type: 'finish', finishReason, usage });
  return new ReadableStream<LanguageModelV4StreamPart>({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });
}
