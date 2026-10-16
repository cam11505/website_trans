import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { execPath, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const prefix = 'site-rescue-packaged-query-';
const workspace = await mkdtemp(join(tmpdir(), prefix));
const bundle = join(workspace, 'bundle');
const guard = 'data:text/javascript,' + encodeURIComponent("import net from 'node:net'; const deny = () => { throw new Error('Query export attempted network access'); }; globalThis.fetch = deny; net.Socket.prototype.connect = deny;");
const cli = (...args) => promisify(execFile)(execPath, ['--import', guard, join(repository, 'release/package/bin/site-rescue.js'), ...args], { timeout: 20000 });
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const origin = 'https://query.example';
const paths = ['/p?id=1', '/p?id=2', '/p?'];
const fileFor = (path) => `__site-rescue-query/${createHash('sha256').update(path).digest('hex')}.html`;
try {
  await mkdir(join(bundle, 'capture'), { recursive: true });
  const input = join(bundle, 'capture/site.json');
  const site = { schemaVersion: '1.1.0', source: { adapter: 'fixture', baseUrl: origin + paths[0], capturedAt: '2026-10-16T00:00:00.000Z' },
    metadata: { title: 'Query CLI fixture' }, navigation: [{ label: 'Alias', href: `${origin}/old?id=2#details`, children: [] }], assets: [], warnings: [],
    redirects: [{ from: '/old?id=2', to: paths[1], status: 301 }],
    pages: paths.map((path, index) => ({ id: `p${index}`, sourceUrl: origin + path, sourcePath: path, targetPath: path, title: path,
      blocks: [{ type: 'heading', level: 1, text: path, id: 'details' }, { type: 'button', label: 'Two', href: '?id=2#details' }, { type: 'button', label: 'Unknown', href: '?id=missing' }] })),
  };
  await writeFile(input, JSON.stringify(site));
  const before = await readFile(input);
  const exported = await cli('export', input, '--output', join(bundle, 'site'));
  assert.match(exported.stdout, /Query pages mapped: 3; static entry pages: 1/u);
  assert.match(exported.stdout, /uncaptured same-origin query/u);
  const mapping = await json(join(bundle, 'site/url-mapping.json'));
  assert.equal(mapping.queryPolicy, 'exact-serialized-query');
  assert.equal(mapping.pages.length, 3);
  assert.equal(new Set(mapping.pages.map((page) => page.outputFile)).size, 3);
  for (const path of paths) assert.equal(mapping.pages.find((page) => page.targetPath === path).outputFile, fileFor(path));
  assert.equal(mapping.entryPoint.targetFile, fileFor(paths[0]));
  assert.equal(mapping.unresolvedQueryLinks.length, 3);
  const html = await readFile(join(bundle, 'site', fileFor(paths[0])), 'utf8');
  assert.ok(html.includes(`href="${basename(fileFor(paths[1]))}#details"`));
  assert.ok(html.includes(`href="${origin}/p?id=missing"`));
  const redirects = await json(join(bundle, 'site/redirects.json'));
  assert.equal(redirects.version, '2.0.0');
  assert.equal(redirects.queryMatching, 'exact-serialized-path-and-query');
  assert.equal(redirects.staticFallbacks[0].targetFile, fileFor(paths[1]));
  await cli('verify', join(bundle, 'site'));
  await cli('report', input, '--output', join(bundle, 'report'), '--site-directory', join(bundle, 'site'));
  const report = await json(join(bundle, 'report/migration-report.json'));
  assert.equal(report.readiness, 'review-required');
  assert.equal(report.coverage.staticIntegrity.status, 'valid');
  assert.equal(report.coverage.sourceAcquisition.status, 'unknown');
  await cli('manifest', bundle);
  await cli('verify-bundle', bundle);
  assert.deepEqual(await readFile(input), before);
  const manifest = await json(join(bundle, 'rescue-manifest.json'));
  assert.ok(manifest.files.some((file) => file.path === 'site/url-mapping.json'));
  await assert.rejects(cli('export', input, '--output', join(bundle, 'site')), (error) => error.code === 1 && /already exists/iu.test(error.stderr));
  await writeFile(join(bundle, 'site/url-mapping.json'), 'tampered');
  await assert.rejects(cli('verify-bundle', bundle), (error) => error.code === 2 && /checksum|size|mismatch/iu.test(error.stdout));
  stdout.write('Bundled query mapping smoke passed: 3 exact variants, distinct deterministic paths, query redirects/fragment aliases, entry fallback, unknown-query warning, Report2, source unchanged and mapping tamper rejection; network guarded.\n');
} finally {
  assert.equal(dirname(workspace), resolve(tmpdir()));
  assert.equal(basename(workspace).startsWith(prefix), true);
  await rm(workspace, { recursive: true, force: true });
}
