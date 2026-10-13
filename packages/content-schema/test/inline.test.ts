import { describe, expect, it } from 'vitest';
import { MAX_INLINE_DEPTH, parseSite } from '../src/index.js';

function document(schemaVersion: string, blocks: unknown[]) {
  return {
    schemaVersion,
    source: { adapter: 'fixture', baseUrl: 'https://inline.example/', capturedAt: '2026-10-13T00:00:00.000Z' },
    metadata: { title: 'Inline schema' }, navigation: [], assets: [], redirects: [], warnings: [],
    pages: [{ id: 'home', sourceUrl: 'https://inline.example/', sourcePath: '/', targetPath: '/', title: 'Home', blocks }],
  };
}

describe('inline schema compatibility and validation', () => {
  it('round-trips version 1.1.0 inline content and source IDs', () => {
    const input = document('1.1.0', [
      { type: 'paragraph', text: '指南', id: 'intro', inlines: [
        { type: 'link', href: '/guide/#details', children: [
          { type: 'strong', children: [{ type: 'text', value: '指南' }] },
        ] },
      ] },
      { type: 'list', ordered: true, items: ['第一項'], itemInlines: [[{ type: 'emphasis', children: [{ type: 'text', value: '第一項' }] }]] },
    ]);
    expect(parseSite(JSON.parse(JSON.stringify(input)))).toEqual(input);
  });

  it('preserves legacy version and plain fields without injecting rich content', () => {
    const input = document('1.0.0', [{ type: 'paragraph', text: 'Legacy' }, { type: 'list', ordered: false, items: ['Old'] }]);
    expect(parseSite(input)).toEqual(input);
  });

  it('rejects rich fields declared as legacy, including blocks in columns', () => {
    const paragraph = { type: 'paragraph', text: 'Rich', inlines: [{ type: 'text', value: 'Rich' }] };
    expect(() => parseSite(document('1.0.0', [paragraph]))).toThrow('require schemaVersion 1.1.0');
    expect(() => parseSite(document('1.0.0', [{ type: 'columns', columns: [[paragraph]] }]))).toThrow('require schemaVersion 1.1.0');
  });

  it('rejects misaligned inline list arrays instead of dropping items', () => {
    expect(() => parseSite(document('1.1.0', [
      { type: 'list', ordered: false, items: ['one', 'two'], itemInlines: [[{ type: 'text', value: 'one' }]] },
    ]))).toThrow('must align');
  });

  it.each(['javascript:alert(1)', 'jAva\nscript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///C:/private', 'vbscript:msgbox(1)'])(
    'rejects serialized unsafe inline href %s', (href) => {
      expect(() => parseSite(document('1.1.0', [
        { type: 'paragraph', text: 'link', inlines: [{ type: 'link', href, children: [{ type: 'text', value: 'link' }] }] },
      ]))).toThrow('Unsafe or unsupported');
    },
  );

  it('rejects active attributes and unknown inline node types', () => {
    expect(() => parseSite(document('1.1.0', [
      { type: 'paragraph', text: 'text', inlines: [{ type: 'strong', children: [], onclick: 'alert(1)' }] },
    ]))).toThrow();
    expect(() => parseSite(document('1.1.0', [
      { type: 'paragraph', text: 'text', inlines: [{ type: 'rawHtml', html: '<script>alert(1)</script>' }] },
    ]))).toThrow();
  });

  it('rejects inline nesting above the supported bound', () => {
    let node: unknown = { type: 'text', value: 'deep' };
    for (let index = 0; index < MAX_INLINE_DEPTH + 2; index += 1) {
      node = { type: 'strong', children: [node] };
    }
    expect(() => parseSite(document('1.1.0', [{ type: 'paragraph', text: 'deep', inlines: [node] }]))).toThrow();
  });
});
