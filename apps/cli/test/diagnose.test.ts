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
    '<meta name="generator" content="Weebly"><title>Home</title><nav><a href="/">Home</a><a href="/about.html">About</a></nav><main id="wsite-content"><h1>Home</h1><p>Hello</p><img src="/hero.png" alt="Hero"></main><a href="https://outside.test/">Outside</a>',
  ],
  ['https://fixture.weebly.com/about.html', '<title>About</title><a href="/">Home</a>'],
]);

const fetcher: Fetcher = async (input) => {
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

  it('captures a validated site.json artifact', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'site-rescue-'));
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
      expect(site.pages.map((page) => page.title)).toEqual(['Home', 'About']);
      expect(site.assets.map((asset) => asset.sourceUrl)).toEqual([
        'https://fixture.weebly.com/hero.png',
      ]);
      expect(lines).toContain('Site Rescue capture complete');
    } finally {
      await rm(outputDirectory, { force: true, recursive: true });
    }
  });
});
