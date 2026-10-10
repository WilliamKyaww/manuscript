import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { NotFoundError } from '@skb/core';
import { writeFileAtomic } from '../../vault/atomic';
import type { Vault } from '../../vault/vault';
import type { SnapshotReader, SnapshotWriter } from './types';

/**
 * Copies of files kept so an action can be undone (agent-system.md §8): `.skb/history/<action
 * id>/<n>`. The history lives in the vault's hidden folder, which the index ignores. A reference is
 * `<action id>/<n>`; anything else is refused, so a reference can never point outside the folder.
 */

const REFERENCE = /^act_[0-9A-Z]{26}\/\d{1,4}$/u;

export interface SnapshotStore extends SnapshotReader {
  /** A writer for one action's copies. */
  writer(actionId: string): SnapshotWriter;
}

export function createSnapshotStore(vault: Vault): SnapshotStore {
  const absolute = (reference: string) => {
    if (!REFERENCE.test(reference)) throw new NotFoundError('That saved copy does not exist.');
    return path.join(vault.paths.history, ...reference.split('/'));
  };
  return {
    writer(actionId) {
      let count = 0;
      return {
        file(relativePath) {
          const source = vault.resolve(relativePath);
          if (!existsSync(source)) return null;
          count += 1;
          const reference = `${actionId}/${count}`;
          const target = absolute(reference);
          mkdirSync(path.dirname(target), { recursive: true });
          // Written whole or not at all: undo trusts what is here.
          writeFileAtomic(target, readFileSync(source));
          return reference;
        },
      };
    },
    read(reference) {
      const file = absolute(reference);
      if (!existsSync(file)) throw new NotFoundError('That saved copy no longer exists.');
      return readFileSync(file);
    },
  };
}
