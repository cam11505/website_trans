import { load } from 'cheerio';
import { urlToSitePath } from '@site-rescue/url-mapping';
import type { CheerioAPI } from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import { parseListContent, parseTextContent, sourceId } from '@site-rescue/html-inline';
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

export type NormalizeGenericHtmlSiteInput = NormalizeSiteInput;
export type {
  CapturedPageInput,
  CaptureWarningInput,
  DetectionEvidence,
  DetectionInput,
  DetectionResult,
  SourceAdapter,
} from '@site-rescue/core';

const GENERIC_HTML_CONFIDENCE = 0.1;
const BLOCK_DESCENDANT_SELECTOR =
  'h1, h2, h3, h4, h5, h6, p, img, ul, ol, a, hr, video, iframe, form, table, object';

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

export function detectGenericHtml(input: DetectionInput): DetectionResult {
  const detected =
    /<(?:!doctype\s+html|html|head|body|main|article|section|nav|h[1-6]|p|img|ul|ol|table|form)(?:\s|\/?>)/iu.test(
      input.html,
    );
  const evidence: DetectionEvidence[] = detected
    ? [{ signal: 'Document contains recognizable HTML structure', weight: GENERIC_HTML_CONFIDENCE }]
    : [];

  return {
    platform: 'generic-html',
    detected,
    confidence: detected ? GENERIC_HTML_CONFIDENCE : 0,
    evidence,
  };
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
  const caption = normalizeText(element.closest('figure').find('figcaption').first().text());
  return {
    type: 'image',
    src,
    alt: element.attr('alt') ?? '',
    ...(caption === '' ? {} : { caption }),
  };
}

function isButton(element: ReturnType<CheerioAPI>): boolean {
  const role = element.attr('role')?.toLowerCase();
  const classes = (element.attr('class') ?? '').toLowerCase().split(/\s+/u);
  return role === 'button' || classes.some((name) => /^(?:btn|button|cta)(?:-|$)/u.test(name));
}

