import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, parseSite } from '../src/index.js';

const minimalSite = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  source: {
    adapter: 'weebly',
    baseUrl: 'https://example.test/',
    capturedAt: '2026-08-14T00:00:00.000Z',
  },
  metadata: { title: 'Example' },
  navigation: [],
  pages: [
    {
      id: 'home',
      sourceUrl: 'https://example.test/',
      sourcePath: '/',
      targetPath: '/',
      title: 'Home',
      blocks: [
        { type: 'heading', level: 1, text: 'Hello' },
        {
          type: 'columns',
          columns: [[{ type: 'paragraph', text: 'Nested content' }]],
        },
      ],
    },
  ],
  assets: [],
  redirects: [],
  warnings: [],
};

describe('site schema', () => {
  it('accepts a valid versioned site document', () => {
    expect(parseSite(minimalSite).schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('rejects an unsupported schema version', () => {
    expect(() => parseSite({ ...minimalSite, schemaVersion: '2.0.0' })).toThrow();
  });

  it('accepts optional platform-neutral asset roles without breaking old captures', () => {
    const parsed = parseSite({
      ...minimalSite,
      assets: [
        {
          id: 'asset-css',
          sourceUrl: 'https://example.test/site.css',
          role: 'stylesheet',
        },
      ],
    });

    expect(parsed.assets[0]?.role).toBe('stylesheet');
    expect(parseSite(minimalSite).assets).toEqual([]);
  });

  it('accepts normalized permanent redirect mappings', () => {
    const parsed = parseSite({
      ...minimalSite,
      redirects: [{ from: '/legacy', to: '/', status: 301 }],
    });

    expect(parsed.redirects).toEqual([{ from: '/legacy', to: '/', status: 301 }]);
    expect(() =>
      parseSite({
        ...minimalSite,
        redirects: [{ from: '/legacy', to: '/', status: 303 }],
      }),
    ).toThrow();
  });
});
