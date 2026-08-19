import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, parseSite } from '@site-rescue/content-schema';
import type { SourceAdapter } from '@site-rescue/core';
import type { Fetcher } from '@site-rescue/crawler';
import { runCapture } from '../src/capture.js';
import { runDiagnose } from '../src/diagnose.js';

const pages = new Map<string, string>([
  [
    'https://adapter.test/',
    '<title>Adapter fixture</title><main><h1>Home</h1><a href="/second">Second</a></main>',
  ],
  ['https://adapter.test/second', '<title>Second</title><main><p>Second page</p></main>'],
]);

const fetcher: Fetcher = async (input) => {
  const html = pages.get(input);
  return html === undefined
    ? new Response('Not found', { status: 404 })
    : new Response(html, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
};

const fixtureAdapter: SourceAdapter = {
  id: 'fixture',
  displayName: 'Fixture Platform',
  detect: () => ({
    platform: 'fixture',
    detected: true,
    confidence: 0.91,
    evidence: [{ signal: 'Fixture marker detected', weight: 0.91 }],
  }),
  normalize: (input) =>
    parseSite({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      source: {
        adapter: 'fixture',
        baseUrl: input.baseUrl,
        capturedAt: input.capturedAt ?? '2026-08-19T00:00:00.000Z',
      },
      metadata: { title: 'Adapter fixture' },
      navigation: [],
      pages: input.pages.map((page, index) => {
        const url = new URL(page.url);
        return {
          id: `fixture-${index + 1}`,
          sourceUrl: page.url,
          sourcePath: `${url.pathname}${url.search}`,
          targetPath: `${url.pathname}${url.search}`,
          title: page.title,
          blocks: [],
        };
      }),
      assets: [],
      redirects: [],
      warnings: [],
    }),
};

describe('CLI source adapter injection', () => {
  it('diagnoses a platform through an injected adapter', async () => {
    const lines: string[] = [];

    await runDiagnose('https://adapter.test/', {
      adapters: [fixtureAdapter],
      fetcher,
      writeLine: (line) => lines.push(line),
    });

    expect(lines).toContain('Platform: Fixture Platform (91% confidence)');
    expect(lines).toContain('  evidence: Fixture marker detected');
    expect(lines).toContain('Discovered pages (2):');
  });

  it('normalizes a capture through the selected adapter', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'site-rescue-adapter-'));
    try {
      const result = await runCapture('https://adapter.test/', {
        adapters: [fixtureAdapter],
        capturedAt: '2026-08-19T00:00:00.000Z',
        downloadAssets: false,
        fetcher,
        outputDirectory,
        writeLine: () => undefined,
      });
      const site = parseSite(JSON.parse(await readFile(result.outputFile, 'utf8')) as unknown);

      expect(site.source.adapter).toBe('fixture');
      expect(site.pages.map((page) => page.sourcePath)).toEqual(['/', '/second']);
      expect(result.pageCount).toBe(2);
    } finally {
      await rm(outputDirectory, { force: true, recursive: true });
    }
  });
});
