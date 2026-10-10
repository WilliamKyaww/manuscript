import type { Id, ToolRisk } from '@skb/core';
import type { z } from 'zod';
import type { Clock } from '../../shared/clock';
import type { Vault } from '../../vault/vault';
import type { AppModules } from '../index';

/**
 * The tool contract (agent-system.md §6.1, ADR-0013). A tool is a small, typed verb over a domain
 * service: its input is validated before it runs and its output after, its risk decides what the
 * policy asks of the person, and a tool that changes anything says how to put it back.
 */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Who asked for a call: the in-app agent, or an MCP client. */
export type Actor = 'agent' | 'mcp';

/** The services tools wrap — the same ones the HTTP routes use, so rules are shared. */
export type AgentServices = Pick<
  AppModules,
  | 'notes'
  | 'search'
  | 'sources'
  | 'learning'
  | 'lectures'
  | 'concepts'
  | 'relations'
  | 'graph'
  | 'cards'
  | 'reviews'
  | 'questions'
  | 'quizzes'
  | 'mastery'
  | 'proposals'
  | 'generation'
  | 'jobs'
> & { readonly clock: Clock; readonly vault: Vault };

/** Copies of vault files taken before a tool changes them, kept for undo under `.skb/history/`. */
export interface SnapshotWriter {
  /** Keeps the file as it is now; returns where to restore it from, or null if it does not exist. */
  file(relativePath: string): string | null;
}

export interface SnapshotReader {
  /** The bytes kept under a reference returned by `SnapshotWriter.file`. */
  read(reference: string): Buffer;
}

export interface ToolContext {
  readonly actor: Actor;
  readonly services: AgentServices;
  readonly signal: AbortSignal;
  readonly snapshot: SnapshotWriter;
}

/** What a tool returns: the result for the model, and what is needed to undo it. */
export interface ToolResult<O> {
  output: O;
  undo?: Json;
}

/** The record an undo works from. */
export interface UndoRecord<I = unknown, O = unknown> {
  actionId: Id<'action'>;
  input: I;
  output: O;
  undo: Json;
}

export interface UndoContext {
  readonly services: AgentServices;
  readonly snapshots: SnapshotReader;
}

export interface ToolDefinition<I, O> {
  /** `verb_object` in snake case, e.g. `create_flashcards`. */
  name: string;
  category: 'knowledge' | 'concepts' | 'sources' | 'learning' | 'files';
  /** Written for the model: when to use it and what it returns. */
  description: string;
  input: z.ZodType<I>;
  output: z.ZodType<O>;
  risk: ToolRisk;
  /** How many things a call touches (for bulk escalation); 1 when absent. */
  items?(input: I): number;
  execute(context: ToolContext, input: I): Promise<ToolResult<O>> | ToolResult<O>;
  /** One line for the activity list: "Found Lecture 3 — Consensus". */
  describe(input: I, output?: O): string;
  /** Required for tools that change anything. */
  undo?(context: UndoContext, record: UndoRecord<I, O>): Promise<void> | void;
  /** Why the call can no longer be undone (the target changed since), or null. */
  canUndo?(context: UndoContext, record: UndoRecord<I, O>): string | null;
  /** Hidden from MCP clients even if not destructive. */
  mcp?: false;
}

// biome-ignore lint/suspicious/noExplicitAny: tools of different input and output types share one registry; each validates its own.
export type AnyTool = ToolDefinition<any, any>;

/** Declares a tool with its types inferred; a write must say how to undo it. */
export function defineTool<I, O>(tool: ToolDefinition<I, O>): AnyTool {
  if (tool.risk !== 'read' && !tool.undo)
    throw new Error(`The ${tool.risk} tool "${tool.name}" must say how to undo it.`);
  return tool;
}
