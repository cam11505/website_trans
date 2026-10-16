import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSite } from '@site-rescue/content-schema';
import { main } from '../src/index.js';

let workspace: string;
let source: string;
let output: string;
beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'site-rescue-import-'));
  source = join(workspace, 'source');
  output = join(workspace, 'rescue');
  await mkdir(join(source, 'guide'), { recursive: true });
  await mkdir(join(source, 'assets'));
  await writeFile(join(source, 'index.html'), '<!doctype html><title>離線測試</title><link rel="stylesheet" href="assets/site.css"><main><h1>首頁</h1><p>前往 <a href="guide/#details"><strong>說明</strong></a> 或 <a href="assets/manual.pdf">下載</a></p><img src="assets/logo.svg"></main>');
  await writeFile(join(source, 'guide/index.html'), '<title>Guide</title><main><h2 id="details">Details</h2><p><a href="../index.html">Home</a></p><img src="../assets/logo.svg"></main>');
  await writeFile(join(source, 'assets/site.css'), '@import "theme.css"; body { background-image:url("logo.svg") }');
  await writeFile(join(source, 'assets/theme.css'), 'h1 { color: navy }');
  await writeFile(join(source, 'assets/logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await writeFile(join(source, 'assets/manual.pdf'), '%PDF-1.4 synthetic fixture');
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Offline import must never use network'); }));
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  // workspace is a fresh test-owned temporary directory, never the selected source.
  await rm(workspace, { recursive: true, force: true });
});
const run = (...args: string[]) => main(['import-source', source, '--output', output, ...args]);
const json = async (path: string) => JSON.parse(await readFile(join(output, path), 'utf8'));