function parseElement($: CheerioAPI, node: AnyNode, pageUrl: string, warnings: MigrationWarning[]): ContentBlock[] {
  if (node.type !== 'tag') {
    return [];
  }
  const tagName = (node as Element).name.toLowerCase();
  const element = $(node);

  if (['script', 'style', 'noscript', 'nav', 'header', 'footer', 'figcaption'].includes(tagName)) {
    return [];
  }
  if (/^h[1-6]$/u.test(tagName)) {
    const content = parseTextContent($, element.contents().toArray(), pageUrl, warnings);
    const id = sourceId($, node);
    return content.text === '' && content.inlines === undefined && id.id === undefined
      ? []
      : [{ type: 'heading', level: Number(tagName[1]) as 1 | 2 | 3 | 4 | 5 | 6, ...content, ...id }];
  }
  if (tagName === 'p') {
    const images = element
      .find('img')
      .toArray()
      .map((image) => toImageBlock($, image, pageUrl))
      .filter((image): image is ImageBlock => image !== undefined);
    const content = parseTextContent($, element.clone().find('img').remove().end().contents().toArray(), pageUrl, warnings);
    const id = sourceId($, node);
    return content.text === '' && content.inlines === undefined && id.id === undefined
      ? images : [{ type: 'paragraph', ...content, ...id }, ...images];
  }
  if (tagName === 'img') {
    const image = toImageBlock($, node, pageUrl);
    return image === undefined ? [] : [image];
  }
  if (tagName === 'ul' || tagName === 'ol') {
    const content = parseListContent($, node, pageUrl, warnings);
    return content.items.length === 0 ? [] : [{ type: 'list', ordered: tagName === 'ol', ...content, ...sourceId($, node) }];
  }
  if (tagName === 'a') {
    const label = normalizeText(element.text());
    const href = resolveHttpUrl(element.attr('href'), pageUrl);
    if (href !== undefined && isButton(element) && label !== '') {
      return [{ type: 'button', label, href }];
    }
    const content = parseTextContent($, [node], pageUrl, warnings);
    return content.text === '' && content.inlines === undefined ? [] : [{ type: 'paragraph', ...content }];
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

  if (element.find(BLOCK_DESCENDANT_SELECTOR).length === 0) {
    const content = parseTextContent($, element.contents().toArray(), pageUrl, warnings);
    return content.text === '' && content.inlines === undefined ? [] : [{ type: 'paragraph', ...content, ...sourceId($, node) }];
  }
  return element
    .contents()
    .toArray()
    .flatMap((child) => parseElement($, child, pageUrl, warnings));
}

function parseNavigation($: CheerioAPI, pageUrl: string): NavigationItem[] {
  const root = $('nav').first();
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
      .children('ul, ol')
      .first()
      .children('li')
      .toArray()
      .map(parseListItem)
      .filter((child): child is NavigationItem => child !== undefined);
    return { label, href, children };
  };

  const list = root.children('ul, ol').first();
  if (list.length > 0) {
    return list
      .children('li')
      .toArray()
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

function parsePage(input: CapturedPageInput, index: number, warnings: MigrationWarning[]): Page {
  const $ = load(input.html);
  const url = new URL(input.url);
  const main = $('main').first();
  const article = $('article').first();
  const roleMain = $('[role="main"]').first();
  let root = main;
  if (root.length === 0) {
    root = article;
  }
  if (root.length === 0) {
    root = roleMain;
  }
  if (root.length === 0) {
    root = $('body').first();
  }
  const blocks = root
    .contents()
    .toArray()
    .flatMap((child) => parseElement($, child, input.url, warnings));
  const heading = blocks.find((block) => block.type === 'heading');
  const title = input.title || (heading?.type === 'heading' ? heading.text : 'Untitled page');
  const description = $('meta[name="description"]').attr('content');

  return {
    id: `page-${String(index + 1).padStart(4, '0')}`,
    sourceUrl: input.url,
    sourcePath: urlToSitePath(url),
    targetPath: urlToSitePath(url),
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
    avif: 'image/avif',
    css: 'text/css',
    gif: 'image/gif',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    mp4: 'video/mp4',
    ogg: 'video/ogg',
    png: 'image/png',
    svg: 'image/svg+xml',
    webm: 'video/webm',
    webp: 'image/webp',
  };
  return extension === undefined ? undefined : types[extension];
}

function collectAssets(pages: Page[], capturedPages: CapturedPageInput[]): Asset[] {
  const urls = new Map<
    string,
    { mediaType: string | undefined; role: Asset['role'] | undefined }
  >();
  const add = (sourceUrl: string, mediaType?: string, role?: Asset['role']): void => {
    const existing = urls.get(sourceUrl);
    urls.set(sourceUrl, {
      mediaType: existing?.mediaType ?? mediaType,
      role: existing?.role ?? role,
    });
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
      const relationships = ($(node).attr('rel') ?? '').toLowerCase().split(/\s+/u);
      if (!relationships.includes('stylesheet')) {
        return;
      }
      const sourceUrl = resolveHttpUrl($(node).attr('href'), capturedPage.url);
      if (sourceUrl !== undefined) {
        add(sourceUrl, 'text/css', 'stylesheet');
      }
    });
  }

  return [...urls.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sourceUrl, details], index) => ({
      id: `asset-${String(index + 1).padStart(4, '0')}`,
      sourceUrl,
      ...(details.mediaType === undefined ? {} : { mediaType: details.mediaType }),
      ...(details.role === undefined ? {} : { role: details.role }),
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

export function normalizeGenericHtmlSite(input: NormalizeGenericHtmlSiteInput): Site {
  if (input.pages.length === 0) {
    throw new Error('At least one captured page is required.');
  }
  const home = input.pages[0]!;
  const $ = load(home.html);
  const inlineWarnings: MigrationWarning[] = [];
  const pages = input.pages.map((page, index) => parsePage(page, index, inlineWarnings));
  const rawHtmlCount = pages
    .flatMap((page) => page.blocks)
    .reduce((total, block) => total + countRawHtml(block), 0);
  const warnings: MigrationWarning[] = [
    {
      code: 'generic-html-fallback',
      message: 'The generic HTML adapter preserves standard content only; review the migration output.',
      sourceUrl: home.url,
    },
    ...(input.warnings ?? []).map((warning) => ({
      code: 'crawl-fetch-failed',
      message: warning.message,
      sourceUrl: warning.url,
    })),
    ...inlineWarnings,
  ];
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
      adapter: 'generic-html',
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

export const genericHtmlAdapter: SourceAdapter = {
  id: 'generic-html',
  displayName: 'Generic HTML',
  detect: detectGenericHtml,
  normalize: normalizeGenericHtmlSite,
};
