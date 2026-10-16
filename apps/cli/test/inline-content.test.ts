import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSite } from '@site-rescue/content-schema';
import { weeblyAdapter } from '@site-rescue/adapter-weebly';
import { genericHtmlAdapter } from '@site-rescue/adapter-generic-html';
import type { Fetcher } from '@site-rescue/crawler';
import { verifyRescueBundle } from '@site-rescue/rescue-manifest';
import { runExport } from '../src/export.js';
import { runReport } from '../src/report.js';
import { runRescue } from '../src/rescue.js';

const sourceUrl = 'https://inline.example/';
const fixtureDirectory = join(process.cwd(), 'fixtures', 'shared', 'inline-content');
const files = new Map([['/', 'index.html'], ['/guide/', 'guide.html'], ['/nested/', 'nested.html']]);
const fetcher: Fetcher = async (input) => {
  const url = new URL(input);
  const file = files.get(url.pathname);
  if (url.origin !== new URL(sourceUrl).origin || file === undefined) {
    throw new Error(`Unexpected fixture request: ${input}`);
  }
  return new Response(await readFile(join(fixtureDirectory, file), 'utf8'), {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
};

describe.each([weeblyAdapter, genericHtmlAdapter])('inline content via $id', (adapter) => {
  it('preserves saved inline trees, formatting, links and anchors through rescue', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'site-rescue-inline-'));
    try {
      const rescue = await runRescue(sourceUrl, {
        adapters: [adapter],
        fetcher,
        outputDirectory: join(workspace, 'rescue'),
        writeLine: () => undefined,
      });
      const site = parseSite(JSON.parse(await readFile(rescue.capture.outputFile, 'utf8')) as unknown);
      const home = await readFile(join(rescue.siteDirectory, 'index.html'), 'utf8');
      const nested = await readFile(join(rescue.siteDirectory, 'nested', 'index.html'), 'utf8');
      const guide = await readFile(join(rescue.siteDirectory, 'guide', 'index.html'), 'utf8');

      // The old adapter/exporter flatten this link and every semantic inline tag.
      expect(home).toContain('<a href="guide/index.html#details"><strong>操作<em>說明</em></strong></a>');
      expect(home).toContain('<code>&lt;run&gt; &amp; check</code><br>下一行。');
      expect(home).toContain('<li>閱讀 <a href="guide/index.html">完整<strong>指南</strong></a>。</li>');
      expect(home).toContain('<em>注意</em> <code>a  b</code><br>第二行');
      expect(home).toContain('href="https://outside.example/help?q=one&amp;mode=two#part"');
      expect(home).toContain('href="mailto:help@example.test"');
      expect(home).toContain('href="tel:+88612345678"');
      expect(home).toContain('<h1 id="home">行內<strong>內容</strong></h1>');
      expect(home).toContain('<span id="bookmark">首頁書籤</span>');
      expect(guide).toContain('<h1 id="details">操作說明</h1>');
      expect(nested).toContain('href="../guide/index.html#details"');
      expect(nested).toContain('href="index.html#local"');
      expect(nested).toContain('href="../index.html#bookmark"');
      expect(site.schemaVersion).toBe('1.1.0');
      expect(site.pages[0]?.blocks[1]).toMatchObject({
        type: 'paragraph',
        inlines: [
          { type: 'text', value: '前往 ' },
          { type: 'link', href: `${sourceUrl}guide/#details`, children: [
            { type: 'strong', children: [{ type: 'text', value: '操作' },
              { type: 'emphasis', children: [{ type: 'text', value: '說明' }] }] },
          ] },
          { type: 'text', value: '，執行 ' },
          { type: 'code', value: '<run> & check' },
          { type: 'lineBreak' },
          { type: 'text', value: '下一行。' },
        ],
      });
      expect(site.pages[0]?.blocks[3]).toMatchObject({ type: 'list', itemInlines: expect.any(Array) });
      expect(rescue.verification).toMatchObject({ valid: true, issueCount: 0 });
      expect(rescue.manifest?.manifest.schemaVersion).toBe('1.1.0');
      expect(await verifyRescueBundle(rescue.outputDirectory)).toMatchObject({ valid: true });
      expect(site.warnings.map((warning) => warning.code)).toEqual(
        adapter.id === 'weebly' ? [] : ['generic-html-fallback'],
      );
    } finally {
      await rm(workspace, { force: true, recursive: true });
    }
  });

  it('warns about unsafe links and unsupported semantics instead of executing source', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'site-rescue-unsafe-inline-'));
    try {
      const html = '<meta name="generator" content="Weebly"><main id="wsite-content"><p>安全 <a href="jAva&#x0a;script:alert(1)"><strong onclick="alert(1)">文字</strong></a><sup>上標</sup><script>alert(1)</script></p></main>';
      const rescue = await runRescue(sourceUrl, {
        adapters: [adapter],
        fetcher: async () => new Response(html, { headers: { 'content-type': 'text/html' } }),
        outputDirectory: join(workspace, 'rescue'),
        writeLine: () => undefined,
      });
      const site = parseSite(JSON.parse(await readFile(rescue.capture.outputFile, 'utf8')) as unknown);
      const home = await readFile(join(rescue.siteDirectory, 'index.html'), 'utf8');

      expect(site.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining([
        'unsafe-inline-link', 'inline-content-flattened', 'unsupported-inline-content',
      ]));
      expect(site.warnings.every((warning) => warning.sourceUrl === sourceUrl)).toBe(true);
      expect(rescue.report.readiness).toBe('review-required');
      expect(home).toContain('<strong>文字</strong>');
      expect(home).toContain('上標');
      expect(home).not.toMatch(/javascript:|onclick=|<script|alert\(1\)/iu);
      expect(rescue.verification.valid).toBe(true);
    } finally {
      await rm(workspace, { force: true, recursive: true });
    }
  });
});

it('still exports and reports an unchanged saved schema 1.0.0 capture', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'site-rescue-legacy-inline-'));
  try {
    const site = parseSite({
      schemaVersion: '1.0.0',
      source: { adapter: 'legacy', baseUrl: sourceUrl, capturedAt: '2026-10-13T00:00:00.000Z' },
      metadata: { title: 'Legacy' }, navigation: [], assets: [], redirects: [], warnings: [],
      pages: [{ id: 'home', sourceUrl, sourcePath: '/', targetPath: '/', title: 'Home',
        blocks: [{ type: 'paragraph', text: '舊版 <safe>' }, { type: 'list', ordered: false, items: ['舊清單'] }] }],
    });
    const input = join(workspace, 'site.json');
    await writeFile(input, JSON.stringify(site), 'utf8');
    const exported = await runExport(input, { outputDirectory: join(workspace, 'site'), writeLine: () => undefined });
    const report = await runReport(input, { outputDirectory: join(workspace, 'report'), writeLine: () => undefined });
    const home = await readFile(join(exported.outputDirectory, 'index.html'), 'utf8');

    expect(site.schemaVersion).toBe('1.0.0');
    expect(home).toContain('<p>舊版 &lt;safe&gt;</p>');
    expect(home).toContain('<ul><li>舊清單</li></ul>');
    expect(report.readiness).toBe('review-required');
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
});