describe('offline HTML folder import', () => {
  it('normalizes, exports, reports and manifests all local pages/assets with no network or source mutation', async () => {
    const before = await readFile(join(source, 'index.html'));
    expect(await run('--style-mode', 'source')).toBe(0);
    const site = parseSite(await json('capture/site.json'));
    expect(site.pages).toHaveLength(2);
    expect(site.source.adapter).toBe('generic-html');
    expect(site.source.baseUrl).toBe('https://site-rescue.invalid/index.html');
    expect(site.assets.every((asset) => asset.localPath !== undefined)).toBe(true);
    const home = await readFile(join(output, 'site/index.html'), 'utf8');
    expect(home).toContain('href="guide/index.html#details"');
    expect(home).toContain('<strong>說明</strong>');
    expect(home).toMatch(/href="assets\/[a-f0-9]+\.pdf"/u);
    expect(home).toContain('data-site-rescue-style="source"');
    expect(await main(['verify', join(output, 'site')])).toBe(0);
    expect(await main(['verify-bundle', output])).toBe(0);
    expect((await json('report/migration-report.json')).readiness).toBe('review-required');
    const evidence = await json('capture/import-source.json');
    expect(evidence).toMatchObject({ importVersion: '1.0.0', sourceKind: 'html-directory', mappingOrigin: 'https://site-rescue.invalid/', publicOrigin: null });
    const inventory = await json('capture/source/source-inventory.json');
    for (const file of inventory.files) {
      const bytes = await readFile(join(source, file.path));
      expect(await readFile(join(output, 'capture/source/files', file.path))).toEqual(bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);
    }
    expect(await readFile(join(source, 'index.html'))).toEqual(before);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('imports unlinked HTML and maps encoded filenames and directory index aliases deterministically', async () => {
    await writeFile(join(source, '未連結 頁.html'), '<title>Other</title><p>Unlinked</p>');
    await writeFile(join(source, 'literal%25.html'), '<p><a href="' + encodeURIComponent('未連結 頁.html') + '">Other</a></p>');
    expect(await run()).toBe(0);
    const site = parseSite(await json('capture/site.json'));
    expect(site.pages).toHaveLength(4);
    expect(site.pages.filter((page) => page.targetPath.startsWith('/offline-pages/'))).toHaveLength(2);
    expect(await main(['verify', join(output, 'site')])).toBe(0);
    const other = join(workspace, 'copied');
    await cp(source, other, { recursive: true });
    const second = join(workspace, 'second');
    expect(await main(['import-source', other, '--output', second])).toBe(0);
    expect(await readFile(join(output, 'capture/import-source.json'))).toEqual(await readFile(join(second, 'capture/import-source.json')));
  });

  it('keeps missing, unsafe, external, dynamic and query references visible without fetching or claiming ready', async () => {
    await writeFile(join(source, 'index.html'), '<main><p><a href="guide/?v=1#details">Guide</a><a href="../../escape.html">Bad</a><a href="missing.html">Missing</a></p><img src="https://example.com/image.png"><script>throw new Error("never execute")</script></main>');
    expect(await run()).toBe(0);
    const site = parseSite(await json('capture/site.json'));
    expect(site.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining(['offline-html-import', 'missing-local-reference', 'unsafe-reference', 'query-reference-not-inspected', 'active-content-not-inspected', 'asset-download-failed']));
    expect(await readFile(join(output, 'site/index.html'), 'utf8')).toContain('href="guide/index.html#details"');
    expect(await readFile(join(output, 'site/index.html'), 'utf8')).not.toContain('<script');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['base', '<base href="https://example.com/"><p>Test</p>', /base/iu],
    ['encoding', '<meta charset="windows-1252"><p>Test</p>', /UTF-8|inspected/iu],
  ])('rejects ambiguous %s HTML with no partial rescue output', async (_name, html, error) => {
    await writeFile(join(source, 'index.html'), html);
    expect(await run()).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(error));
    await expect(readdir(output)).rejects.toThrow();
  });

  it('requires an explicit root index rather than choosing a hidden arbitrary home page', async () => {
    await rm(join(source, 'index.html'));
    expect(await run()).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/index\.html/iu));
    await expect(readdir(output)).rejects.toThrow();
  });

  it('supports index.htm as the home page and exports a previewable index.html', async () => {
    await rm(join(source, 'index.html'));
    await writeFile(join(source, 'index.htm'), '<title>HTM home</title><p><a href="guide/">Guide</a></p>');
    await writeFile(join(source, 'guide/index.html'), '<p><a href="../index.htm">Home</a></p>');
    expect(await run()).toBe(0);
    expect(await readFile(join(output, 'site/index.html'), 'utf8')).toContain('HTM home');
    expect(await readFile(join(output, 'site/guide/index.html'), 'utf8')).toContain('href="../index.html"');
  });

  it.each(['--max-entries', '--max-file-bytes', '--max-total-bytes', '--max-text-bytes'])('enforces %s before leaving generated files', async (option) => {
    expect(await run(option, '1')).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/limit|inspected/iu));
    await expect(readdir(output)).rejects.toThrow();
  });

  it('rejects existing output and preserves its contents', async () => {
    await mkdir(output);
    await writeFile(join(output, 'keep'), 'untouched');
    expect(await run()).toBe(1);
    expect(await readFile(join(output, 'keep'), 'utf8')).toBe('untouched');
    expect(await readdir(output)).toEqual(['keep']);
  });

  it('rejects source/output containment in both directions', async () => {
    expect(await main(['import-source', source, '--output', join(source, 'new-output')])).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/separate/iu));
    expect(await main(['import-source', source, '--output', workspace])).toBe(1);
    expect(console.error).toHaveBeenLastCalledWith(expect.stringMatching(/separate/iu));
  });

  it('rejects descendant junctions or symlinks without reading their targets', async () => {
    const outside = join(workspace, 'outside');
    await mkdir(outside);
    await writeFile(join(outside, 'private.html'), 'private');
    await symlink(outside, join(source, 'alias'), process.platform === 'win32' ? 'junction' : 'dir');
    expect(await run()).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/symbolic link/iu));
    await expect(readdir(output)).rejects.toThrow();
  });

  it('rejects an output parent alias pointing into the source', async () => {
    const alias = join(workspace, 'alias');
    await symlink(source, alias, process.platform === 'win32' ? 'junction' : 'dir');
    expect(await main(['import-source', source, '--output', join(alias, 'new-output')])).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/separate/iu));
    await expect(readdir(join(source, 'new-output'))).rejects.toThrow();
  });

  it('retains invalid static output with review evidence and exit 2, without a valid bundle claim', async () => {
    await writeFile(join(source, 'index.html'), '<p><a href="guide/#absent">Broken fragment</a></p>');
    expect(await run()).toBe(2);
    expect((await json('report/migration-report.json')).readiness).toBe('review-required');
    await expect(readFile(join(output, 'rescue-manifest.json'))).rejects.toThrow();
    expect(await main(['verify', join(output, 'site')])).toBe(2);
  });

  it('rejects ZIP files and unknown/duplicate options explicitly', async () => {
    const zip = join(workspace, 'backup.zip');
    await writeFile(zip, 'not an archive');
    expect(await main(['import-source', zip, '--output', output])).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/directory|ZIP/iu));
    expect(await run('--max-pages', '1')).toBe(1);
    expect(console.error).toHaveBeenLastCalledWith(expect.stringMatching(/Unknown/iu));
    expect(await run('--output', output)).toBe(1);
    expect(console.error).toHaveBeenLastCalledWith(expect.stringMatching(/duplicate/iu));
  });
});
