import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { detectGenericHtml, normalizeGenericHtmlSite } from '../src/index.js';

describe('Generic HTML adapter', () => {
  it('detects recognizable HTML at fallback confidence', () => {
    const result = detectGenericHtml({
      url: 'https://example.test/',
      html: '<!doctype html><html><body><h1>Example</h1></body></html>',
    });

    expect(result.detected).toBe(true);
    expect(result.confidence).toBe(0.1);
    expect(result.evidence.map((item) => item.signal)).toContain(
      'Document contains recognizable HTML structure',
    );
  });

  it('does not detect plain text as HTML', () => {
    const result = detectGenericHtml({
      url: 'https://example.test/',
      html: 'This is not an HTML document.',
    });

    expect(result.detected).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it('normalizes standard content and records fallback review warnings', async () => {
    const fixtureRoot = new URL('../../../../fixtures/generic-html/basic-site/', import.meta.url);
    const [home, about] = await Promise.all([
      readFile(new URL('index.html', fixtureRoot), 'utf8'),
      readFile(new URL('about.html', fixtureRoot), 'utf8'),
    ]);

    const site = normalizeGenericHtmlSite({
      baseUrl: 'https://generic.example/',
      capturedAt: '2026-08-19T00:00:00.000Z',
      pages: [
        { url: 'https://generic.example/', html: home, title: 'Generic Fixture' },
        {
          url: 'https://generic.example/about.html',
          html: about,
          title: 'About the generic fixture',
        },
      ],
    });

    expect(site.source.adapter).toBe('generic-html');
    expect(site.metadata).toEqual({
      title: 'Generic Fixture',
      description: 'A deterministic generic HTML fixture',
      language: 'en',
    });
    expect(site.navigation.map((item) => item.label)).toEqual(['Home', 'About', 'External']);
    expect(site.pages[0]?.blocks.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'image',
      'list',
      'button',
      'embed',
      'rawHtml',
    ]);
    expect(site.pages[1]?.blocks.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'video',
    ]);
    expect(site.assets.map((asset) => [asset.sourceUrl, asset.mediaType])).toEqual([
      ['https://generic.example/images/hero.jpg', 'image/jpeg'],
      ['https://generic.example/images/poster.jpg', 'image/jpeg'],
      ['https://generic.example/media/intro.mp4', 'video/mp4'],
      ['https://generic.example/styles/site.css', 'text/css'],
    ]);
    expect(site.warnings.map((warning) => warning.code)).toEqual([
      'generic-html-fallback',
      'unsupported-html-preserved',
    ]);
  });
});
