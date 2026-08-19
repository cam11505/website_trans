import { load } from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import type {
  CapturedPageInput,
  DetectionEvidence,
  DetectionInput,
  DetectionResult,
  NormalizeSiteInput,
  SourceAdapter,
} from '@site-rescue/core';
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

export type NormalizeWeeblySiteInput = NormalizeSiteInput;
export type {
  CapturedPageInput,
  CaptureWarningInput,
  DetectionEvidence,
  DetectionInput,
  DetectionResult,
  SourceAdapter,
} from '@site-rescue/core';

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
  normalize: normalizeWeeblySite,
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

function resolveFirstHttpUrl(
  values: Array<string | undefined>,
  baseUrl: string,
): string | undefined {
  for (const value of values) {
    const resolved = resolveHttpUrl(value, baseUrl);
    if (resolved !== undefined) {
      return resolved;
    }
  }
  return undefined;
}

function toImageBlock($: CheerioAPI, node: AnyNode, pageUrl: string): ImageBlock | undefined {
  const element = $(node);
  const src = resolveFirstHttpUrl(
    [element.attr('data-src'), element.attr('data-original'), element.attr('src')],
    pageUrl,
  );
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
    const src = resolveFirstHttpUrl(
      [element.attr('src'), element.find('source').first().attr('src')],
      pageUrl,
    );
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
    const directChildList = item.children('ul').first();
    const wrappedChildList = item.children('.wsite-menu-wrap').children('ul').first();
    const childList = directChildList.length === 0 ? wrappedChildList : directChildList;
    const children = childList
      .children('li')
      .toArray()
      .map(parseListItem)
      .filter((child): child is NavigationItem => child !== undefined);
    return { label, href, children };
  };

  const rootList = root.is('ul') ? root : root.children('ul').first();
  const listItems = rootList.children('li').toArray();
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
    css: 'text/css',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    mp4: 'video/mp4',
    ogg: 'video/ogg',
    webm: 'video/webm',
  };
  return extension === undefined ? undefined : types[extension];
}

function collectAssets(pages: Page[], capturedPages: CapturedPageInput[]): Asset[] {
  const urls = new Map<string, string | undefined>();
  const add = (sourceUrl: string, mediaType?: string): void => {
    const existing = urls.get(sourceUrl);
    if (!urls.has(sourceUrl) || (existing === undefined && mediaType !== undefined)) {
      urls.set(sourceUrl, mediaType);
    }
  };
  const visit = (block: ContentBlock): void => {
    if (block.type === 'image') {
      add(block.src, inferMediaType(block.src));
    } else if (block.type === 'gallery') {
      block.images.forEach((image) => add(image.src, inferMediaType(image.src)));
    } else if (block.type === 'columns') {
      block.columns.flat().forEach(visit);
    } else if (block.type === 'video') {
      add(block.src, inferMediaType(block.src));
      if (block.poster !== undefined) {
        add(block.poster, inferMediaType(block.poster));
      }
    }
  };
  pages.flatMap((page) => page.blocks).forEach(visit);

  for (const capturedPage of capturedPages) {
    const $ = load(capturedPage.html);
    $('link[href]').each((_index, node) => {
      const relationship = ($(node).attr('rel') ?? '').toLowerCase().split(/\s+/u);
      if (!relationship.includes('stylesheet')) {
        return;
      }
      const sourceUrl = resolveHttpUrl($(node).attr('href'), capturedPage.url);
      if (sourceUrl !== undefined) {
        add(sourceUrl, 'text/css');
      }
    });
  }

  return [...urls.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sourceUrl, mediaType], index) => ({
      id: `asset-${String(index + 1).padStart(4, '0')}`,
      sourceUrl,
      ...(mediaType === undefined ? {} : { mediaType }),
    }));
}

function countRawHtml(block: ContentBlock): number {
  if (block.type === 'rawHtml') {
    return 1;
  }
  if (block.type === 'columns') {
    return block.columns.flat().reduce((total, child) => total + countRawHtml(child), 0);
  }
  return 0;
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
    .reduce((total, block) => total + countRawHtml(block), 0);
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
    assets: collectAssets(pages, input.pages),
    redirects: [],
    warnings,
  });
}
