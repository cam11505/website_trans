import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, readdir, rename, rm } from 'node:fs/promises';
import { get } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { env, execPath, stdout } from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const prefix = 'site-rescue-candidate-';
const workspace = await mkdtemp(join(tmpdir(), prefix));
const relocated = join(workspace, '候選 package');
const source = join(workspace, '範例 working source');
const movedSource = join(workspace, 'moved working source');
const first = join(workspace, 'first rescue');
const replay = join(workspace, 'replayed rescue');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const guard = 'data:text/javascript,' + encodeURIComponent(`
  import net from 'node:net';
  const deny = () => { throw new Error('Candidate CLI attempted outbound network'); };
  globalThis.fetch = deny;
  net.Socket.prototype.connect = deny;
  const listen = net.Server.prototype.listen;
  net.Server.prototype.listen = function(...args) {
    if(args[1] !== '127.0.0.1') throw new Error('Preview listener escaped loopback');
    args[0] = 0; // Test-only ephemeral port; product default is unchanged.
    return listen.apply(this,args);
  };
  if(process.send) {
    process.on('message', (message) => { if(message?.stopPreview) process.emit('SIGINT'); });
    process.channel?.unref();
  }
`);
const cliFile = join(relocated, 'bin/site-rescue.js');
const cli = (...args) => promisify(execFile)(execPath, ['--import', guard, cliFile, ...args], { timeout: 30000 });

async function filesIn(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(path));
    else { assert.equal(entry.isFile(), true); files.push(path); }
  }
  return files;
}

async function verifyRelocatedPackage() {
  const expected = new Map();
  for (const line of (await readFile(join(relocated, 'SHA256SUMS.txt'), 'utf8')).trim().split(/\r?\n/u)) {
    const match = /^([a-f0-9]{64}) {2}(.+)$/u.exec(line);
    assert.ok(match);
    assert.equal(expected.has(match[2]), false);
    expected.set(match[2], match[1]);
  }
  const actual = (await filesIn(relocated)).filter((path) => basename(path) !== 'SHA256SUMS.txt');
  assert.equal(actual.length, expected.size);
  for (const path of actual) assert.equal(sha256(await readFile(path)), expected.get(relative(relocated, path).split(sep).join('/')));
  for (const path of ['LICENSE', 'THIRD_PARTY_NOTICES.txt', 'docs/OFFLINE_WALKTHROUGH.md', 'docs/INPUT_SUPPORT.md', 'examples/offline-starter/EXPECTED.md']) {
    assert.ok(expected.has(path));
    assert.ok((await readFile(join(relocated, path))).length > 0);
  }
  return expected.size;
}

function localText(url) {
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\//u);
  return new Promise((resolveText, reject) => {
    const request = get(url, (response) => {
      if (response.statusCode !== 200) { response.resume(); reject(new Error(`Preview status ${response.statusCode}`)); return; }
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { text += chunk; });
      response.on('end', () => resolveText(text));
      response.on('error', reject);
    });
    request.setTimeout(5000, () => request.destroy(new Error('Preview request timed out')));
    request.on('error', reject);
  });
}

async function previewAndRead(siteDirectory) {
  const child = spawn(execPath, ['--import', guard, cliFile, 'preview', siteDirectory], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let output = '';
  let error = '';
  let readyResolve;
  let readyReject;
  const ready = new Promise((resolveReady, reject) => { readyResolve = resolveReady; readyReject = reject; });
  const exited = new Promise((resolveExit) => child.on('close', (code) => { readyReject(new Error(`Preview exited before ready: ${output} ${error}`)); resolveExit(code); }));
  child.on('error', readyReject);
  child.stdout.on('data', (chunk) => {
    output += chunk;
    const match = /URL: (http:\/\/127\.0\.0\.1:\d+\/)/u.exec(output);
    if (match) readyResolve(match[1]);
  });
  child.stderr.on('data', (chunk) => { error += chunk; });
  const timeout = setTimeout(() => { readyReject(new Error('Preview timed out')); child.kill(); }, 30000);
  try {
    const origin = await ready;
    assert.match(await localText(origin), /離線救援範例/u);
    assert.match(await localText(origin + 'guide/index.html'), /id="steps"/u);
    const home = await localText(origin);
    const attachment = /href="(assets\/[^"<>]+\.txt)"/u.exec(home);
    assert.ok(attachment);
    assert.match(await localText(origin + attachment[1]), /Site Rescue synthetic offline example/u);
    child.send({ stopPreview: true });
    assert.equal(await exited, 0, error);
    assert.equal(error, '');
  } finally {
    clearTimeout(timeout);
    if (child.exitCode === null) child.kill();
  }
}

