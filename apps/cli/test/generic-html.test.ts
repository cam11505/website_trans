import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSite } from '@site-rescue/content-schema';
import type { Fetcher } from '@site-rescue/crawler';
import { runCapture } from '../src/capture.js';
import { runDiagnose } from '../src/diagnose.js';
import { runRescue } from '../src/rescue.js';

const fixturePages = new Map<string, string>([
  [
    'https://generic.test/',
    '<!doctype html><title>Generic</title><main><h1>Generic</h1><a href="/about.html">About</a></main>',
  ],
  [
    'https://generic.test/about.html',
    '<!doctype html><title>About</title><main><h1>About</h1><p>Generic page</p></main>',
  ],
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

describe('Generic HTML CLI integration', () => {
  it('diagnoses Generic HTML through the default adapter registry', async () => {
    const lines: string[] = [];
    await runDiagnose('https://generic.test/', {
      fetcher,
      writeLine: (line) => lines.push(line),
    });

    expect(lines).toContain('Platform: Generic HTML (10% confidence)');
    expect(lines).toContain('Discovered pages (2):');
  });

  it('captures Generic HTML through the default adapter registry', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'site-rescue-generic-'));
    const outputDirectory = join(workspace, 'capture');
    try {
      const result = await runCapture('https://generic.test/', {
        capturedAt: '2026-08-19T00:00:00.000Z',
        downloadAssets: false,
        fetcher,
        outputDirectory,
        writeLine: () => undefined,
      });
      const site = parseSite(JSON.parse(await readFile(result.outputFile, 'utf8')) as unknown);

      expect(result.pageCount).toBe(2);
      expect(site.source.adapter).toBe('generic-html');
      expect(site.warnings.map((warning) => warning.code)).toContain('generic-html-fallback');
    } finally {
      await rm(workspace, { force: true, recursive: true });
    }
  });

  it('rescues, reports, and verifies Generic HTML end to end', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'site-rescue-generic-e2e-'));
    const outputDirectory = join(workspace, 'rescue');
    try {
      const result = await runRescue('https://generic.test/', {
        capturedAt: '2026-08-19T00:00:00.000Z',
        downloadAssets: false,
        fetcher,
        outputDirectory,
        writeLine: () => undefined,
      });

      expect(result.capture.pageCount).toBe(2);
      expect(result.report.readiness).toBe('review-required');
      expect(result.verification.valid).toBe(true);
      expect(await readFile(join(result.siteDirectory, 'index.html'), 'utf8')).toContain(
        '<h1>Generic</h1>',
      );
    } finally {
      await rm(workspace, { force: true, recursive: true });
    }
  });
});
