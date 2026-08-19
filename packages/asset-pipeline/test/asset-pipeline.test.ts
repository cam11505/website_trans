import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSite } from '@site-rescue/content-schema';
import { downloadSiteAssets, type AssetFetcher } from '../src/index.js';

function createSite() {
  return parseSite({
    schemaVersion: '1.0.0',
    source: {
      adapter: 'fixture',
      baseUrl: 'https://fixture.test/',
      capturedAt: '2026-08-18T00:00:00.000Z',
    },
    metadata: { title: 'Asset fixture' },
    navigation: [],
    pages: [
      {
        id: 'page-0001',
        sourceUrl: 'https://fixture.test/',
        sourcePath: '/',
        targetPath: '/',
        title: 'Home',
        blocks: [
          { type: 'image', src: 'https://cdn.test/a.png', alt: 'A' },
          {
            type: 'gallery',
            images: [{ type: 'image', src: 'https://cdn.test/copy.png', alt: 'Copy' }],
          },
          {
            type: 'video',
            src: 'https://cdn.test/clip.mp4',
            poster: 'https://cdn.test/missing.jpg',
          },
          {
            type: 'columns',
            columns: [
              [{ type: 'image', src: 'https://cdn.test/a.png', alt: 'Nested' }],
              [{ type: 'paragraph', text: 'Text' }],
            ],
          },
        ],
      },
    ],
    assets: [
      { id: 'asset-0001', sourceUrl: 'https://cdn.test/a.png', mediaType: 'image/png' },
      { id: 'asset-0002', sourceUrl: 'https://cdn.test/copy.png', mediaType: 'image/png' },
      { id: 'asset-0003', sourceUrl: 'https://cdn.test/clip.mp4', mediaType: 'video/mp4' },
      { id: 'asset-0004', sourceUrl: 'https://cdn.test/main.css', mediaType: 'text/css' },
      { id: 'asset-0005', sourceUrl: 'https://cdn.test/missing.jpg', mediaType: 'image/jpeg' },
    ],
    redirects: [],
    warnings: [],
  });
}

const fetcher: AssetFetcher = async (input) => {
  if (input === 'https://cdn.test/missing.jpg') {
    return new Response('Not found', { status: 404 });
  }
  if (input === 'https://cdn.test/clip.mp4') {
    return new Response(new Uint8Array([9, 8, 7]), {
      headers: { 'content-type': 'video/mp4' },
    });
  }
  if (input === 'https://cdn.test/main.css') {
    return new Response(new Uint8Array([1, 2, 3, 4]), {
      headers: { 'content-type': 'text/css; charset=utf-8' },
    });
  }
  return new Response(new Uint8Array([1, 2, 3, 4]), {
    headers: { 'content-type': 'image/png' },
  });
};

describe('asset pipeline', () => {
  it('downloads, hashes, deduplicates, and rewrites content paths', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'site-rescue-assets-'));
    try {
      const result = await downloadSiteAssets(createSite(), { fetcher, outputDirectory });
      expect(result.downloadedAssetCount).toBe(4);
      expect(result.storedFileCount).toBe(3);
      expect(result.deduplicatedAssetCount).toBe(1);
      expect(result.failedAssetCount).toBe(1);

      const [image, copy, video, stylesheet, missing] = result.site.assets;
      expect(image?.localPath).toMatch(/^assets\/[a-f0-9]{64}\.png$/u);
      expect(copy?.localPath).toBe(image?.localPath);
      expect(video?.localPath).toMatch(/^assets\/[a-f0-9]{64}\.mp4$/u);
      expect(stylesheet?.localPath).toMatch(/^assets\/[a-f0-9]{64}\.css$/u);
      expect(stylesheet?.checksum).toBe(image?.checksum);
      expect(stylesheet?.localPath).not.toBe(image?.localPath);
      expect(missing?.localPath).toBeUndefined();

      const [imageBlock, galleryBlock, videoBlock, columnsBlock] = result.site.pages[0]!.blocks;
      expect(imageBlock?.type === 'image' ? imageBlock.src : undefined).toBe(image?.localPath);
      expect(galleryBlock?.type === 'gallery' ? galleryBlock.images[0]?.src : undefined).toBe(
        image?.localPath,
      );
      expect(videoBlock?.type === 'video' ? videoBlock.src : undefined).toBe(video?.localPath);
      expect(videoBlock?.type === 'video' ? videoBlock.poster : undefined).toBe(
        'https://cdn.test/missing.jpg',
      );
      expect(
        columnsBlock?.type === 'columns' && columnsBlock.columns[0]?.[0]?.type === 'image'
          ? columnsBlock.columns[0][0].src
          : undefined,
      ).toBe(image?.localPath);
      expect(result.site.warnings.map((warning) => warning.code)).toContain(
        'asset-download-failed',
      );

      const savedImage = await readFile(join(outputDirectory, image!.localPath!));
      expect([...savedImage]).toEqual([1, 2, 3, 4]);
    } finally {
      await rm(outputDirectory, { force: true, recursive: true });
    }
  });

  it('turns oversized assets into warnings without writing a local path', async () => {
    const site = createSite();
    const outputDirectory = await mkdtemp(join(tmpdir(), 'site-rescue-assets-limit-'));
    try {
      const result = await downloadSiteAssets(
        { ...site, assets: [site.assets[0]!] },
        { fetcher, maxAssetBytes: 2, outputDirectory },
      );
      expect(result.failedAssetCount).toBe(1);
      expect(result.site.assets[0]?.localPath).toBeUndefined();
      expect(result.site.warnings[0]?.message).toContain('2-byte limit');
    } finally {
      await rm(outputDirectory, { force: true, recursive: true });
    }
  });

  it('rejects non-HTTP asset URLs before calling the fetcher', async () => {
    const site = createSite();
    const outputDirectory = await mkdtemp(join(tmpdir(), 'site-rescue-assets-protocol-'));
    let fetchCalled = false;
    try {
      const result = await downloadSiteAssets(
        {
          ...site,
          assets: [
            {
              id: 'asset-data',
              sourceUrl: 'data:text/plain,not-a-network-asset',
              mediaType: 'text/plain',
            },
          ],
        },
        {
          fetcher: async () => {
            fetchCalled = true;
            return new Response('unexpected');
          },
          outputDirectory,
        },
      );
      expect(fetchCalled).toBe(false);
      expect(result.failedAssetCount).toBe(1);
      expect(result.site.warnings[0]?.message).toContain('unsupported URL protocol');
    } finally {
      await rm(outputDirectory, { force: true, recursive: true });
    }
  });
});
