import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSite } from '@site-rescue/content-schema';
import type { Fetcher } from '@site-rescue/crawler';
import { runRescue } from '../src/rescue.js';

const fixturePages = new Map<string, string>([
  [
    'https://fixture.weebly.com/',
    '<meta name="generator" content="Weebly"><title>Home</title><link rel="stylesheet" href="/theme.css"><nav><a href="/">Home</a><a href="/about.html">About</a></nav><main id="wsite-content"><h1>Home</h1><p>Hello</p><img src="/hero.png" alt="Hero"></main>',
  ],
  [
    'https://fixture.weebly.com/about.html',
    '<title>About</title><nav><a href="/">Home</a></nav><main id="wsite-content"><h1>About</h1><p>About us</p></main>',
  ],
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

describe('rescue command', () => {
  it('captures and exports a Weebly fixture in one operation', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'site-rescue-cli-rescue-'));
    const lines: string[] = [];
    try {
      const result = await runRescue('fixture.weebly.com', {
        capturedAt: '2026-08-19T00:00:00.000Z',
        fetcher,
        outputDirectory,
        writeLine: (line) => lines.push(line),
      });
      const site = parseSite(
        JSON.parse(await readFile(join(result.captureDirectory, 'site.json'), 'utf8')) as unknown,
      );
      const home = await readFile(join(result.siteDirectory, 'index.html'), 'utf8');
      const about = await readFile(join(result.siteDirectory, 'about.html'), 'utf8');
      const report = JSON.parse(
        await readFile(join(result.reportDirectory, 'migration-report.json'), 'utf8'),
      ) as { readiness: string; summary: { pageCount: number } };

      expect(result.capture).toMatchObject({
        pageCount: 2,
        downloadedAssetCount: 2,
        failedAssetCount: 0,
      });
      expect(result.export).toMatchObject({ pageCount: 2, copiedAssetCount: 2 });
      expect(result.verification).toMatchObject({ valid: true, issueCount: 0 });
      expect(site.source.adapter).toBe('weebly');
      expect(home).toContain('<h1>Home</h1>');
      expect(home).toContain('href="about.html"');
      expect(home).toMatch(/src="assets\/[a-f0-9]{64}\.png"/u);
      expect(about).toContain('<h1>About</h1>');
      expect(report).toMatchObject({ readiness: 'ready', summary: { pageCount: 2 } });
      expect(lines).toContain('Site Rescue complete');
      expect(lines).toContain('Pages captured: 2');
      expect(lines).toContain('Pages exported: 2');
      expect(lines).toContain('Assets copied: 2');
      expect(lines).toContain('Readiness: ready');
      expect(lines).toContain('Verification: valid');
    } finally {
      await rm(outputDirectory, { force: true, recursive: true });
    }
  });

  it('can export remote asset references when downloads are skipped', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'site-rescue-cli-rescue-skip-'));
    try {
      const result = await runRescue('fixture.weebly.com', {
        capturedAt: '2026-08-19T00:00:00.000Z',
        downloadAssets: false,
        fetcher,
        outputDirectory,
        writeLine: () => undefined,
      });
      const home = await readFile(join(result.siteDirectory, 'index.html'), 'utf8');

      expect(result.capture.downloadedAssetCount).toBe(0);
      expect(result.export.copiedAssetCount).toBe(0);
      expect(result.report.readiness).toBe('review-required');
      expect(result.verification.valid).toBe(true);
      expect(home).toContain('src="https://fixture.weebly.com/hero.png"');
    } finally {
      await rm(outputDirectory, { force: true, recursive: true });
    }
  });
});
