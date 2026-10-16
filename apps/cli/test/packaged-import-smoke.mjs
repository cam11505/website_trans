import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { execPath, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const prefix = 'site-rescue-packaged-import-';
const workspace = await mkdtemp(join(tmpdir(), prefix));
const source = join(workspace, 'source');
const output = join(workspace, 'rescue');
const guard = 'data:text/javascript,' + encodeURIComponent("import net from 'node:net'; const deny = () => { throw new Error('Offline import attempted network access'); }; globalThis.fetch = deny; net.Socket.prototype.connect = deny;");
const cli = (...args) => promisify(execFile)(execPath, ['--import', guard, join(repository, 'release/package/bin/site-rescue.js'), ...args], { timeout: 20000 });
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
try {
  await cp(join(repository, 'fixtures/shared/offline-import'), source, { recursive: true });
  const result = await cli('import-source', source, '--output', output, '--style-mode', 'source');
  assert.match(result.stdout, /review required/u);
  const site = JSON.parse(await readFile(join(output, 'capture/site.json'), 'utf8'));
  const inventory = JSON.parse(await readFile(join(output, 'capture/source/source-inventory.json'), 'utf8'));
  assert.equal(site.pages.length, 2);
  assert.equal(site.assets.length, 4);
  assert.equal(site.assets.every((asset) => asset.localPath !== undefined), true);
  assert.equal(inventory.files.length, 6);
  for (const file of inventory.files) {
    assert.equal(sha256(await readFile(join(source, file.path))), file.sha256);
    assert.equal(sha256(await readFile(join(output, 'capture/source/files', file.path))), file.sha256);
  }
  const html = await readFile(join(output, 'site/index.html'), 'utf8');
  assert.match(html, /href="guide\/index.html#details"/u);
  assert.match(html, /href="assets\/[a-f0-9]+\.pdf"/u);
  assert.match(html, /<strong>說明<\/strong>/u);
  assert.equal(JSON.parse(await readFile(join(output, 'report/migration-report.json'), 'utf8')).readiness, 'review-required');
  await cli('verify', join(output, 'site'));
  await cli('verify-bundle', output);
  // Regenerate from saved capture without access to the selected source folder.
  await rename(source, join(workspace, 'source-moved'));
  const rebuilt = join(workspace, 'rebuilt');
  await cli('export', join(output, 'capture/site.json'), '--output', rebuilt, '--style-mode', 'source');
  await cli('verify', rebuilt);
  assert.equal(await readFile(join(rebuilt, 'index.html'), 'utf8'), html);
  await writeFile(join(output, 'capture/source/files/index.html'), 'tampered evidence');
  await assert.rejects(cli('verify-bundle', output), (error) => error.code === 2 && /checksum|size|mismatch/iu.test(error.stdout));
  stdout.write('Bundled offline import smoke passed: 2 pages, 4 assets, 6 unchanged source/evidence hashes, nested/fragment/attachment/CSS mappings, capture re-export, evidence tamper rejection; network guarded.\n');
} finally {
  assert.equal(dirname(workspace), resolve(tmpdir()));
  assert.equal(basename(workspace).startsWith(prefix), true);
  await rm(workspace, { recursive: true, force: true });
}
