import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSite, type Site } from '@site-rescue/content-schema';
import { targetPathToFile } from '@site-rescue/exporter-static-html';
import { genericHtmlAdapter } from '@site-rescue/adapter-generic-html';
import { weeblyAdapter } from '@site-rescue/adapter-weebly';
import { applyRedirectEvidence } from '@site-rescue/redirects';
import { runExport } from '../src/export.js';
import { main } from '../src/index.js';
import { runRescue } from '../src/rescue.js';

let workspace: string;
let output: string;
const origin = 'https://query.example';
const variants = ['/page.html?id=1', '/page.html?id=2'];
function fixture(): Site {
  return parseSite({ schemaVersion: '1.1.0', source: { adapter: 'fixture', baseUrl: `${origin}/`, capturedAt: '2026-10-16T00:00:00.000Z' },
    metadata: { title: 'Query fixture' }, navigation: [{ label: 'Two', href: origin + variants[1], children: [] }], assets: [], warnings: [], redirects: [],
    pages: ['/', ...variants].map((path, index) => ({ id: `p${index}`, sourceUrl: origin + path, sourcePath: path, targetPath: path, title: path,
      blocks: [{ type: 'heading', level: 1, text: `Variant ${index}`, id: 'details' }, { type: 'paragraph', text: 'One and two', inlines: variants.map((href) => ({ type: 'link', href: `${origin}${href}#details`, children: [{ type: 'text', value: href }] })) }] })),
  });
}
beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'site-rescue-query-'));
  output = join(workspace, 'site');
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Query export must remain offline'); }));
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await rm(workspace, { recursive: true, force: true });
});
async function exportSite(site = fixture(), target = output) {
  const input = join(workspace, 'site.json');
  await writeFile(input, JSON.stringify(site));
  return runExport(input, { outputDirectory: target, writeLine: () => undefined });
}
const mapping = async (target = output) => JSON.parse(await readFile(join(target, 'url-mapping.json'), 'utf8'));

