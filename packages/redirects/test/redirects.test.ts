import { describe, expect, it } from 'vitest';
import { parseSite } from '@site-rescue/content-schema';
import { applyRedirectEvidence } from '../src/index.js';

const site = parseSite({
  schemaVersion: '1.0.0',
  source: {
    adapter: 'fixture',
    baseUrl: 'https://fixture.test/',
    capturedAt: '2026-08-21T00:00:00.000Z',
  },
  metadata: { title: 'Redirect fixture' },
  navigation: [],
  pages: [
    {
      id: 'home',
      sourceUrl: 'https://fixture.test/',
      sourcePath: '/',
      targetPath: '/',
      title: 'Home',
      blocks: [],
    },
    {
      id: 'about',
      sourceUrl: 'https://fixture.test/about.html',
      sourcePath: '/about.html',
      targetPath: '/about.html',
      title: 'About',
      blocks: [],
    },
  ],
  assets: [],
  redirects: [],
  warnings: [],
});

describe('redirect evidence mapper', () => {
  it('maps same-origin aliases to normalized target paths as migration 301s', () => {
    const result = applyRedirectEvidence(site, [
      {
        fromUrl: 'https://fixture.test/old-about',
        toUrl: 'https://fixture.test/about.html',
      },
      {
        fromUrl: 'https://fixture.test/old-about',
        toUrl: 'https://fixture.test/about.html',
      },
    ]);

    expect(result.addedRedirectCount).toBe(1);
    expect(result.warningCount).toBe(0);
    expect(result.site.redirects).toEqual([
      { from: '/old-about', to: '/about.html', status: 301 },
    ]);
  });

  it('accepts exact queries while warning on cross-origin, missing, or conflicting targets', () => {
    const result = applyRedirectEvidence(site, [
      {
        fromUrl: 'https://outside.test/old',
        toUrl: 'https://fixture.test/about.html',
      },
      {
        fromUrl: 'https://fixture.test/old?variant=1',
        toUrl: 'https://fixture.test/about.html',
      },
      {
        fromUrl: 'https://fixture.test/missing',
        toUrl: 'https://fixture.test/missing-target',
      },
      {
        fromUrl: 'https://fixture.test/about.html',
        toUrl: 'https://fixture.test/',
      },
    ]);

    expect(result.addedRedirectCount).toBe(1);
    expect(result.site.redirects).toEqual([{ from: '/old?variant=1', to: '/about.html', status: 301 }]);
    expect(result.site.warnings.map((warning) => warning.code)).toEqual([
      'redirect-cross-origin-skipped',
      'redirect-target-missing',
      'redirect-source-conflict',
    ]);
  });

  it('detects static output collisions even when route strings differ', () => {
    const nestedSite = parseSite({
      ...site,
      pages: site.pages.map((page) =>
        page.id === 'about' ? { ...page, targetPath: '/company/about/' } : page,
      ),
    });
    const result = applyRedirectEvidence(nestedSite, [
      {
        fromUrl: 'https://fixture.test/company/about',
        toUrl: 'https://fixture.test/',
      },
    ]);

    expect(result.addedRedirectCount).toBe(0);
    expect(result.site.warnings.map((warning) => warning.code)).toEqual([
      'redirect-source-conflict',
    ]);
  });
});
