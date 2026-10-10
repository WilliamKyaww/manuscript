import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { toolCatalogue, withCatalogue } from './catalogue';
import { ALL_TOOLS } from './index';

const guide = path.resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../../../docs/guide/agent-tools.md',
);

describe('the tool catalogue', () => {
  it('lists every tool once, with its risk', () => {
    const text = toolCatalogue(ALL_TOOLS);
    for (const tool of ALL_TOOLS)
      expect(text.match(new RegExp(`\\| \`${tool.name}\` \\|`, 'gu'))).toHaveLength(1);
    expect(text).toMatch(/\| `delete_note` \|.*Deletes or merges \(always asks\) \| no \|/u);
    expect(text).toMatch(/\| `create_note` \|.*Changes \(logged, undoable\) \| yes \|/u);
    expect(text).toMatch(/\| `search_knowledge` \| .* \| `query`, `limit`\? \| Reads \| yes \|/u);
  });

  it('is what the user guide says (run npm run docs:tools to update it)', () => {
    const committed = readFileSync(guide, 'utf8');
    expect(withCatalogue(committed, ALL_TOOLS)).toBe(committed);
  });

  it('gives every tool that changes anything a way to undo it, and a one-line description', () => {
    for (const tool of ALL_TOOLS) {
      if (tool.risk !== 'read' && !tool.permanent)
        expect(tool.undo, tool.name).toBeTypeOf('function');
      if (tool.permanent) expect(tool.undo, tool.name).toBeUndefined();
      expect(tool.name).toMatch(/^[a-z]+(_[a-z]+)+$/u);
      expect(tool.description.length, tool.name).toBeGreaterThan(30);
      expect(tool.describe, tool.name).toBeTypeOf('function');
    }
  });
});
