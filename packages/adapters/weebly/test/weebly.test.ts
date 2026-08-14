import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { detectWeebly } from '../src/index.js';

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
});