try {
  await cp(join(repository, 'release/package'), relocated, { recursive: true });
  const packageFiles = await verifyRelocatedPackage();
  const rootMetadata = await json(join(repository, 'package.json'));
  const packageMetadata = await json(join(relocated, 'package.json'));
  assert.equal(packageMetadata.version, rootMetadata.version);
  assert.equal(packageMetadata.private, true);
  assert.equal(packageMetadata.license, 'Apache-2.0');
  assert.equal((await cli('--version')).stdout.trim(), rootMetadata.version);
  await cp(join(relocated, 'examples/offline-starter/source'), source, { recursive: true });
  const originalFiles = await filesIn(source);
  assert.equal(originalFiles.length, 5);
  const originalHashes = new Map(await Promise.all(originalFiles.map(async (path) => [relative(source, path), sha256(await readFile(path))])));
  await cli('import-source', source, '--output', first, '--style-mode', 'source');
  const site = await json(join(first, 'capture/site.json'));
  assert.equal(site.schemaVersion, '1.1.0');
  assert.equal(site.pages.length, 2);
  assert.equal(site.assets.length, 3);
  assert.ok(site.assets.every((asset) => asset.localPath && asset.checksum));
  const report = await json(join(first, 'report/migration-report.json'));
  assert.equal(report.reportVersion, '2.0.0');
  assert.equal(report.readiness, 'review-required');
  assert.equal(report.coverage.sourceAcquisition.evidence.originalFileCount, 5);
  assert.equal(report.coverage.sourceAcquisition.sourceCompleteness, 'unknown');
  assert.equal(report.coverage.manualReview.status, 'not-assessed');
  assert.equal(report.coverage.staticIntegrity.status, 'valid');
  await cli('verify-bundle', first);
  await previewAndRead(join(first, 'site'));
  // Move only the freshly copied, test-owned source; validate both endpoints before directory rename.
  assert.equal(dirname(resolve(source)), resolve(workspace));
  assert.equal(dirname(resolve(movedSource)), resolve(workspace));
  await rename(source, movedSource);
  await cli('replay-source', join(first, 'capture/source'), '--output', replay, '--style-mode', 'source');
  const replayed = await json(join(replay, 'capture/site.json'));
  assert.equal(replayed.pages.length, 2);
  assert.equal(replayed.assets.length, 3);
  assert.equal((await json(join(replay, 'report/migration-report.json'))).readiness, 'review-required');
  for (const [path, expected] of originalHashes) {
    assert.equal(sha256(await readFile(join(movedSource, path))), expected);
    assert.equal(sha256(await readFile(join(first, 'capture/source/files', path))), expected);
    assert.equal(sha256(await readFile(join(replay, 'capture/source/files', path))), expected);
  }
  await cli('verify-bundle', first);
  await cli('verify-bundle', replay);
  await verifyRelocatedPackage();
  stdout.write(`Candidate package smoke passed: version ${packageMetadata.version}; ${packageFiles} relocated checksummed files; notices/docs/example; 2 pages/3 assets/5 original hashes; report, real loopback home/guide/attachment preview and graceful stop; moved-source offline replay and both bundle checks; outbound CLI network guarded. Revision: ${env.SITE_RESCUE_CANDIDATE_REVISION ?? 'local working tree'}.\n`);
} finally {
  assert.equal(dirname(workspace), resolve(tmpdir()));
  assert.equal(basename(workspace).startsWith(prefix), true);
  await rm(workspace, { recursive: true, force: true });
}
