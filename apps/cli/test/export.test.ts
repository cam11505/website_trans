import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseSite } from '@site-rescue/content-schema';
import { runExport } from '../src/export.js';
import { main } from '../src/index.js';

describe('export command', () => {
  it('reads a validated capture and writes a browsable static site', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'site-rescue-cli-export-'));
    const captureDirectory = join(workspace, 'capture');
    const outputDirectory = join(workspace, 'site');
    const assetBytes = Buffer.from('fixture-image');
    const assetChecksum = createHash('sha256').update(assetBytes).digest('hex');
    const site = parseSite({
      schemaVersion: '1.0.0',
      source: {
        adapter: 'fixture',
        baseUrl: 'https://fixture.test/',
        capturedAt: '2026-08-19T00:00:00.000Z',
      },
      metadata: { title: 'CLI export fixture' },
      navigation: [],
      pages: [
        {
          id: 'home',
          sourceUrl: 'https://fixture.test/',
          sourcePath: '/',
          targetPath: '/',
          title: 'Home',
          blocks: [{ type: 'image', src: 'assets/fixture.png', alt: 'Fixture' }],
        },
      ],
      assets: [
        {
          id: 'asset-1',
          sourceUrl: 'https://fixture.test/fixture.png',
          localPath: 'assets/fixture.png',
          mediaType: 'image/png',
          checksum: assetChecksum,
        },
      ],
      redirects: [],
      warnings: [],
    });
    const lines: string[] = [];
    try {
      await mkdir(join(captureDirectory, 'assets'), { recursive: true });
      await writeFile(join(captureDirectory, 'site.json'), `${JSON.stringify(site)}\n`, 'utf8');
      await writeFile(join(captureDirectory, 'assets', 'fixture.png'), assetBytes);

      const result = await runExport(join(captureDirectory, 'site.json'), {
        outputDirectory,
        writeLine: (line) => lines.push(line),
      });

      expect(result).toMatchObject({
        pageCount: 1,
        redirectPageCount: 0,
        copiedAssetCount: 1,
        appliedSourceStylesheetCount: 0,
      });
      expect(await readFile(join(outputDirectory, 'index.html'), 'utf8')).toContain(
        'src="assets/fixture.png"',
      );
      expect(lines).toContain('Site Rescue static export complete');
      expect(lines).toContain('Pages written: 1');
      expect(lines).toContain('Redirect fallback pages written: 0');
      expect(lines).toContain('Assets copied: 1');
      expect(lines).toContain('Source stylesheets applied: 0');
    } finally {
      await rm(workspace, { force: true, recursive: true });
    }
  });

  it('rejects an unsupported style mode before exporting', async () => {
    const lines: string[] = [];
    const error = vi.spyOn(console, 'error').mockImplementation((line?: unknown) => {
      lines.push(String(line));
    });
    try {
      await expect(main(['export', 'site.json', '--style-mode', 'unknown'])).resolves.toBe(1);
      expect(lines).toContain('Error: --style-mode must be either baseline or source.');
    } finally {
      error.mockRestore();
    }
  });
});
