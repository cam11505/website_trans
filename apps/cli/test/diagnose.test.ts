import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseSite } from '@site-rescue/content-schema';
import type { Fetcher } from '@site-rescue/crawler';
import { runCapture } from '../src/capture.js';
import { runDiagnose } from '../src/diagnose.js';

const fixturePages = new Map<string, string>([
  [
    'https://fixture.weebly.com/',
    '<meta name="generator" content="Weebly"><title>Home</title><link rel="stylesheet" href="/theme.css"><nav><a href="/">Home</a><a href="/about.html">About</a></nav><main id="wsite-content"><h1>Home</h1><p>Hello</p><img src="/hero.png" alt="Hero"></main><a href="https://outside.test/">Outside</a>',
  ],
  ['https://fixture.weebly.com/about.html', '<title>About</title><a href="/">Home</a>'],
]);

const fetcher: Fetcher = async (input) => {
  if (input === 'https://fixture.weebly.com/hero.png') {
    return new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'image/png' },
    });
  }
  if (input === 'https://fixture.weebly.com/theme.css') {
    return new Response('body { color: navy; }', {
      status: 200,
      headers: { 'content-type': 'text/css' },
    });
  }
  const html = fixturePages.get(input);
  return html === undefined
    ? new Response('Not found', { status: 404 })
    : new Response(html, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
};

describe('diagnose command', () => {
  it('reports Weebly and discovered same-origin pages', async () => {
    const lines: string[] = [];
    await runDiagnose('fixture.weebly.com', {
      fetcher,
      writeLine: (line) => lines.push(line),
    });
    expect(lines).toContain('Platform: Weebly (100% confidence)');
    expect(lines).toContain('Discovered pages (2):');
    expect(lines).toContain('  - /');
    expect(lines).toContain('  - /about.html');
    expect(lines.some((line) => line.includes('outside.test'))).toBe(false);
  });

  it('reports same-origin redirect aliases separately from unique pages', async () => {
    const lines: string[] = [];
    const redirectFetcher: Fetcher = async (input) => {
      if (input.endsWith('/')) {
        return new Response(
          '<meta name="generator" content="Weebly"><title>Home</title><a href="/legacy">Legacy</a>',
          { status: 200, headers: { 'content-type': 'text/html' } },
        );
      }
      const response = new Response('<title>About</title>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
      Object.defineProperty(response, 'url', {
        value: 'https://fixture.weebly.com/about.html',
      });
      return response;
    };

    await runDiagnose('fixture.weebly.com', {
      fetcher: redirectFetcher,
      writeLine: (line) => lines.push(line),
    });

    expect(lines).toContain('Discovered pages (2):');
    expect(lines).toContain('Discovered redirects (1):');
    expect(lines).toContain('  - /legacy -> /about.html');
  });

  it('captures a validated site.json artifact', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'site-rescue-'));
    const outputDirectory = join(workspace, 'capture');
    const lines: string[] = [];
    try {
      const result = await runCapture('fixture.weebly.com', {
        capturedAt: '2026-08-14T00:00:00.000Z',
        fetcher,
        outputDirectory,
        writeLine: (line) => lines.push(line),
      });
      const site = parseSite(JSON.parse(await readFile(result.outputFile, 'utf8')) as unknown);
      expect(result.pageCount).toBe(2);
      expect(result.downloadedAssetCount).toBe(2);
      expect(result.storedFileCount).toBe(2);
      expect(result.failedAssetCount).toBe(0);
      expect(result.redirectCount).toBe(0);
      expect(site.pages.map((page) => page.title)).toEqual(['Home', 'About']);
      expect(site.assets.map((asset) => asset.sourceUrl)).toEqual([
        'https://fixture.weebly.com/hero.png',
        'https://fixture.weebly.com/theme.css',
      ]);
      expect(site.assets.every((asset) => asset.localPath !== undefined)).toBe(true);
      const hero = site.assets.find((asset) => asset.sourceUrl.endsWith('/hero.png'))!;
      const image = site.pages[0]?.blocks.find((block) => block.type === 'image');
      expect(image?.type === 'image' ? image.src : undefined).toBe(hero.localPath);
      expect(await readFile(join(outputDirectory, hero.localPath!))).toEqual(
        Buffer.from([1, 2, 3]),
      );
      expect(lines).toContain('Site Rescue capture complete');
      expect(lines).toContain('Assets downloaded: 2');
    } finally {
      await rm(workspace, { force: true, recursive: true });
    }
  });
});
