import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { execPath, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const prefix = 'site-rescue-packaged-inventory-';
const workspace = await mkdtemp(join(tmpdir(), prefix));
const paths = ['README.txt', 'assets/logo.svg', 'assets/site.css', 'assets/theme.css', 'guide/index.html', 'index.html'];
const source = join(workspace, 'source');
const output = join(workspace, 'inventory');
const guard = 'data:text/javascript,' + encodeURIComponent("import net from 'node:net'; const deny = () => { throw new Error('Offline inventory attempted network access'); }; globalThis.fetch = deny; net.Socket.prototype.connect = deny;");

async function hashes() {
  return Promise.all(paths.map(async (path) => {
    const bytes = await readFile(join(source, path));
    return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }));
}

try {
  await cp(join(repository, 'fixtures/shared/html-directory'), source, { recursive: true });
  const before = await hashes();
  await promisify(execFile)(execPath, ['--import', guard,
    join(repository, 'release/package/bin/site-rescue.js'), 'inspect-source', source, '--output', output], { timeout: 10000 });
  const inventory = JSON.parse(await readFile(join(output, 'source-inventory.json'), 'utf8'));
  assert.equal(inventory.scope, 'inventory-only');
  assert.equal(inventory.reviewRequired, true);
  assert.equal(inventory.coverage.migration, 'not-assessed');
  assert.equal(inventory.summary.files, 6);
  assert.equal(inventory.references.filter((ref) => ref.status === 'missing').length, 2);
  assert.deepEqual(inventory.files.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })), before);
  assert.deepEqual(await hashes(), before);
  stdout.write('Bundled source inventory smoke passed: 6 files, 2 missing references, source hashes unchanged, network guarded.\n');
} finally {
  assert.equal(dirname(workspace), resolve(tmpdir()));
  assert.equal(basename(workspace).startsWith(prefix), true);
  await rm(workspace, { recursive: true, force: true });
}
