import { load } from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import {
  CURRENT_SCHEMA_VERSION,
  parseSite,
  type Asset,
  type ContentBlock,
  type ImageBlock,
  type MigrationWarning,
  type NavigationItem,
  type Page,
  type Site,
} from '@site-rescue/content-schema';

export interface DetectionInput {
  url: string;
  html: string;
}

export interface DetectionEvidence {
  signal: string;
  weight: number;
}

export interface DetectionResult {
  platform: 'weebly';
  detected: boolean;
  confidence: number;
  evidence: DetectionEvidence[];
}

export interface SourceAdapter {
  readonly id: string;
  readonly displayName: string;
  detect(input: DetectionInput): DetectionResult;
}

export interface CapturedPageInput {
  url: string;
  html: string;
  title: string;
}

export interface CaptureWarningInput {
  url: string;
  message: string;
}

export interface NormalizeWeeblySiteInput {
  baseUrl: string;
  pages: CapturedPageInput[];
  capturedAt?: string;
  warnings?: CaptureWarningInput[];
}

function addEvidence(
  evidence: DetectionEvidence[],
  condition: boolean,
  signal: string,
  weight: number,
): void {
  if (condition) {
    evidence.push({ signal, weight });
  }
}

export function detectWeebly(input: DetectionInput): DetectionResult {
  const url = new URL(input.url);
  const $ = load(input.html);
  const evidence: DetectionEvidence[] = [];
  const hostname = url.hostname.toLowerCase();
  const generator = $('meta[name="generator"]').attr('content')?.toLowerCase() ?? '';
  const documentHtml = $.html().toLowerCase();

  addEvidence(evidence, /(^|\.)weebly\.com$/u.test(hostname), 'Hostname is on weebly.com', 0.65);
  addEvidence(evidence, generator.includes('weebly'), 'Generator metadata names Weebly', 0.55);
  addEvidence(
    evidence,
    /(?:cdn\d*\.editmysite\.com|assets\.weebly\.com|weeblycloud\.com)/u.test(documentHtml),
    'Document references Weebly-hosted assets',
    0.35,
  );
  addEvidence(
    evidence,
    $('[class*="wsite-"], [id*="wsite-"]').length > 0,
    'Document contains Weebly wsite markers',
    0.3,
  );
  addEvidence(
    evidence,
    $('script[src*="weebly.com"], script[src*="editmysite.com"]').length > 0,
    'Document loads a Weebly script',
    0.25,
  );

  const confidence = Math.min(
    1,
    Number(evidence.reduce((total, item) => total + item.weight, 0).toFixed(2)),
  );

  return {
    platform: 'weebly',
    detected: confidence >= 0.5,
    confidence,
    evidence,
  };
}

