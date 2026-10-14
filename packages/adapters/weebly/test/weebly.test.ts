import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { detectWeebly, normalizeWeeblySite } from '../src/index.js';

describe('Weebly adapter detection', () => {
  it('detects a fixture using document evidence', async () => {
    const html = await readFile(
      new URL('../../../../fixtures/weebly/basic-site/index.html', import.meta.url),
      'utf8',
    );
    const result = detectWeebly({ url: 'https://customer.example/', html });
    expect(result.detected).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    expect(result.evidence.map((item) => item.signal)).toContain('Generator metadata names Weebly');
  });

  it('uses a weebly.com hostname as a strong signal', () => {
    const result = detectWeebly({ url: 'https://example.weebly.com/', html: '<h1>Hello</h1>' });
    expect(result.detected).toBe(true);
  });

  it('does not label generic HTML as Weebly', () => {
    const result = detectWeebly({ url: 'https://example.test/', html: '<h1>Hello</h1>' });
    expect(result.detected).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it('normalizes fixture pages into the platform-neutral schema', async () => {
    const fixtureRoot = new URL('../../../../fixtures/weebly/basic-site/', import.meta.url);
    const [home, about, contact] = await Promise.all([
      readFile(new URL('index.html', fixtureRoot), 'utf8'),
      readFile(new URL('about.html', fixtureRoot), 'utf8'),
      readFile(new URL('contact.html', fixtureRoot), 'utf8'),
    ]);
    const site = normalizeWeeblySite({
      baseUrl: 'https://fixture.weebly.com/',
      capturedAt: '2026-08-14T00:00:00.000Z',
      pages: [
        { url: 'https://fixture.weebly.com/', html: home, title: 'Fixture Home' },
        { url: 'https://fixture.weebly.com/about.html', html: about, title: 'About' },
        { url: 'https://fixture.weebly.com/contact', html: contact, title: 'Contact' },
      ],
    });

    expect(site.schemaVersion).toBe('1.1.0');
    expect(site.pages).toHaveLength(3);
    expect(site.pages[0]?.blocks.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'image',
      'list',
      'button',
      'video',
      'columns',
    ]);
    expect(site.assets.map((asset) => [asset.sourceUrl, asset.mediaType])).toEqual([
      ['https://fixture.weebly.com/media/intro.mp4', 'video/mp4'],
      ['https://fixture.weebly.com/theme/main.css', 'text/css'],
      ['https://fixture.weebly.com/uploads/hero.jpg', 'image/jpeg'],
      ['https://fixture.weebly.com/uploads/poster.jpg', 'image/jpeg'],
    ]);
    expect(
      site.assets.find((asset) => asset.sourceUrl.endsWith('/theme/main.css'))?.role,
    ).toBe('stylesheet');
    expect(site.navigation.map((item) => item.label)).toEqual(['Home', 'About', 'External']);
    expect(site.navigation[1]?.children.map((item) => item.label)).toEqual(['Contact']);
    expect(site.warnings.map((warning) => warning.code)).toContain('unsupported-html-preserved');
  });
});
