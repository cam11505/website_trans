import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSite } from '@site-rescue/content-schema';
import {
  createMigrationReport,
  renderMigrationReportMarkdown,
  writeMigrationReport,
} from '../src/index.js';

const site = parseSite({
  schemaVersion: '1.0.0',
  source: {
    adapter: 'fixture',
    baseUrl: 'https://fixture.test/',
    capturedAt: '2026-08-19T00:00:00.000Z',
  },
  metadata: { title: 'Report <script>| fixture' },
  navigation: [],
  pages: [
    {
      id: 'home',
      sourceUrl: 'https://fixture.test/',
      sourcePath: '/',
      targetPath: '/',
      title: 'Home',
      blocks: [
        { type: 'heading', level: 1, text: 'Home' },
        {
          type: 'columns',
          columns: [
            [{ type: 'paragraph', text: 'Safe content' }],
            [
              {
                type: 'rawHtml',
                html: '<form></form>',
                reason: 'Unsupported form element',
              },
            ],
          ],
        },
        {
          type: 'embed',
          html: '<iframe src="https://video.test/embed/1"></iframe>',
          provider: 'video.test',
        },
      ],
    },
  ],
  assets: [
    {
      id: 'local',
      sourceUrl: 'https://fixture.test/local.png',
      localPath: 'assets/local.png',
      checksum: 'abc123',
      mediaType: 'image/png',
    },
    {
      id: 'remote',
      sourceUrl: 'https://fixture.test/remote.png',
      mediaType: 'image/png',
    },
  ],
  redirects: [{ from: '/old-home', to: '/', status: 301 }],
  warnings: [
    {
      code: 'asset-download-failed',
      message: 'Could not download asset: HTTP 404',
      sourceUrl: 'https://fixture.test/remote.png',
    },
  ],
});

describe('migration report', () => {
  it('summarizes coverage and manual review requirements', () => {
    const report = createMigrationReport(site);

    expect(report.readiness).toBe('review-required');
    expect(report.summary).toEqual({
      pageCount: 1,
      blockCount: 5,
      assetCount: 2,
      localAssetCount: 1,
      verifiedLocalAssetCount: 1,
      unverifiedLocalAssetCount: 0,
      remoteAssetCount: 1,
      redirectCount: 1,
      warningCount: 1,
      reviewItemCount: 4,
    });
    expect(report.warningCounts).toEqual({ 'asset-download-failed': 1 });
    expect(report.reviewItems.map((item) => item.code)).toEqual([
      'raw-html-review-required',
      'embed-review-required',
      'redirect-deployment-required',
      'remote-asset',
    ]);

    const markdown = renderMigrationReportMarkdown(report);
    expect(markdown).toContain('Readiness: **review-required**');
    expect(markdown).toContain('| Remote assets | 1 |');
    expect(markdown).toContain('| Redirects | 1 |');
    expect(markdown).toContain('**raw-html-review-required**');
    expect(markdown).not.toContain('<script>');
    expect(markdown).toContain('Report \\<script\\>\\| fixture');
  });

  it('writes deterministic JSON and Markdown artifacts', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'site-rescue-report-'));
    try {
      const result = await writeMigrationReport(site, { outputDirectory });
      const storedReport = JSON.parse(await readFile(result.jsonFile, 'utf8')) as unknown;
      const markdown = await readFile(result.markdownFile, 'utf8');

      expect(storedReport).toEqual(result.report);
      expect(markdown).toBe(renderMigrationReportMarkdown(result.report));
    } finally {
      await rm(outputDirectory, { force: true, recursive: true });
    }
  });

  it('requires review for local assets without integrity metadata', () => {
    const input = parseSite({
      ...site,
      assets: [
        ...site.assets,
        {
          id: 'unverified',
          sourceUrl: 'https://fixture.test/unverified.png',
          localPath: 'assets/unverified.png',
          mediaType: 'image/png',
        },
      ],
    });
    const report = createMigrationReport(input);

    expect(report.summary.unverifiedLocalAssetCount).toBe(1);
    expect(report.reviewItems).toContainEqual({
      code: 'unverified-local-asset',
      message: 'Local asset has no checksum and cannot be integrity-verified.',
      sourceUrl: 'https://fixture.test/unverified.png',
    });
  });
});
