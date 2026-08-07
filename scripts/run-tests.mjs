import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

async function collectTests(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? collectTests(full) : (entry.name.endsWith('.test.ts') ? [full] : []);
  }));
  return files.flat();
}

const files = await collectTests('src');
let passed = 0;
for (const file of files) {
  const mod = await import(pathToFileURL(file));
  for (const testCase of mod.tests ?? []) {
    await testCase.run();
    passed += 1;
    console.log(`✓ ${testCase.name}`);
  }
}
console.log(`\n${passed} tests passed`);