describe('query-bearing URL output mapping', () => {
  it('exports distinct query variants with stable traceable paths and working inline/navigation fragment links', async () => {
    const result = await exportSite();
    expect(result.pageCount).toBe(3);
    const map = await mapping();
    expect(map).toMatchObject({ mappingVersion: '1.0.0', queryPolicy: 'exact-serialized-query' });
    const files = variants.map((path) => map.pages.find((page: { sourceUrl: string }) => page.sourceUrl === origin + path).outputFile);
    expect(new Set(files).size).toBe(2);
    expect(files.every((file: string) => /^__site-rescue-query\/[a-f0-9]{64}\.html$/u.test(file))).toBe(true);
    const home = await readFile(join(output, 'index.html'), 'utf8');
    for (const file of files) expect(home).toContain(`href="${file}#details"`);
    expect(home).toContain(`href="${files[1]}"`);
    expect(await main(['verify', output])).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not merge ordering, duplicate parameters, encodings, empty values or an empty query marker', () => {
    const paths = ['/p', '/p?', '/p?id=', '/p?id=1&id=2', '/p?id=2&id=1', '/p?a=1&b=2', '/p?b=2&a=1', '/p?q=a+b', '/p?q=a%20b', '/p?q=%2F', '/p?q=%2f'];
    const files = paths.map(targetPathToFile);
    expect(new Set(files).size).toBe(paths.length);
    for (let index = 0; index < paths.length; index++) expect(targetPathToFile(paths[index]!)).toBe(files[index]);
    expect(targetPathToFile('/about.html')).toBe('about.html');
    expect(targetPathToFile('/p?q=../a\\b#details')).toBe(targetPathToFile('/p?q=../a\\b'));
  });

  it('keeps the mapping independent of source page enumeration order', async () => {
    const site = fixture();
    await exportSite(site);
    const second = join(workspace, 'second');
    await exportSite(parseSite({ ...site, pages: [...site.pages].reverse() }), second);
    expect(await readFile(join(second, 'url-mapping.json'))).toEqual(await readFile(join(output, 'url-mapping.json')));
  });

  it('maps query redirects and rewrites alias links directly to the final local page with its fragment', async () => {
    let site = fixture();
    const applied = applyRedirectEvidence(site, [
      { fromUrl: `${origin}/old?id=1`, toUrl: origin + variants[0] },
      { fromUrl: `${origin}/old?id=2`, toUrl: origin + variants[1] },
      { fromUrl: `${origin}/legacy`, toUrl: origin + variants[0] },
    ]);
    expect(applied.addedRedirectCount).toBe(3);
    expect(applied.warningCount).toBe(0);
    site = parseSite({ ...applied.site, navigation: [{ label: 'Alias', href: `${origin}/old?id=1#details`, children: [] }] });
    const result = await exportSite(site);
    expect(result.redirectPageCount).toBe(3);
    const manifest = JSON.parse(await readFile(join(output, 'redirects.json'), 'utf8'));
    expect(manifest).toMatchObject({ version: '2.0.0', queryMatching: 'exact-serialized-path-and-query' });
    const map = await mapping();
    const target = map.pages.find((page: { sourceUrl: string }) => page.sourceUrl === origin + variants[0]).outputFile;
    expect(await readFile(join(output, 'index.html'), 'utf8')).toContain(`href="${target}#details"`);
    const redirect = map.redirects.find((item: { from: string }) => item.from === '/old?id=1');
    expect(await readFile(join(output, redirect.outputFile), 'utf8')).toContain('Page moved');
    expect(await main(['verify', output])).toBe(0);
  });

  it('creates a static entry page for a query-only start URL without overriding an existing home page', async () => {
    const site = fixture();
    const only = parseSite({ ...site, source: { ...site.source, baseUrl: origin + variants[0] }, navigation: [], pages: [site.pages[1]] });
    await exportSite(only);
    const map = await mapping();
    expect(map.entryPoint).toMatchObject({ outputFile: 'index.html', targetFile: targetPathToFile(variants[0]!) });
    expect(await readFile(join(output, 'index.html'), 'utf8')).toContain('Page moved');
    const second = join(workspace, 'second');
    await exportSite(parseSite({ ...site, source: { ...site.source, baseUrl: origin + variants[0] } }), second);
    expect((await mapping(second)).entryPoint).toBeNull();
    expect(await readFile(join(second, 'index.html'), 'utf8')).toContain('Variant 0');
  });

  it('retains unknown query links without rewriting them to an unrelated captured variant', async () => {
    const site = fixture();
    site.navigation.push({ label: 'Uncaptured', href: `${origin}/page.html?id=missing`, children: [] });
    await exportSite(site);
    expect(await readFile(join(output, 'index.html'), 'utf8')).toContain(`href="${origin}/page.html?id=missing"`);
    expect((await mapping()).unresolvedQueryLinks).toContainEqual(expect.objectContaining({ reference: `${origin}/page.html?id=missing` }));
  });

  it('resolves a query-relative saved button against its source page instead of the site home', async () => {
    const site = fixture();
    site.pages[1]!.blocks.push({ type: 'button', label: 'Other variant', href: '?id=2#details' });
    await exportSite(site);
    expect(await readFile(join(output, targetPathToFile(variants[0]!)), 'utf8')).toContain(`<a class="sr-button" href="${targetPathToFile(variants[1]!).split('/').at(-1)}#details">Other variant</a>`);
  });

  it('preserves an uncaptured relative query as its original absolute source URL', async () => {
    const site = fixture();
    site.pages[1]!.blocks.push({ type: 'button', label: 'Unknown variant', href: '?id=missing#details' });
    await exportSite(site);
    expect(await readFile(join(output, targetPathToFile(variants[0]!)), 'utf8')).toContain(`<a class="sr-button" href="${origin}/page.html?id=missing#details">Unknown variant</a>`);
  });

  it('warns on uncaptured query links even when no known query mapping artifact is needed', async () => {
    const site = fixture();
    const plain = parseSite({ ...site, pages: [site.pages[0]], navigation: [{ label: 'Unknown', href: `${origin}/p?id=missing`, children: [] }] });
    const input = join(workspace, 'plain.json');
    await writeFile(input, JSON.stringify(plain));
    const lines: string[] = [];
    const result = await runExport(input, { outputDirectory: output, writeLine: (line) => lines.push(line) });
    expect(result.mappingFile).toBeUndefined();
    expect(result.unresolvedQueryReferenceCount).toBe(3);
    expect(lines.some((line) => line.includes('uncaptured same-origin query'))).toBe(true);
    expect(await readdir(output)).not.toContain('url-mapping.json');
  });

  it.each(['generic-html', 'weebly'])('rescues observed query variants and HTTP aliases through the entire %s pipeline', async (adapter) => {
    const html = (title: string) => `<title>${title}</title>${adapter === 'weebly' ? '<meta name="generator" content="Weebly">' : ''}<nav><a href="/page.html?id=1">One</a><a href="/page.html?id=2">Two</a><a href="/old?id=1">Alias</a></nav><main id="wsite-content"><h1 id="details">${title}</h1><p><a href="?id=2#details">Next</a></p></main>`;
    const result = await runRescue(`${origin}/`, {
      adapters: [adapter === 'weebly' ? weeblyAdapter : genericHtmlAdapter],
      outputDirectory: output,
      writeLine: () => undefined,
      fetcher: async (input) => {
        const final = input === `${origin}/old?id=1` ? `${origin}${variants[0]}` : input;
        const response = new Response(html(final), { status: 200, headers: { 'content-type': 'text/html' } });
        Object.defineProperty(response, 'url', { value: final });
        return response;
      },
    });
    const site = parseSite(JSON.parse(await readFile(join(result.captureDirectory, 'site.json'), 'utf8')));
    expect(site.source.adapter).toBe(adapter);
    expect(site.pages.map((page) => page.targetPath).sort()).toEqual(['/', '/?id=2', ...variants]);
    expect(site.redirects).toContainEqual({ from: '/old?id=1', to: variants[0], status: 301 });
    expect(result.verification).toMatchObject({ valid: true, issueCount: 0 });
    const report = JSON.parse(await readFile(join(result.reportDirectory, 'migration-report.json'), 'utf8'));
    expect(report).toMatchObject({ reportVersion: '2.0.0', readiness: 'review-required', coverage: { sourceAcquisition: { sourceCompleteness: 'unknown' }, staticIntegrity: { status: 'valid' } } });
    const manifest = JSON.parse(await readFile(join(output, 'rescue-manifest.json'), 'utf8'));
    expect(manifest.files).toContainEqual(expect.objectContaining({ path: 'site/url-mapping.json' }));
    expect(await main(['verify-bundle', output])).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['/../p?x=1', '/%2e%2e/p?x=1', '/bad%2fpath?x=1', '/bad%5cpath?x=1'])('validates unsafe pathname before hashing %s', (path) => {
    expect(() => targetPathToFile(path)).toThrow(/Unsafe target path/iu);
  });

  it('rejects reserved mapping-file and generated-output collisions without leaving output', async () => {
    const site = fixture();
    for (const path of ['/url-mapping.json', `/${targetPathToFile(variants[0]!)}`]) {
      await expect(exportSite(parseSite({ ...site, pages: [...site.pages, { ...site.pages[0], id: 'collision', sourceUrl: `${origin}/collision`, targetPath: path }] }))).rejects.toThrow(/same file|collid/iu);
      await expect(readdir(output)).rejects.toThrow();
    }
  });

  it('preserves existing output and duplicate-source protection', async () => {
    await mkdir(output);
    await writeFile(join(output, 'keep'), 'untouched');
    await expect(exportSite()).rejects.toThrow(/already exists/iu);
    expect(await readFile(join(output, 'keep'), 'utf8')).toBe('untouched');
    const site = fixture();
    await expect(exportSite(parseSite({ ...site, pages: [...site.pages, { ...site.pages[0], id: 'dup', targetPath: '/different' }] }), join(workspace, 'new'))).rejects.toThrow(/same source URL/iu);
  });

  it.each([genericHtmlAdapter, weeblyAdapter])('retains empty-query identity in $id normalization', (adapter) => {
    const site = adapter.normalize({ baseUrl: `${origin}/page.html?`, capturedAt: '2026-10-16T00:00:00.000Z',
      pages: [`${origin}/page.html?`, `${origin}/page.html`].map((url) => ({ url, title: 'Page', html: '<main><div id="wsite-content"><p>Page</p></div></main>' })) });
    expect(site.pages.map((page) => page.targetPath)).toEqual(['/page.html?', '/page.html']);
  });
});
