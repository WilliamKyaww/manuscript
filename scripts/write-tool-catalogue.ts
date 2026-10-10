// Writes the generated tool catalogue into docs/guide/agent-tools.md (npm run docs:tools).
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withCatalogue } from '../apps/server/src/modules/agent/catalogue';
import { ALL_TOOLS } from '../apps/server/src/modules/agent/index';

const file = path.resolve(
  fileURLToPath(new URL('..', import.meta.url)),
  'docs',
  'guide',
  'agent-tools.md',
);
const before = readFileSync(file, 'utf8');
const after = withCatalogue(before, ALL_TOOLS);
if (after === before) console.log('The tool catalogue is up to date.');
else {
  writeFileSync(file, after);
  console.log('Updated the tool catalogue in docs/guide/agent-tools.md.');
}
