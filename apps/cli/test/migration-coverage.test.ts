import { cp, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMigrationReport } from '@site-rescue/report';
import { parseSite } from '@site-rescue/content-schema';
import { genericHtmlAdapter } from '@site-rescue/adapter-generic-html';
import { main } from '../src/index.js';
import { runRescue } from '../src/rescue.js';
import { runCapture } from '../src/capture.js';

let workspace: string;
beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'site-rescue-coverage-'));
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('No public network'); }));
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await rm(workspace, { recursive: true, force: true });
});
const json = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
const fixture = join(process.cwd(), 'fixtures/shared/legacy-report');
const fetcher = async (url: string) => new Response(url.endsWith('/guide.html')
  ? '<title>Guide</title><p>Guide</p>' : '<title>Home</title><p><a href="/guide.html">Guide</a></p>', { headers: { 'content-type': 'text/html' } });

describe('evidence-based migration coverage', () => {
  it('reports unknown source completeness and unchecked static integrity instead of ready for warning-free legacy Site JSON', async () => {
    const site = parseSite(await json(join(fixture, 'site.json')));
    const report = createMigrationReport(site);
    expect(report).toMatchObject({ reportVersion: '2.0.0', readiness: 'review-required', coverage: {
      sourceAcquisition: { status: 'unknown', sourceCompleteness: 'unknown', evidence: null },
      conversion: { status: 'no-known-losses', completeness: 'not-proven' },
      staticIntegrity: { status: 'not-checked' }, manualReview: { status: 'not-assessed' },
    } });
  });

  it.each([1, 3])('keeps acquisition evidence separate from valid static output with maxPages=%s', async (maxPages) => {
    const output = join(workspace, 'rescue');
    const result = await runRescue('https://coverage.example/', { outputDirectory: output, maxPages, fetcher, writeLine: () => undefined });
    const report = await json(result.report.jsonFile);
    expect(report.readiness).toBe('review-required');
    expect(report.coverage.sourceAcquisition).toMatchObject({ status: maxPages === 1 ? 'partial' : 'observed-scope-complete', sourceCompleteness: 'unknown',
      evidence: { kind: 'live-url', discoveredUrlCount: 2, capturedPageCount: maxPages === 1 ? 1 : 2, truncated: maxPages === 1 } });
    expect(report.coverage.staticIntegrity).toMatchObject({ status: 'valid', issueCount: 0 });
    expect(report.coverage.manualReview.status).toBe('not-assessed');
    expect(await main(['verify-bundle', output])).toBe(0);
  });

  it('counts acquisition failures without parsing warning message strings or treating them as conversion loss', async () => {
    const result = await runCapture('https://coverage.example/', { outputDirectory: join(workspace, 'capture'),
      fetcher: async (url) => url.endsWith('/guide.html') ? new Response('missing', { status: 404 }) : fetcher(url), writeLine: () => undefined });
    const reportDirectory = join(workspace, 'report');
    expect(await main(['report', result.outputFile, '--output', reportDirectory])).toBe(0);
    const report = await json(join(reportDirectory, 'migration-report.json'));
    expect(report.coverage.sourceAcquisition).toMatchObject({ status: 'partial', evidence: { acquisitionWarningCount: 1, truncated: false } });
    expect(report.warningGroups.acquisition.map((warning: { code: string }) => warning.code)).toContain('crawl-fetch-failed');
    expect(report.warningGroups.conversion.map((warning: { code: string }) => warning.code)).not.toContain('crawl-fetch-failed');
  });

  it('records generic folder and replay counts while keeping original website completeness unknown', async () => {
    const output = join(workspace, 'imported');
    expect(await main(['import-source', join(process.cwd(), 'fixtures/shared/offline-import'), '--output', output])).toBe(0);
    const report = await json(join(output, 'report/migration-report.json'));
    expect(report.coverage.sourceAcquisition).toMatchObject({ status: 'observed-scope-complete', sourceCompleteness: 'unknown', evidence: {
      kind: 'html-directory', inventoriedHtmlCount: 2, normalizedPageCount: 2, originalFileCount: 6, missingReferenceCount: 0,
    } });
    expect(report.coverage.staticIntegrity.status).toBe('valid');
    const replay = join(workspace, 'replay');
    expect(await main(['replay-source', join(output, 'capture/source'), '--output', replay])).toBe(0);
    expect((await json(join(replay, 'report/migration-report.json'))).coverage.sourceAcquisition.evidence.kind).toBe('snapshot-replay');
  });

  it('does not call a recorded asset checksum a completed byte verification', async () => {
    const site = parseSite({ ...await json(join(fixture, 'site.json')), assets: [{ id: 'a', sourceUrl: 'https://legacy.example/image.png', localPath: 'assets/image.png', checksum: 'a'.repeat(64) }] });
    const report = createMigrationReport(site);
    expect(report.summary).toMatchObject({ checksumRecordedLocalAssetCount: 1 });
    expect(report.summary).not.toHaveProperty('verifiedLocalAssetCount');
    expect(report).toMatchObject({ coverage: { staticIntegrity: { status: 'not-checked' } } });
  });

  it('distinguishes acquired pages from pages omitted by normalization', async () => {
    const result = await runCapture('https://coverage.example/', { outputDirectory: join(workspace, 'capture'), fetcher,
      adapters: [{ ...genericHtmlAdapter, normalize: (input) => {
        const site = genericHtmlAdapter.normalize(input);
        return parseSite({ ...site, pages: site.pages.slice(0, 1), warnings: [] });
      } }], writeLine: () => undefined });
    const report = join(workspace, 'report');
    expect(await main(['report', result.outputFile, '--output', report])).toBe(0);
    const value = await json(join(report, 'migration-report.json'));
    expect(value.coverage.sourceAcquisition).toMatchObject({ status: 'observed-scope-complete', evidence: { capturedPageCount: 2, normalizedPageCount: 1 } });
    expect(value.coverage.conversion).toMatchObject({ status: 'review-required', unrepresentedPageCount: 1, completeness: 'not-proven' });
  });

  it('uses real static verification only when explicitly requested, with invalid results kept separate from manual review', async () => {
    const siteDirectory = join(workspace, 'site');
    await mkdir(siteDirectory);
    await writeFile(join(siteDirectory, 'index.html'), '<img src="missing.png">');
    const output = join(workspace, 'report');
    expect(await main(['report', join(fixture, 'site.json'), '--output', output, '--site-directory', siteDirectory])).toBe(0);
    const report = await json(join(output, 'migration-report.json'));
    expect(report.coverage.staticIntegrity).toMatchObject({ status: 'invalid', issueCount: 1 });
    expect(report.coverage.sourceAcquisition.status).toBe('unknown');
    const markdown = await readFile(join(output, 'migration-report.md'), 'utf8');
    for (const label of ['Source acquisition', 'Conversion', 'Static integrity', 'Manual deployment review', 'not proof of complete migration']) expect(markdown).toContain(label);
  });

  it('rejects stale acquisition evidence instead of combining it with a different Site', async () => {
    const result = await runCapture('https://coverage.example/', { outputDirectory: join(workspace, 'capture'), fetcher, writeLine: () => undefined });
    const site = await json(result.outputFile);
    site.metadata.title = 'Changed after acquisition';
    await writeFile(result.outputFile, JSON.stringify(site));
    const output = join(workspace, 'report');
    expect(await main(['report', result.outputFile, '--output', output])).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/evidence.*(match|checksum)/iu));
  });

  it('keeps unknown warning codes visible and handles prototype-like codes safely', async () => {
    const site = parseSite({ ...await json(join(fixture, 'site.json')), warnings: ['future-code', '__proto__', 'constructor'].map((code) => ({ code, message: 'Unknown warning' })) });
    const report = createMigrationReport(site);
    expect(report.warningCounts).toEqual({ 'future-code': 1, ['__proto__']: 1, constructor: 1 });
    expect(report).toMatchObject({ warningGroups: { unclassified: site.warnings } });
  });

  it.each(['version', 'malformed', 'oversized', 'counts'])('rejects %s acquisition evidence explicitly', async (mode) => {
    const result = await runCapture('https://coverage.example/', { outputDirectory: join(workspace, 'capture'), fetcher, writeLine: () => undefined });
    const evidencePath = join(workspace, 'capture/acquisition-evidence.json');
    const evidence = await json(evidencePath);
    if (mode === 'version') evidence.evidenceVersion = '999';
    if (mode === 'counts') evidence.acquisition.capturedPageCount = 0;
    await writeFile(evidencePath, mode === 'malformed' ? '{invalid' : mode === 'oversized' ? ' '.repeat(1024 * 1024 + 1) : JSON.stringify(evidence));
    const report = join(workspace, 'report');
    expect(await main(['report', result.outputFile, '--output', report])).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/evidence/iu));
    await expect(readFile(join(report, 'migration-report.json'))).rejects.toThrow();
  });

  it.skipIf(process.platform === 'win32')('rejects a symlinked evidence sidecar', async () => {
    const result = await runCapture('https://coverage.example/', { outputDirectory: join(workspace, 'capture'), fetcher, writeLine: () => undefined });
    const path = join(workspace, 'capture/acquisition-evidence.json');
    const outside = join(workspace, 'evidence.json');
    await rename(path, outside);
    await symlink(outside, path);
    expect(await main(['report', result.outputFile, '--output', join(workspace, 'report')])).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/symbolic link/iu));
  });

  it('rejects altered v2 coverage metrics when building a bundle manifest', async () => {
    const output = join(workspace, 'imported');
    expect(await main(['import-source', join(process.cwd(), 'fixtures/shared/offline-import'), '--output', output])).toBe(0);
    const reportPath = join(output, 'report/migration-report.json');
    const report = await json(reportPath);
    report.coverage.staticIntegrity.checkedReferenceCount += 1;
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    expect(await main(['manifest', output])).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/migration-report.json does not match/iu));
  });

  it('keeps version 1.0 reports and bundle verification compatible', async () => {
    const bundle = join(workspace, 'legacy-bundle');
    await mkdir(join(bundle, 'capture'), { recursive: true });
    await mkdir(join(bundle, 'report'));
    await mkdir(join(bundle, 'site'));
    await cp(join(fixture, 'site.json'), join(bundle, 'capture/site.json'));
    for (const path of ['migration-report.json', 'migration-report.md']) await cp(join(fixture, path), join(bundle, 'report', path));
    await writeFile(join(bundle, 'site/index.html'), '<h1>Legacy</h1>');
    expect(await main(['manifest', bundle])).toBe(0);
    expect(await main(['verify-bundle', bundle])).toBe(0);
    expect((await json(join(bundle, 'report/migration-report.json'))).reportVersion).toBe('1.0.0');
  });
});