export const weeblyAdapter: SourceAdapter = {
  id: 'weebly',
  displayName: 'Weebly',
  detect: detectWeebly,
};

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function resolveHttpUrl(value: string | undefined, baseUrl: string): string | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }
  try {
    const url = new URL(value, baseUrl);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function toImageBlock($: CheerioAPI, node: AnyNode, pageUrl: string): ImageBlock | undefined {
  const element = $(node);
  const src = resolveHttpUrl(element.attr('src') ?? element.attr('data-src'), pageUrl);
  if (src === undefined) {
    return undefined;
  }
  const caption = normalizeText(
    element.closest('figure, .wsite-image').find('figcaption, .wsite-image-caption').first().text(),
  );
  return {
    type: 'image',
    src,
    alt: element.attr('alt') ?? '',
    ...(caption === '' ? {} : { caption }),
  };
}

function parseElement($: CheerioAPI, node: AnyNode, pageUrl: string): ContentBlock[] {
  if (node.type !== 'tag') {
    return [];
  }
  const tagName = (node as Element).name.toLowerCase();
  const element = $(node);

  if (['script', 'style', 'noscript', 'nav', 'header', 'footer'].includes(tagName)) {
    return [];
  }

  if (/^h[1-6]$/u.test(tagName)) {
    const text = normalizeText(element.text());
    return text === ''
      ? []
      : [{ type: 'heading', level: Number(tagName[1]) as 1 | 2 | 3 | 4 | 5 | 6, text }];
  }

  if (tagName === 'p') {
    const blocks = element
      .find('img')
      .toArray()
      .map((image) => toImageBlock($, image, pageUrl))
      .filter((image): image is ImageBlock => image !== undefined);
    const text = normalizeText(element.clone().find('img').remove().end().text());
    return text === '' ? blocks : [{ type: 'paragraph', text }, ...blocks];
  }

  if (tagName === 'img') {
    const image = toImageBlock($, node, pageUrl);
    return image === undefined ? [] : [image];
  }

  if (element.hasClass('wsite-imagegallery')) {
    const images = element
      .find('img')
      .toArray()
      .map((image) => toImageBlock($, image, pageUrl))
      .filter((image): image is ImageBlock => image !== undefined);
    return images.length === 0 ? [] : [{ type: 'gallery', images }];
  }

  if (element.hasClass('wsite-multicol')) {
    const columns = element
      .find('.wsite-multicol-col')
      .toArray()
      .map((column) =>
        $(column)
          .contents()
          .toArray()
          .flatMap((child) => parseElement($, child, pageUrl)),
      )
      .filter((column) => column.length > 0);
    return columns.length < 2 ? columns.flat() : [{ type: 'columns', columns }];
  }

  if (tagName === 'ul' || tagName === 'ol') {
    const items = element
      .children('li')
      .toArray()
      .map((item) => normalizeText($(item).text()))
      .filter((item) => item !== '');
    return items.length === 0 ? [] : [{ type: 'list', ordered: tagName === 'ol', items }];
  }

  if (tagName === 'a' && /(?:^|\s)wsite-button(?:\s|$)/u.test(element.attr('class') ?? '')) {
    const href = resolveHttpUrl(element.attr('href'), pageUrl);
    const label = normalizeText(element.text());
    return href === undefined || label === '' ? [] : [{ type: 'button', label, href }];
  }

  if (tagName === 'hr') {
    return [{ type: 'divider' }];
  }

  if (tagName === 'video') {
    const src = resolveHttpUrl(element.attr('src') ?? element.find('source').first().attr('src'), pageUrl);
    if (src === undefined) {
      return [];
    }
    const poster = resolveHttpUrl(element.attr('poster'), pageUrl);
    return [{ type: 'video', src, ...(poster === undefined ? {} : { poster }) }];
  }

  if (tagName === 'iframe') {
    const src = resolveHttpUrl(element.attr('src'), pageUrl);
    return [{
      type: 'embed',
      html: $.html(node) ?? '',
      ...(src === undefined ? {} : { provider: new URL(src).hostname }),
    }];
  }

  if (['form', 'table', 'object'].includes(tagName)) {
    return [{
      type: 'rawHtml',
      html: $.html(node) ?? '',
      reason: `Unsupported ${tagName} element`,
    }];
  }

  return element
    .contents()
    .toArray()
    .flatMap((child) => parseElement($, child, pageUrl));
}

function parseNavigation($: CheerioAPI, pageUrl: string): NavigationItem[] {
  const root = $('.wsite-menu-default, nav, #navigation, .wsite-menu-wrap').first();
  if (root.length === 0) {
    return [];
  }

  const parseListItem = (node: AnyNode): NavigationItem | undefined => {
    const item = $(node);
    const anchor = item.children('a').first();
    const href = resolveHttpUrl(anchor.attr('href'), pageUrl);
    const label = normalizeText(anchor.text());
    if (href === undefined || label === '') {
      return undefined;
    }
    const children = item
      .children('ul')
      .children('li')
      .toArray()
      .map(parseListItem)
      .filter((child): child is NavigationItem => child !== undefined);
    return { label, href, children };
  };

  const listItems = root.children('ul').children('li').toArray();
  if (listItems.length > 0) {
    return listItems
      .map(parseListItem)
      .filter((item): item is NavigationItem => item !== undefined);
  }

  return root
    .find('a[href]')
    .toArray()
    .map((anchor): NavigationItem | undefined => {
      const href = resolveHttpUrl($(anchor).attr('href'), pageUrl);
      const label = normalizeText($(anchor).text());
      return href === undefined || label === '' ? undefined : { label, href, children: [] };
    })
    .filter((item): item is NavigationItem => item !== undefined);
}

function parsePage(input: CapturedPageInput, index: number): Page {
  const $ = load(input.html);
  const url = new URL(input.url);
  const contentRoot = $('#wsite-content, .wsite-elements, main').first();
  const root = contentRoot.length === 0 ? $('body').first() : contentRoot;
  const blocks = root
    .contents()
    .toArray()
    .flatMap((child) => parseElement($, child, input.url));
  const heading = blocks.find((block) => block.type === 'heading');
  const title = input.title || (heading?.type === 'heading' ? heading.text : 'Untitled page');
  const description = $('meta[name="description"]').attr('content');

  return {
    id: `page-${String(index + 1).padStart(4, '0')}`,
    sourceUrl: input.url,
    sourcePath: `${url.pathname}${url.search}`,
    targetPath: `${url.pathname}${url.search}`,
    title,
    seo: {
      title: $('meta[property="og:title"]').attr('content') ?? title,
      ...(description === undefined ? {} : { description }),
    },
    blocks,
  };
}

function inferMediaType(sourceUrl: string): string | undefined {
  const extension = new URL(sourceUrl).pathname.split('.').at(-1)?.toLowerCase();
  const types: Record<string, string> = {
    gif: 'image/gif',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    png: 'image/png',
    svg: 'image/svg+xml',
    webp: 'image/webp',
  };
  return extension === undefined ? undefined : types[extension];
}

function collectAssets(pages: Page[]): Asset[] {
  const urls = new Set<string>();
  const visit = (block: ContentBlock): void => {
    if (block.type === 'image') {
      urls.add(block.src);
    } else if (block.type === 'gallery') {
      block.images.forEach((image) => urls.add(image.src));
    } else if (block.type === 'columns') {
      block.columns.flat().forEach(visit);
    } else if (block.type === 'video' && block.poster !== undefined) {
      urls.add(block.poster);
    }
  };
  pages.flatMap((page) => page.blocks).forEach(visit);

  return [...urls].sort().map((sourceUrl, index) => {
    const mediaType = inferMediaType(sourceUrl);
    return {
      id: `asset-${String(index + 1).padStart(4, '0')}`,
      sourceUrl,
      ...(mediaType === undefined ? {} : { mediaType }),
    };
  });
}

export function normalizeWeeblySite(input: NormalizeWeeblySiteInput): Site {
  if (input.pages.length === 0) {
    throw new Error('At least one captured page is required.');
  }
  const home = input.pages[0]!;
  const $ = load(home.html);
  const pages = input.pages.map(parsePage);
  const rawHtmlCount = pages
    .flatMap((page) => page.blocks)
    .filter((block) => block.type === 'rawHtml').length;
  const warnings: MigrationWarning[] = (input.warnings ?? []).map((warning) => ({
    code: 'crawl-fetch-failed',
    message: warning.message,
    sourceUrl: warning.url,
  }));
  if (rawHtmlCount > 0) {
    warnings.push({
      code: 'unsupported-html-preserved',
      message: `${rawHtmlCount} unsupported element(s) were preserved as raw HTML.`,
      sourceUrl: home.url,
    });
  }

  return parseSite({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    source: {
      adapter: 'weebly',
      baseUrl: input.baseUrl,
      capturedAt: input.capturedAt ?? new Date().toISOString(),
    },
    metadata: {
      title: home.title || normalizeText($('title').text()) || 'Untitled site',
      ...($('meta[name="description"]').attr('content') === undefined
        ? {}
        : { description: $('meta[name="description"]').attr('content') }),
      ...($('html').attr('lang') === undefined ? {} : { language: $('html').attr('lang') }),
    },
    navigation: parseNavigation($, home.url),
    pages,
    assets: collectAssets(pages),
    redirects: [],
    warnings,
  });
}
