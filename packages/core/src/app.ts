/** Display name of the application (ADR-0027). */
export const APP_NAME = 'Manuscript';

/** Stable machine identifier used in file names, the ping endpoint and data directories. */
export const APP_ID = 'manuscript';

/**
 * Names used before the project was renamed (ADR-0027). Default folders created under the old name
 * keep being used when no folder with the new name exists, so nothing is orphaned by the rename.
 */
export const LEGACY_APP_NAMES = {
  display: 'Study Knowledge Base',
  folder: 'StudyKnowledgeBase',
  id: 'study-knowledge-base',
} as const;

/**
 * Name of the application metadata folder inside a vault. Internal identifiers keep the `skb`
 * prefix from the original name (the folder, `skb-id`, `@skb/*`, `SKB_*`) — see ADR-0027.
 */
export const VAULT_META_DIR = '.skb';

/** Default local server port. */
export const DEFAULT_PORT = 4317;
