import { load } from 'cheerio';

export const DEFAULT_MAX_PAGES = 50;
export const DEFAULT_TIMEOUT_MS = 15_000;
export const DEFAULT_USER_AGENT = 'SiteRescue/0.1 (+https://github.com/site-rescue/site-rescue)';

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export interface HtmlDocument {
  requestedUrl: string;
  url: string;
  status: number;
  contentType: string;
  html: string;
  title: string;
}

export interface CrawlWarning {
  url: string;
  message: string;
}

export interface CrawlRedirect {
  fromUrl: string;
  toUrl: string;
}

export interface CrawlResult {
  startUrl: string;
  pages: HtmlDocument[];
  discoveredUrls: string[];
  redirects: CrawlRedirect[];
  warnings: CrawlWarning[];
  truncated: boolean;
}

export interface CrawlOptions {
  maxPages?: number;
  timeoutMs?: number;
  userAgent?: string;
  fetcher?: Fetcher;
  initialDocument?: HtmlDocument;
}

const DOCUMENT_EXTENSIONS = new Set(['', '.htm', '.html', '.php', '.asp', '.aspx']);

export function normalizeStartUrl(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new Error('A URL is required.');
  }

  const withProtocol = /^https?:\/\//iu.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS URLs are supported.');
  }
  url.hash = '';
  return url.href;
}

export function canonicalizeUrl(input: string, base?: string): string | undefined {
  try {
    const url = base === undefined ? new URL(input) : new URL(input, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return undefined;
    }
    url.hash = '';
    return url.href;
  } catch {
    return undefined;
  }
}

function looksLikeDocument(url: URL): boolean {
  if (url.pathname.endsWith('/')) {
    return true;
  }
  const lastSegment = url.pathname.split('/').at(-1) ?? '';
  const dotIndex = lastSegment.lastIndexOf('.');
  const extension = dotIndex === -1 ? '' : lastSegment.slice(dotIndex).toLowerCase();
  return DOCUMENT_EXTENSIONS.has(extension);
}

export function extractSameOriginLinks(html: string, pageUrl: string, origin: string): string[] {
  const $ = load(html);
  const links = new Set<string>();

  $('a[href]').each((_index, element) => {
    const href = $(element).attr('href');
    if (href === undefined || href.trim() === '') {
      return;
    }
    const canonical = canonicalizeUrl(href, pageUrl);
    if (canonical === undefined) {
      return;
    }
    const url = new URL(canonical);
    if (url.origin === origin && looksLikeDocument(url)) {
      links.add(canonical);
    }
  });

  return [...links].sort();
}

function getTitle(html: string): string {
  const $ = load(html);
  return $('title').first().text().trim();
}

export async function fetchHtmlDocument(
  url: string,
  options: Pick<CrawlOptions, 'fetcher' | 'timeoutMs' | 'userAgent'> = {},
): Promise<HtmlDocument> {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const response = await fetcher(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': options.userAgent ?? DEFAULT_USER_AGENT,
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!/text\/html|application\/xhtml\+xml/iu.test(contentType)) {
    throw new Error(`Unsupported content type: ${contentType || 'unknown'}`);
  }

  const html = await response.text();
  const finalUrl = response.url || url;
  return {
    requestedUrl: url,
    url: normalizeStartUrl(finalUrl),
    status: response.status,
    contentType,
    html,
    title: getTitle(html),
  };
}

export async function crawlSameOrigin(
  inputUrl: string,
  options: CrawlOptions = {},
): Promise<CrawlResult> {
  const requestedStartUrl = normalizeStartUrl(inputUrl);
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  if (!Number.isInteger(maxPages) || maxPages < 1) {
    throw new Error('maxPages must be a positive integer.');
  }

  const initialDocument =
    options.initialDocument ?? (await fetchHtmlDocument(requestedStartUrl, options));
  const startUrl = canonicalizeUrl(initialDocument.url);
  if (startUrl === undefined) {
    throw new Error('The start URL is invalid after fetching.');
  }
  const origin = new URL(startUrl).origin;
  if (new URL(requestedStartUrl).origin !== origin) {
    throw new Error('The start URL redirected to a different origin.');
  }

  const queue: string[] = [startUrl];
  const discovered = new Set(queue);
  const processed = new Set<string>();
  const pages: HtmlDocument[] = [];
  const pageUrls = new Set<string>();
  const redirects: CrawlRedirect[] = [];
  const redirectKeys = new Set<string>();
  const warnings: CrawlWarning[] = [];

  while (queue.length > 0 && processed.size < maxPages) {
    const currentUrl = queue.shift();
    if (currentUrl === undefined || processed.has(currentUrl)) {
      continue;
    }
    processed.add(currentUrl);
    if (pageUrls.has(currentUrl)) {
      continue;
    }

    try {
      const document =
        currentUrl === startUrl
          ? initialDocument
          : await fetchHtmlDocument(currentUrl, options);
      if (new URL(document.url).origin !== origin) {
        throw new Error('Page redirected to a different origin.');
      }
      const requestedUrl = canonicalizeUrl(document.requestedUrl);
      const finalUrl = canonicalizeUrl(document.url);
      if (requestedUrl === undefined || finalUrl === undefined) {
        throw new Error('Page returned an invalid redirect URL.');
      }
      if (new URL(requestedUrl).origin !== origin) {
        throw new Error('Page was requested from a different origin.');
      }
      discovered.add(finalUrl);
      if (requestedUrl !== finalUrl) {
        const key = `${requestedUrl}\n${finalUrl}`;
        if (!redirectKeys.has(key)) {
          redirectKeys.add(key);
          redirects.push({ fromUrl: requestedUrl, toUrl: finalUrl });
        }
      }
      if (pageUrls.has(finalUrl)) {
        continue;
      }
      pageUrls.add(finalUrl);
      pages.push(document);

      for (const link of extractSameOriginLinks(document.html, document.url, origin)) {
        if (!discovered.has(link)) {
          discovered.add(link);
          queue.push(link);
        }
      }
    } catch (error) {
      warnings.push({
        url: currentUrl,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    startUrl,
    pages,
    discoveredUrls: [...discovered],
    redirects,
    warnings,
    truncated: queue.length > 0,
  };
}
