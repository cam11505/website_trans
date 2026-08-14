import { describe, expect, it } from 'vitest';
import { crawlSameOrigin, extractSameOriginLinks, type Fetcher } from '../src/index.js';

const pages = new Map<string, string>([
  [
    'https://example.test/',
    '<title>Home</title><a href="/about.html">About</a><a href="/contact">Contact</a><a href="https://outside.test/">Outside</a><a href="/image.jpg">Image</a>',
  ],
  ['https://example.test/about.html', '<title>About</title><a href="/contact#form">Contact</a>'],
  ['https://example.test/contact', '<title>Contact</title><a href="/">Home</a>'],
]);

const fixtureFetcher: Fetcher = async (input) => {
  const html = pages.get(input);
  if (html === undefined) {
    return new Response('Not found', { status: 404 });
  }
  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
};

describe('same-origin crawler', () => {
  it('normalizes, deduplicates, and filters links', () => {
    const links = extractSameOriginLinks(
      '<a href="/a#one">A</a><a href="/a#two">A2</a><a href="mailto:test@example.test">Mail</a><a href="/file.pdf">PDF</a>',
      'https://example.test/',
      'https://example.test',
    );
    expect(links).toEqual(['https://example.test/a']);
  });

  it('discovers all reachable same-origin HTML pages', async () => {
    const result = await crawlSameOrigin('example.test', { fetcher: fixtureFetcher });
    expect(result.discoveredUrls).toEqual([
      'https://example.test/',
      'https://example.test/about.html',
      'https://example.test/contact',
    ]);
    expect(result.pages.map((page) => page.title)).toEqual(['Home', 'About', 'Contact']);
    expect(result.warnings).toEqual([]);
    expect(result.truncated).toBe(false);
  });

  it('stops at the configured page limit', async () => {
    const result = await crawlSameOrigin('https://example.test/', {
      fetcher: fixtureFetcher,
      maxPages: 1,
    });
    expect(result.pages).toHaveLength(1);
    expect(result.truncated).toBe(true);
  });

  it('does not accept a page that redirects off-origin', async () => {
    const redirectingFetcher: Fetcher = async (input) => {
      const response = new Response(
        input.endsWith('/') ? '<a href="/redirect">Redirect</a>' : '<title>Outside</title>',
        { status: 200, headers: { 'content-type': 'text/html' } },
      );
      if (input.endsWith('/redirect')) {
        Object.defineProperty(response, 'url', { value: 'https://outside.test/' });
      }
      return response;
    };

    const result = await crawlSameOrigin('https://example.test/', {
      fetcher: redirectingFetcher,
    });
    expect(result.pages).toHaveLength(1);
    expect(result.warnings).toEqual([
      {
        url: 'https://example.test/redirect',
        message: 'Page redirected to a different origin.',
      },
    ]);
  });
});
