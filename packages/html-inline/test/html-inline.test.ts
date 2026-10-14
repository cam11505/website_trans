import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';
import { MAX_INLINE_DEPTH, type MigrationWarning } from '@site-rescue/content-schema';
import { parseTextContent } from '../src/index.js';

function parse(html: string) {
  const $ = load(html);
  const warnings: MigrationWarning[] = [];
  const content = parseTextContent($, $('p').contents().toArray(), 'https://inline.example/nested/', warnings);
  return { content, warnings };
}

describe('standard inline HTML parsing', () => {
  it('keeps word boundaries, nonbreaking spaces and literal code while normalizing aliases', () => {
    const { content, warnings } = parse('<p>one <span>two&nbsp;</span><b>bold <i>italic</i></b> <code>a  b\nc</code></p>');
    expect(content.inlines).toEqual([
      { type: 'text', value: 'one ' },
      { type: 'text', value: 'two\u00a0' },
      { type: 'strong', children: [{ type: 'text', value: 'bold ' }, { type: 'emphasis', children: [{ type: 'text', value: 'italic' }] }] },
      { type: 'text', value: ' ' },
      { type: 'code', value: 'a  b\nc' },
    ]);
    expect(warnings).toEqual([]);
  });

  it('preserves empty named anchors and resolves page-relative links', () => {
    const { content, warnings } = parse('<p><a name="anchor"></a><a href="../guide/#details">guide</a></p>');
    expect(content.inlines).toEqual([
      { type: 'span', id: 'anchor', children: [] },
      { type: 'link', href: 'https://inline.example/guide/#details', children: [{ type: 'text', value: 'guide' }] },
    ]);
    expect(warnings).toEqual([]);
  });

  it('bounds source nesting with a review warning and readable text', () => {
    const count = MAX_INLINE_DEPTH + 20;
    const { content, warnings } = parse(`<p>${'<strong>'.repeat(count)}deep${'</strong>'.repeat(count)}</p>`);
    expect(content.text).toBe('deep');
    expect(warnings).toEqual([expect.objectContaining({ code: 'inline-content-flattened' })]);
  });
});
