import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSite, type Site } from '@site-rescue/content-schema';
import { exportStaticHtml, targetPathToFile } from '../src/index.js';

function createFixtureSite(checksum: string): Site {
  return parseSite({
    schemaVersion: '1.0.0',
    source: {
      adapter: 'fixture-platform',
      baseUrl: 'https://fixture.test/',
      capturedAt: '2026-08-19T00:00:00.000Z',
    },
    metadata: {
      title: 'Fixture & Friends',
      description: 'A safe <static> export',
      language: 'en',
    },
    navigation: [
      {
        label: 'Home',
        href: 'https://fixture.test/',
        children: [
          {
            label: 'About',
            href: 'https://fixture.test/about.html',
            children: [],
          },
        ],
      },
    ],
    pages: [
      {
        id: 'home',
        sourceUrl: 'https://fixture.test/',
        sourcePath: '/',
        targetPath: '/',
        title: 'Home <unsafe>',
        blocks: [
          { type: 'heading', level: 1, text: 'Welcome & hello' },
          { type: 'paragraph', text: '<script>alert(1)</script>' },
          { type: 'image', src: 'assets/hero.png', alt: 'Hero "image"' },
          { type: 'button', label: 'About', href: 'https://fixture.test/about.html' },
          {
            type: 'rawHtml',
            html: '<script>window.bad = true</script>',
            reason: 'fixture fallback',
          },
        ],
      },
      {
        id: 'about',
        sourceUrl: 'https://fixture.test/about.html',
        sourcePath: '/about.html',
        targetPath: '/company/about/',
        title: 'About',
        blocks: [
          { type: 'paragraph', text: 'About us' },
          { type: 'button', label: 'Home', href: 'https://fixture.test/' },
        ],
      },
    ],
    assets: [
      {
        id: 'hero',
        sourceUrl: 'https://fixture.test/hero.png',
        localPath: 'assets/hero.png',
        mediaType: 'image/png',
        checksum,
      },
    ],
    redirects: [],
    warnings: [],
  });
}

describe('static HTML exporter', () => {
  it('writes safe pages, copies verified assets, and rewrites local links', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'site-rescue-export-'));
    const captureDirectory = join(workspace, 'capture');
    const outputDirectory = join(workspace, 'site');
    const bytes = Buffer.from([1, 2, 3, 4]);
    const checksum = createHash('sha256').update(bytes).digest('hex');
    try {
      await mkdir(join(captureDirectory, 'assets'), { recursive: true });
      await writeFile(join(captureDirectory, 'assets', 'hero.png'), bytes);

      const result = await exportStaticHtml(createFixtureSite(checksum), {
        captureDirectory,
        outputDirectory,
      });

      expect(result).toMatchObject({ pageCount: 2, copiedAssetCount: 1 });
      const home = await readFile(join(outputDirectory, 'index.html'), 'utf8');
      const about = await readFile(join(outputDirectory, 'company', 'about', 'index.html'), 'utf8');
      expect(home).toContain('<title>Home &lt;unsafe&gt;</title>');
      expect(home).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(home).toContain('src="assets/hero.png"');
      expect(home).toContain('href="company/about/index.html"');
      expect(home).not.toContain('<script>window.bad');
      expect(about).toContain('href="../../index.html"');
      expect(about).toContain('href="../../assets/site-rescue.css"');
      expect(await readFile(join(outputDirectory, 'assets', 'hero.png'))).toEqual(bytes);
      expect(await readFile(join(outputDirectory, 'assets', 'site-rescue.css'), 'utf8')).toContain(
        '.sr-columns',
      );
    } finally {
      await rm(workspace, { force: true, recursive: true });
    }
  });

  it('maps clean paths and rejects traversal attempts', () => {
    expect(targetPathToFile('/')).toBe('index.html');
    expect(targetPathToFile('/about.html?preview=1')).toBe('about.html');
    expect(targetPathToFile('/company/about')).toBe('company/about/index.html');
    expect(() => targetPathToFile('/%2e%2e/private')).toThrow('Unsafe target path');
    expect(() => targetPathToFile('relative')).toThrow('absolute site path');
  });

  it('rejects assets whose captured checksum no longer matches', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'site-rescue-export-checksum-'));
    const captureDirectory = join(workspace, 'capture');
    try {
      await mkdir(join(captureDirectory, 'assets'), { recursive: true });
      await writeFile(join(captureDirectory, 'assets', 'hero.png'), 'tampered');
      await expect(
        exportStaticHtml(createFixtureSite('wrong-checksum'), {
          captureDirectory,
          outputDirectory: join(workspace, 'site'),
        }),
      ).rejects.toThrow('Asset checksum mismatch');
    } finally {
      await rm(workspace, { force: true, recursive: true });
    }
  });

  it('rejects local asset paths that escape the assets directory', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'site-rescue-export-asset-path-'));
    try {
      const site = createFixtureSite('unused');
      site.assets[0] = { ...site.assets[0]!, localPath: 'assets/../private.txt' };
      await expect(
        exportStaticHtml(site, {
          captureDirectory: workspace,
          outputDirectory: join(workspace, 'site'),
        }),
      ).rejects.toThrow('Unsafe local asset path');
    } finally {
      await rm(workspace, { force: true, recursive: true });
    }
  });
});
