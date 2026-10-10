import { decodeTime, monotonicFactory, type PRNG } from 'ulid';
import { z } from 'zod';

/**
 * Prefix for every entity kind. IDs look like `note_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7`
 * (prefix, underscore, 26-character ULID) — see ADR-0007.
 * Prefixes are part of the persisted format: never change an existing one.
 */
export const ID_PREFIXES = {
  vault: 'vault',
  note: 'note',
  source: 'src',
  section: 'sec',
  chunk: 'chk',
  course: 'crs',
  module: 'mod',
  lecture: 'lec',
  topic: 'top',
  assessment: 'asm',
  concept: 'con',
  relation: 'rel',
  cardSet: 'set',
  card: 'card',
  review: 'rev',
  question: 'qst',
  quiz: 'quiz',
  attempt: 'att',
  answer: 'ans',
  session: 'ses',
  plan: 'plan',
  planItem: 'pli',
  thread: 'thr',
  message: 'msg',
  action: 'act',
  job: 'job',
  proposal: 'prp',
  pipelineRun: 'run',
  usage: 'use',
} as const;

export type EntityKind = keyof typeof ID_PREFIXES;

/** A branded string ID for one entity kind; prevents mixing IDs of different kinds at compile time. */
export type Id<K extends EntityKind> = string & { readonly __idKind: K };

/** Generates IDs; injectable so tests can be deterministic. */
export type IdFactory = <K extends EntityKind>(kind: K) => Id<K>;

const ULID_PATTERN = '[0-7][0-9A-HJKMNP-TV-Z]{25}';
const ID_PATTERNS = new Map<EntityKind, RegExp>(
  (Object.entries(ID_PREFIXES) as [EntityKind, string][]).map(([kind, prefix]) => [
    kind,
    new RegExp(`^${prefix}_${ULID_PATTERN}$`),
  ]),
);

export interface IdFactoryOptions {
  /** Clock in milliseconds since the epoch (defaults to `Date.now`). */
  now?: () => number;
  /** Random number source in [0, 1) (defaults to a cryptographically secure source). */
  random?: PRNG;
}

/** Creates an ID factory producing monotonically increasing, sortable IDs. */
export function createIdFactory(options: IdFactoryOptions = {}): IdFactory {
  const next = monotonicFactory(options.random);
  const now = options.now ?? Date.now;
  return <K extends EntityKind>(kind: K) => `${ID_PREFIXES[kind]}_${next(now())}` as Id<K>;
}

/** Default process-wide ID factory. Services should receive a factory instead of importing this. */
export const newId: IdFactory = createIdFactory();

export function isId<K extends EntityKind>(value: unknown, kind: K): value is Id<K> {
  return typeof value === 'string' && (ID_PATTERNS.get(kind)?.test(value) ?? false);
}

/** Returns the entity kind encoded in an ID's prefix, or `undefined` if it is not a valid ID. */
export function idKind(value: string): EntityKind | undefined {
  for (const [kind, pattern] of ID_PATTERNS) {
    if (pattern.test(value)) return kind;
  }
  return undefined;
}

/** Milliseconds since the epoch at which the ID was generated. */
export function idTimestamp(id: Id<EntityKind>): number {
  const ulid = id.slice(id.indexOf('_') + 1);
  return decodeTime(ulid);
}

/** Zod schema accepting only IDs of the given kind. */
export function idSchema<K extends EntityKind>(kind: K) {
  return z
    .string()
    .refine((value) => isId(value, kind), {
      message: `Expected a ${kind} ID (${ID_PREFIXES[kind]}_…)`,
    })
    .transform((value) => value as Id<K>);
}
