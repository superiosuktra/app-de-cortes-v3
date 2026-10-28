// scripts/run-tests.mjs
// Portable replacement for: tsx --test $(find server -name '*.test.ts')
// Works on Windows, Linux and macOS without shell globbing.
process.env.NODE_ENV = 'test';

import { run } from 'node:test';
import { spec } from 'node:test/reporters';
import { readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { pipeline } from 'stream/promises';

/**
 * Recursively find all *.test.ts files under `dir`.
 * @param {string} dir
 * @returns {string[]}
 */
function findTests(dir) {
  const results = [];
  try {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      try {
        if (statSync(fullPath).isDirectory()) {
          results.push(...findTests(fullPath));
        } else if (entry.endsWith('.test.ts')) {
          results.push(resolve(fullPath));
        }
      } catch {
        // skip unreadable entries
      }
    }
  } catch {
    // skip unreadable directory
  }
  return results;
}

const files = findTests('server');

if (files.length === 0) {
  console.log('No test files found.');
  process.exit(0);
}

const stream = run({ files, execArgv: ['--import', 'tsx/esm'] });
stream.on('test:fail', () => {
  process.exitCode = 1;
});
await pipeline(stream.compose(spec), process.stdout);
process.exit(process.exitCode || 0);
