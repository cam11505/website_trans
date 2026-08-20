import { describe, expect, it } from 'vitest';
import { collectCssReferences, rewriteCssReferences } from '../src/index.js';

describe('CSS references', () => {
  it('collects imports and URL functions without treating comments as references', () => {
    const css = `@import "theme/base.css" screen;
@import url('print.css') print;
/* url(ignored.png) */
@font-face { src: url(../fonts/site.woff2) format('woff2'); }
.hero { background: image-set(url("hero.png") 1x, url(hero@2x.png) 2x); }`;

    expect(collectCssReferences(css)).toEqual([
      { kind: 'import', value: 'theme/base.css' },
      { kind: 'import', value: 'print.css' },
      { kind: 'url', value: '../fonts/site.woff2' },
      { kind: 'url', value: 'hero.png' },
      { kind: 'url', value: 'hero@2x.png' },
    ]);
  });

  it('rewrites quoted and unquoted references while preserving surrounding syntax', () => {
    const result = rewriteCssReferences(
      '@import "base.css" screen; .hero { background: url(../hero.png) }',
      (reference) => `local/${reference.value.split('/').at(-1)}`,
    );

    expect(result.css).toContain('@import "local/base.css" screen');
    expect(result.css).toContain('url(local/hero.png)');
    expect(result.rewrittenReferenceCount).toBe(2);
  });

  it('throws for malformed CSS instead of returning partial references', () => {
    expect(() => collectCssReferences('.broken { color: red;')).toThrow();
  });
});
