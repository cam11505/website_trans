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
const prefix = 'site-rescue-packaged-replay-';
const workspace = await mkdtemp(join(tmpdir(), prefix));
const source = join(workspace, 'original');
const first = join(workspace, 'first');
const replayed = join(workspace, 'replayed');
const snapshot = join(first, 'capture/source');
const guard = 'data:text/javascript,' + encodeURIComponent("import net from 'node:net'; const deny = () => { throw new Error('Replay attempted network access'); }; globalThis.fetch = deny; net.Socket.prototype.connect = deny;");
const cli = (...args) => promisify(execFile)(execPath, ['--import', guard, join(repository, 'release/package/bin/site-rescue.js'), ...args], { timeout: 20000 });
try {
  await cp(join(repository, 'fixtures/shared/offline-import'), source, { recursive: true });
  await cli('import-source', source, '--output', first, '--style-mode', 'source');
  const before = await readFile(join(snapshot, 'source-snapshot.json'), 'utf8');
  const index = JSON.parse(before);
  assert.equal(index.snapshotVersion, '1.0.0');
  assert.equal(index.files.length, 6);
  await rename(source, join(workspace, 'source-moved'));
  await writeFile(join(first, 'capture/site.json'), 'invalid old normalized output; replay must ignore');
  const result = await cli('replay-source', snapshot, '--output', replayed, '--style-mode', 'source');
  assert.match(result.stdout, /snapshot replayed/u);
  assert.equal(await readFile(join(replayed, 'site/index.html'), 'utf8'), await readFile(join(first, 'site/index.html'), 'utf8'));
  assert.equal(await readFile(join(replayed, 'capture/source/source-snapshot.json'), 'utf8'), before);
  assert.equal(await readFile(join(snapshot, 'source-snapshot.json'), 'utf8'), before);
  for (const file of index.files) {
    for (const root of [snapshot, join(replayed, 'capture/source')]) {
      assert.equal(createHash('sha256').update(await readFile(join(root, 'files', file.path))).digest('hex'), file.sha256);
    }
  }
  const site = JSON.parse(await readFile(join(replayed, 'capture/site.json'), 'utf8'));
  assert.equal(site.pages.length, 2);
  assert.equal(site.warnings.some((warning) => warning.code === 'source-snapshot-replayed'), true);
  await cli('verify-bundle', replayed);
  await writeFile(join(snapshot, 'files/index.html'), '<p>tampered raw source</p>');
  await assert.rejects(cli('replay-source', snapshot, '--output', join(workspace, 'rejected')), (error) => error.code === 1 && /snapshot.*mismatch/iu.test(error.stderr));
  stdout.write('Bundled Snapshot/replay smoke passed: original folder moved, invalid old site.json ignored, 2 pages re-normalized, 6 raw hashes and acquisition metadata preserved, verified bundle, tampered source rejected; network guarded.\n');
} finally {
  assert.equal(dirname(workspace), resolve(tmpdir()));
  assert.equal(basename(workspace).startsWith(prefix), true);
  await rm(workspace, { recursive: true, force: true });
}
