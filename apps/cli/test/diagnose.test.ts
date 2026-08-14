import { describe, expect, it } from 'vitest';
import type { Fetcher } from '@site-rescue/crawler';
import { runDiagnose } from '../src/diagnose.js';

const fixturePages = new Map<string, string>([
  [
    'https://fixture.weebly.com/',
    '<meta name="generator" content="Weebly"><title>Home</title><a href="/about.html">About</a><a href="https://outside.test/">Outside</a>',
  ],
  ['https://fixture.weebly.com/about.html', '<title>About</title><a href="/">Home</a>'],
]);

const fetcher: Fetcher = async (input) => {
  const html = fixturePages.get(input);
  return html === undefined
    ? new Response('Not found', { status: 404 })
    : new Response(html, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
};

describe('diagnose command', () => {
  it('reports Weebly and discovered same-origin pages', async () => {
    const lines: string[] = [];
    await runDiagnose('fixture.weebly.com', {
      fetcher,
      writeLine: (line) => lines.push(line),
    });
    expect(lines).toContain('Platform: Weebly (100% confidence)');
    expect(lines).toContain('Discovered pages (2):');
    expect(lines).toContain('  - /');
    expect(lines).toContain('  - /about.html');
    expect(lines.some((line) => line.includes('outside.test'))).toBe(false);
  });
});

