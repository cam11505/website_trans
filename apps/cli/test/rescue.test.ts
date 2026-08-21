import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSite } from '@site-rescue/content-schema';
import type { Fetcher } from '@site-rescue/crawler';
import { startPreviewServer } from '@site-rescue/preview-server';
import { runRescue } from '../src/rescue.js';

const fixturePages = new Map<string, string>([
  [
    'https://fixture.weebly.com/',
    '<meta name="generator" content="Weebly"><title>Home</title><link rel="stylesheet" href="/theme.css"><nav><a href="/">Home</a><a href="/about.html">About</a><a href="/legacy-about">Legacy</a></nav><main id="wsite-content"><h1>Home</h1><p>Hello</p><img src="/hero.png" alt="Hero"></main>',
  ],
  [
    'https://fixture.weebly.com/about.html',
    '<title>About</title><nav><a href="/">Home</a></nav><main id="wsite-content"><h1>About</h1><p>About us</p></main>',
  ],
]);

const fetcher: Fetcher = async (input) => {
  if (input === 'https://fixture.weebly.com/legacy-about') {
    const response = new Response(fixturePages.get('https://fixture.weebly.com/about.html'), {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
    Object.defineProperty(response, 'url', {
      value: 'https://fixture.weebly.com/about.html',
    });
    return response;
  }
  if (input === 'https://fixture.weebly.com/hero.png') {
    return new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'image/png' },
    });
  }
  if (input === 'https://fixture.weebly.com/theme.css') {
    return new Response(
      '@font-face { src: url("/theme.woff2") } body { color: navy; background: url("/background.png") }',
      {
        status: 200,
        headers: { 'content-type': 'text/css' },
      },
    );
  }
  if (input === 'https://fixture.weebly.com/theme.woff2') {
    return new Response(new Uint8Array([4, 5, 6]), {
      status: 200,
      headers: { 'content-type': 'font/woff2' },
    });
  }
  if (input === 'https://fixture.weebly.com/background.png') {
    return new Response(new Uint8Array([7, 8, 9]), {
      status: 200,
      headers: { 'content-type': 'image/png' },
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
        styleMode: 'source',
        writeLine: (line) => lines.push(line),
      });
      const site = parseSite(
        JSON.parse(await readFile(join(result.captureDirectory, 'site.json'), 'utf8')) as unknown,
      );
      const home = await readFile(join(result.siteDirectory, 'index.html'), 'utf8');
      const about = await readFile(join(result.siteDirectory, 'about.html'), 'utf8');
      const sourceStylesheet = site.assets.find(
        (asset) => asset.sourceUrl === 'https://fixture.weebly.com/theme.css',
      )!;
      const exportedStylesheet = await readFile(
        join(result.siteDirectory, sourceStylesheet.localPath!),
        'utf8',
      );
      const report = JSON.parse(
        await readFile(join(result.reportDirectory, 'migration-report.json'), 'utf8'),
      ) as { readiness: string; summary: { pageCount: number; redirectCount: number } };
      const redirectManifest = JSON.parse(
        await readFile(join(result.siteDirectory, 'redirects.json'), 'utf8'),
      ) as { redirects: unknown[] };
      const redirectPage = await readFile(
        join(result.siteDirectory, 'legacy-about', 'index.html'),
        'utf8',
      );
      const bundleManifest = JSON.parse(
        await readFile(join(result.outputDirectory, 'rescue-manifest.json'), 'utf8'),
      ) as { files: Array<{ path: string; sha256: string }> };

      expect(result.capture).toMatchObject({
        pageCount: 2,
        downloadedAssetCount: 4,
        discoveredCssDependencyCount: 2,
        rewrittenCssReferenceCount: 2,
        failedAssetCount: 0,
        redirectCount: 1,
      });
      expect(result.export).toMatchObject({
        pageCount: 2,
        copiedAssetCount: 4,
        appliedSourceStylesheetCount: 1,
        redirectPageCount: 1,
      });
      expect(result.verification).toMatchObject({
        valid: true,
        issueCount: 0,
        cssFileCount: 2,
      });
      expect(result.manifest).toMatchObject({
        fileCount: bundleManifest.files.length,
        staticVerification: { valid: true },
      });
      expect(bundleManifest.files.some((entry) => entry.path === 'capture/site.json')).toBe(
        true,
      );
      expect(bundleManifest.files.some((entry) => entry.path === 'site/index.html')).toBe(true);
      expect(
        bundleManifest.files.every((entry) => /^[a-f0-9]{64}$/u.test(entry.sha256)),
      ).toBe(true);
      expect(site.source.adapter).toBe('weebly');
      expect(site.redirects).toEqual([
        { from: '/legacy-about', to: '/about.html', status: 301 },
      ]);
      expect(home).toContain('<h1>Home</h1>');
      expect(home).toContain('href="about.html"');
      expect(home).toMatch(/src="assets\/[a-f0-9]{64}\.png"/u);
      expect(home).toContain(
        `href="${sourceStylesheet.localPath}" data-site-rescue-style="source"`,
      );
      expect(exportedStylesheet).not.toContain('https://');
      expect(exportedStylesheet).toMatch(/url\("\.\.\/[a-f0-9]{64}\.woff2"\)/u);
      expect(exportedStylesheet).toMatch(/url\("\.\.\/[a-f0-9]{64}\.png"\)/u);
      const preview = await startPreviewServer(result.siteDirectory, { port: 0 });
      try {
        const response = await fetch(`${preview.origin}/${sourceStylesheet.localPath}`);
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('text/css; charset=utf-8');
        expect(await response.text()).toBe(exportedStylesheet);
      } finally {
        await preview.close();
      }
      expect(about).toContain('<h1>About</h1>');
      expect(redirectManifest.redirects).toEqual(site.redirects);
      expect(redirectPage).toContain('href="../about.html"');
      expect(report).toMatchObject({
        readiness: 'review-required',
        summary: { pageCount: 2, redirectCount: 1 },
      });
      expect(lines).toContain('Site Rescue complete');
      expect(lines).toContain('Pages captured: 2');
      expect(lines).toContain('Redirects preserved: 1');
      expect(lines).toContain('Pages exported: 2');
      expect(lines).toContain('Assets copied: 4');
      expect(lines).toContain('CSS dependencies discovered: 2');
      expect(lines).toContain('CSS references rewritten: 2');
      expect(lines).toContain('Source stylesheets applied: 1');
      expect(lines).toContain('Redirect fallback pages exported: 1');
      expect(lines).toContain('Readiness: review-required');
      expect(lines).toContain('Verification: valid');
      expect(lines).toContain(`Bundle files recorded: ${bundleManifest.files.length}`);
      expect(lines).toContain(`Manifest: ${result.manifest!.manifestFile}`);
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
