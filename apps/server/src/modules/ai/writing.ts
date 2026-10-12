import {
  AiError,
  UNTRUSTED_RULE,
  type WritingAction,
  type WritingRequest,
  type WritingResult,
  wrapUntrusted,
} from '@skb/core';
import { generateText } from 'ai';
import { describeProviderError } from './errors';
import type { AiService } from './service';

/**
 * Writing help on selected text (Phase 26, ADR-0045): the selection toolbar's AI actions. The quick-
 * tasks model answers when there is one, the chat model otherwise. The answer goes back to the
 * editor as a suggestion; the student decides whether it replaces the text, so the server never
 * writes to a note here (and the agent's tools are not involved).
 */

const WHAT: Record<Exclude<WritingAction, 'custom'>, string> = {
  improve:
    'Improve the writing: clearer, better flow and word choice, with the same meaning, about the same length and the same tone.',
  proofread:
    'Correct spelling, grammar and punctuation only. Change nothing else: not the wording, not the style.',
  shorter: 'Make it shorter — about half as long — without losing a key point.',
  longer:
    'Make it longer with useful explanation and detail, in the same style. Do not invent facts, figures or references.',
  simplify: 'Rewrite it in plain, simple language that a first-year student would follow.',
  summarise: 'Summarise it in two to four sentences.',
  explain:
    'Explain what it means to a university student, simply and accurately, with a short example where one helps. Use a short paragraph or a few bullet points.',
  list: 'Reformat it as a well-organised Markdown list (nested where that helps), keeping every point.',
  table: 'Reformat it as a Markdown table with sensible columns, keeping every fact.',
};

/** Actions whose answer stands beside the text rather than replacing it. */
export const BESIDE: readonly WritingAction[] = ['explain', 'summarise'];

export async function assistWriting(
  ai: AiService,
  request: WritingRequest,
  signal?: AbortSignal,
): Promise<WritingResult> {
  const role = ai.status().roles.fast.ready ? 'fast' : 'chat';
  const resolved = ai.require(role);
  const instruction =
    request.action === 'custom' ? (request.instruction ?? '') : WHAT[request.action];
  const keepMarkdown = BESIDE.includes(request.action)
    ? ''
    : ' Keep the Markdown as it is — links, [[wikilinks]], maths, code and formatting — unless the instruction is about them.';
  try {
    const result = await generateText({
      model: resolved.model,
      system: [
        `Task: write-${request.action}`,
        'You help a university student with their own notes, written in Markdown (Obsidian’s dialect).',
        `Instruction: ${instruction}${keepMarkdown}`,
        'Reply with the result only: no preamble, no comment, no quotation marks or code fence around it. Write in British English, unless the text is in another language, which you keep.',
        UNTRUSTED_RULE,
      ].join('\n'),
      prompt: wrapUntrusted({
        key: 'selection',
        title: request.title ?? 'Note',
        location: 'selected text',
        text: request.text,
      }),
      maxOutputTokens: 2500,
      abortSignal: signal,
      maxRetries: 1,
    });
    ai.record(
      resolved,
      `writing help (${request.action})`,
      result.usage.inputTokens ?? 0,
      result.usage.outputTokens ?? 0,
    );
    return { text: tidy(result.text), model: resolved.modelId };
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new AiError('provider', describeProviderError(error), { cause: error });
  }
}

/** Models sometimes wrap the answer anyway: a code fence or quotation marks around all of it. */
export function tidy(text: string): string {
  let result = text.trim();
  const fenced = /^```(?:markdown|md)?\n([\s\S]*?)\n```$/u.exec(result);
  if (fenced?.[1] !== undefined) result = fenced[1].trim();
  if (/^".*"$/su.test(result) && !result.slice(1, -1).includes('"')) result = result.slice(1, -1);
  return result;
}
