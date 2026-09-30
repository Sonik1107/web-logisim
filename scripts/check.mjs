import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
// Check source and test files without adding a build system or dependencies.
for (const directory of ['.', 'editor', 'scripts', 'tests']) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.(?:mjs|js)$/.test(entry.name)) {
      continue;
    }
    const path = join(directory, entry.name);
    const result = spawnSync(process.execPath, ['--check', path], { stdio: 'inherit' });
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      process.exit(result.status || 1);
    }
  }
}
console.log('JavaScript syntax checks passed.');
