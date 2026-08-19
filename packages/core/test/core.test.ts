import { describe, expect, it } from 'vitest';
import {
  selectSourceAdapter,
  type DetectionResult,
  type NormalizeSiteInput,
  type SourceAdapter,
} from '../src/index.js';
import { CURRENT_SCHEMA_VERSION, type Site } from '@site-rescue/content-schema';

function fixtureSite(adapter: string, input: NormalizeSiteInput): Site {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    source: {
      adapter,
      baseUrl: input.baseUrl,
      capturedAt: input.capturedAt ?? '2026-08-19T00:00:00.000Z',
    },
    metadata: { title: 'Fixture' },
    navigation: [],
    pages: [],
    assets: [],
    redirects: [],
    warnings: [],
  };
}

function adapter(id: string, detection: DetectionResult): SourceAdapter {
  return {
    id,
    displayName: id.toUpperCase(),
    detect: () => detection,
    normalize: (input) => fixtureSite(id, input),
  };
}

describe('source adapter registry', () => {
  it('selects the detected adapter with the highest confidence', () => {
    const selected = selectSourceAdapter(
      { url: 'https://example.test/', html: '<h1>Example</h1>' },
      [
        adapter('lower', {
          platform: 'lower',
          detected: true,
          confidence: 0.6,
          evidence: [],
        }),
        adapter('higher', {
          platform: 'higher',
          detected: true,
          confidence: 0.9,
          evidence: [],
        }),
      ],
    );

    expect(selected?.adapter.id).toBe('higher');
    expect(selected?.detection.confidence).toBe(0.9);
  });

  it('preserves registry order when confidence is equal', () => {
    const first = adapter('first', {
      platform: 'first',
      detected: true,
      confidence: 0.8,
      evidence: [],
    });
    const second = adapter('second', {
      platform: 'second',
      detected: true,
      confidence: 0.8,
      evidence: [],
    });

    expect(
      selectSourceAdapter(
        { url: 'https://example.test/', html: '' },
        [first, second],
      )?.adapter.id,
    ).toBe('first');
  });

  it('returns undefined when no adapter detects the source', () => {
    const selected = selectSourceAdapter(
      { url: 'https://example.test/', html: '<h1>Example</h1>' },
      [
        adapter('unknown', {
          platform: 'unknown',
          detected: false,
          confidence: 0.4,
          evidence: [],
        }),
      ],
    );

    expect(selected).toBeUndefined();
  });

  it('rejects duplicate adapter IDs', () => {
    const duplicate = adapter('duplicate', {
      platform: 'duplicate',
      detected: true,
      confidence: 1,
      evidence: [],
    });

    expect(() =>
      selectSourceAdapter(
        { url: 'https://example.test/', html: '' },
        [duplicate, duplicate],
      ),
    ).toThrow('Duplicate source adapter ID: duplicate');
  });

  it('rejects detection results for a different platform', () => {
    expect(() =>
      selectSourceAdapter(
        { url: 'https://example.test/', html: '' },
        [
          adapter('expected', {
            platform: 'different',
            detected: true,
            confidence: 1,
            evidence: [],
          }),
        ],
      ),
    ).toThrow('Source adapter expected returned detection for different.');
  });

  it('rejects confidence values outside the normalized range', () => {
    expect(() =>
      selectSourceAdapter(
        { url: 'https://example.test/', html: '' },
        [
          adapter('invalid', {
            platform: 'invalid',
            detected: true,
            confidence: 1.1,
            evidence: [],
          }),
        ],
      ),
    ).toThrow('Source adapter invalid returned an invalid confidence.');
  });
});
