import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, parseSite } from '@site-rescue/content-schema';
import { crawlSameOrigin, type Fetcher } from '@site-rescue/crawler';
import { genericHtmlAdapter } from '@site-rescue/adapter-generic-html';
import { createMigrationReport, type MigrationReport } from '@site-rescue/report';
import { runCapture } from '../src/capture.js';
import { runReport } from '../src/report.js';
import { runRescue } from '../src/rescue.js';

const sourceUrl = 'https://crawl-fixture.weebly.com/';
const fixtureDirectory = join(process.cwd(), 'fixtures', 'weebly', 'crawl-limit');
const fixtureFiles = new Map([
  ['/', 'index.html'],
  ['/about.html', 'about.html'],
  ['/contact.html', 'contact.html'],
]);
const fetcher: Fetcher = async (input) => {
  const url = new URL(input);
  const file = fixtureFiles.get(url.pathname);
  if (url.origin !== new URL(sourceUrl).origin || file === undefined) {
    throw new Error(`Unexpected fixture request: ${input}`);
  }
  return new Response(await readFile(join(fixtureDirectory, file), 'utf8'), {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
};

describe('crawl truncation readiness', () => {
  it('reproduces a warning-free crawl truncated before all pages are discovered', async () => {
    const crawl = await crawlSameOrigin(sourceUrl, { fetcher, maxPages: 1 });

    expect(crawl.truncated).toBe(true);
    expect(crawl.pages).toHaveLength(1);
    expect(crawl.discoveredUrls).toEqual([sourceUrl, `${sourceUrl}about.html`]);
    expect(crawl.warnings).toEqual([]);
  });

  it.each([false, true])(
    'persists truncation and requires report review with downloadAssets=%s',
    async (downloadAssets) => {
      const workspace = await mkdtemp(join(tmpdir(), 'site-rescue-crawl-limit-'));
      const lines: string[] = [];
      try {
        const capture = await runCapture(sourceUrl, {
          downloadAssets,
          fetcher,
          maxPages: 1,
          outputDirectory: join(workspace, 'capture'),
          writeLine: (line) => lines.push(line),
        });
        const site = parseSite(JSON.parse(await readFile(capture.outputFile, 'utf8')) as unknown);
        const report = await runReport(capture.outputFile, {
          outputDirectory: join(workspace, 'report'),
          writeLine: () => undefined,
        });
        const json = JSON.parse(await readFile(report.jsonFile, 'utf8')) as MigrationReport;

        // With no assets or unsupported blocks, truncation is the only reason for review.
        expect(report.readiness).toBe('review-required');
        expect(site.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
        expect(site.pages).toHaveLength(1);
        expect(site.warnings).toEqual([
          {
            code: 'crawl-truncated',
            sourceUrl,
            message: expect.stringContaining('maxPages=1'),
          },
        ]);
        const warning = site.warnings[0]!;
        expect(warning.message).toContain('1 page(s)');
        expect(warning.message).toContain('2 URL(s)');
        expect(warning.message).toContain('additional pages may remain undiscovered');
        expect(warning.message).toContain('--max-pages');
        expect(capture.warningCount).toBe(1);
        expect(json).toMatchObject({
          reportVersion: '1.0.0',
          readiness: 'review-required',
          warningCounts: { 'crawl-truncated': 1 },
          warnings: site.warnings,
          summary: { warningCount: 1, reviewItemCount: 0 },
        });
        expect(await readFile(report.markdownFile, 'utf8')).toContain(warning.message);
        expect(lines).toContain('Site Rescue capture incomplete');
        expect(lines.some((line) => line.includes(warning.message))).toBe(true);
        expect(lines).not.toContain('Site Rescue capture complete');
      } finally {
        await rm(workspace, { recursive: true, force: true });
      }
    },
  );

  it('keeps rescue integrity success separate from an incomplete capture', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'site-rescue-truncated-rescue-'));
    const lines: string[] = [];
    try {
      const rescue = await runRescue(sourceUrl, {
        fetcher,
        maxPages: 1,
        outputDirectory: join(workspace, 'rescue'),
        writeLine: (line) => lines.push(line),
      });
      const json = JSON.parse(await readFile(rescue.report.jsonFile, 'utf8')) as MigrationReport;

      expect(rescue.verification.valid).toBe(true);
      expect(rescue.manifest).toBeDefined();
      expect(rescue.report.readiness).toBe('review-required');
      expect(json.warnings).toEqual([
        expect.objectContaining({ code: 'crawl-truncated', sourceUrl }),
      ]);
      expect(lines).toContain('Readiness: review-required');
      expect(lines).toContain('Site Rescue finished with incomplete capture');
      expect(lines.some((line) => line.includes('additional pages may remain undiscovered'))).toBe(true);
      expect(lines.some((line) => line.includes('--max-pages'))).toBe(true);
      expect(lines).not.toContain('Site Rescue complete');
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it.each([3, undefined])('keeps a fully crawled fixture ready with maxPages=%s', async (maxPages) => {
    const workspace = await mkdtemp(join(tmpdir(), 'site-rescue-full-crawl-'));
    const lines: string[] = [];
    try {
      const crawl = await crawlSameOrigin(sourceUrl, { fetcher, maxPages });
      expect(crawl.truncated).toBe(false);
      const rescue = await runRescue(sourceUrl, {
        fetcher,
        maxPages,
        outputDirectory: join(workspace, 'rescue'),
        writeLine: (line) => lines.push(line),
      });
      const site = parseSite(
        JSON.parse(await readFile(rescue.capture.outputFile, 'utf8')) as unknown,
      );

      expect(site.pages).toHaveLength(3);
      expect(site.warnings).toEqual([]);
      expect(rescue.report.readiness).toBe('ready');
      expect(rescue.verification.valid).toBe(true);
      expect(lines).toContain('Site Rescue complete');
      expect(lines).toContain('Readiness: ready');
      expect(lines.some((line) => line.includes('incomplete'))).toBe(false);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it('propagates truncation independently of the selected adapter', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'site-rescue-generic-crawl-limit-'));
    try {
      const capture = await runCapture(sourceUrl, {
        adapters: [genericHtmlAdapter],
        fetcher,
        maxPages: 1,
        outputDirectory: join(workspace, 'capture'),
        writeLine: () => undefined,
      });
      const site = parseSite(JSON.parse(await readFile(capture.outputFile, 'utf8')) as unknown);

      expect(site.source.adapter).toBe('generic-html');
      expect(site.warnings.map((warning) => warning.code)).toEqual([
        'generic-html-fallback',
        'crawl-truncated',
      ]);
      expect(createMigrationReport(site).readiness).toBe('review-required');
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
