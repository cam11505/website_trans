import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { posix } from 'node:path';
import {
  parseSite,
  resolveInlineLink,
  type ContentBlock,
  type InlineNode,
  type NavigationItem,
  type Page,
  type Site,
} from '@site-rescue/content-schema';

export interface ExportStaticHtmlOptions {
  captureDirectory: string;
  outputDirectory: string;
  styleMode?: StaticHtmlStyleMode;
}

export interface ExportStaticHtmlResult {
  outputDirectory: string;
  pageCount: number;
  redirectPageCount: number;
  copiedAssetCount: number;
  appliedSourceStylesheetCount: number;
}

export type StaticHtmlStyleMode = 'baseline' | 'source';

const STYLESHEET_PATH = 'assets/site-rescue.css';
const REDIRECT_MANIFEST_PATH = 'redirects.json';
const REDIRECT_MANIFEST_VERSION = '1.0.0';

const STYLESHEET = `:root {
  color-scheme: light dark;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.6;
}
* { box-sizing: border-box; }
body { margin: 0; background: Canvas; color: CanvasText; }
header, main, footer { width: min(72rem, calc(100% - 2rem)); margin-inline: auto; }
header { padding-block: 1.5rem 1rem; border-bottom: 1px solid color-mix(in srgb, CanvasText 20%, transparent); }
main { padding-block: 2rem; }
footer { padding-block: 1rem 2rem; color: color-mix(in srgb, CanvasText 65%, transparent); }
nav ul { display: flex; flex-wrap: wrap; gap: .5rem 1rem; padding: 0; list-style: none; }
nav ul ul { margin-left: 1rem; }
a { color: LinkText; }
code { white-space: pre-wrap; }
img, video { max-width: 100%; height: auto; }
figure { margin-inline: 0; }
.sr-gallery { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 1rem; }
.sr-columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)); gap: 1.5rem; }
.sr-button { display: inline-block; padding: .6rem 1rem; border: 1px solid currentColor; border-radius: .35rem; text-decoration: none; }
.sr-preserved { padding: 1rem; border: 1px dashed color-mix(in srgb, CanvasText 40%, transparent); }
.sr-preserved pre { overflow: auto; white-space: pre-wrap; }
`;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function resolveWithin(root: string, relativePath: string): string {
  const absoluteRoot = resolve(root);
  const target = resolve(absoluteRoot, ...relativePath.split('/'));
  if (target !== absoluteRoot && !target.startsWith(`${absoluteRoot}${sep}`)) {
    throw new Error(`Unsafe output path: ${relativePath}`);
  }
  return target;
}

function resolveAssetWithin(root: string, localPath: string): string {
  if (!localPath.startsWith('assets/') || localPath.includes('\\')) {
    throw new Error(`Unsafe local asset path: ${localPath}`);
  }
  const assetRoot = resolve(root, 'assets');
  const target = resolve(assetRoot, ...localPath.slice('assets/'.length).split('/'));
  if (target === assetRoot || !target.startsWith(`${assetRoot}${sep}`)) {
    throw new Error(`Unsafe local asset path: ${localPath}`);
  }
  return target;
}

function collisionKey(relativePath: string): string {
  return relativePath.toLowerCase();
}

function validateSegment(segment: string, targetPath: string): void {
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    throw new Error(`Invalid encoded target path: ${targetPath}`);
  }
  if (
    decoded === '.' ||
    decoded === '..' ||
    decoded.includes('/') ||
    decoded.includes('\\') ||
    decoded.includes('\0')
  ) {
    throw new Error(`Unsafe target path: ${targetPath}`);
  }
}

export function targetPathToFile(targetPath: string): string {
  if (!targetPath.startsWith('/') || targetPath.startsWith('//') || targetPath.includes('\\')) {
    throw new Error(`Target path must be an absolute site path: ${targetPath}`);
  }
  const pathname = targetPath.split(/[?#]/u, 1)[0] ?? '/';
  const segments = pathname.split('/').filter((segment) => segment !== '');
  segments.forEach((segment) => validateSegment(segment, targetPath));
  if (segments.length === 0) {
    return 'index.html';
  }
  if (pathname.endsWith('/') || posix.extname(segments.at(-1) ?? '') === '') {
    return posix.join(...segments, 'index.html');
  }
  return posix.join(...segments);
}

function normalizedUrl(value: string, baseUrl: string): { href: string; hash: string } | undefined {
  try {
    const url = new URL(value, baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return undefined;
    }
    const hash = url.hash;
    url.hash = '';
    return { href: url.href, hash };
  } catch {
    return undefined;
  }
}

interface RenderContext {
  currentFile: string;
  sourceUrl: string;
  pageFilesBySourceUrl: ReadonlyMap<string, string>;
  assetFilesBySourceUrl: ReadonlyMap<string, string>;
  localAssetPaths: ReadonlySet<string>;
  sourceStylesheetPaths: readonly string[];
  baseUrl: string;
}

function relativeReference(currentFile: string, targetFile: string): string {
  const relative = posix.relative(posix.dirname(currentFile), targetFile);
  return relative === '' ? posix.basename(targetFile) : relative;
}

function rewriteReference(value: string, context: RenderContext): string {
  if (context.localAssetPaths.has(value)) {
    return relativeReference(context.currentFile, value);
  }
  const normalized = normalizedUrl(value, context.baseUrl);
  if (normalized === undefined) {
    return value;
  }
  const targetFile = context.pageFilesBySourceUrl.get(normalized.href) ?? context.assetFilesBySourceUrl.get(normalized.href);
  return targetFile === undefined
    ? value
    : `${relativeReference(context.currentFile, targetFile)}${normalized.hash}`;
}

function renderImage(
  image: Extract<ContentBlock, { type: 'image' }>,
  context: RenderContext,
): string {
  const markup = `<img src="${escapeHtml(rewriteReference(image.src, context))}" alt="${escapeHtml(image.alt)}" loading="lazy">`;
  return image.caption === undefined
    ? markup
    : `<figure>${markup}<figcaption>${escapeHtml(image.caption)}</figcaption></figure>`;
}

function renderPreservedHtml(label: string, html: string): string {
  return `<details class="sr-preserved"><summary>${escapeHtml(label)}</summary><pre>${escapeHtml(html)}</pre></details>`;
}

function renderId(id: string | undefined): string {
  return id === undefined ? '' : ` id="${escapeHtml(id)}"`;
}

function renderInlines(nodes: readonly InlineNode[], context: RenderContext): string {
  return nodes.map((node): string => {
    if (node.type === 'text') {
      return escapeHtml(node.value);
    }
    const id = renderId(node.id);
    if (node.type === 'code') {
      return `<code${id}>${escapeHtml(node.value)}</code>`;
    }
    if (node.type === 'lineBreak') {
      return `<br${id}>`;
    }
    const children = renderInlines(node.children, context);
    if (node.type === 'link') {
      const href = resolveInlineLink(node.href, context.sourceUrl);
      if (href === undefined) {
        throw new Error('Unsafe or unsupported inline link target.');
      }
      return `<a${id} href="${escapeHtml(rewriteReference(href, context))}">${children}</a>`;
    }
    const tag = node.type === 'emphasis' ? 'em' : node.type;
    return `<${tag}${id}>${children}</${tag}>`;
  }).join('');
}

function renderBlock(block: ContentBlock, context: RenderContext): string {
  switch (block.type) {
    case 'heading':
      return `<h${block.level}${renderId(block.id)}>${block.inlines === undefined ? escapeHtml(block.text) : renderInlines(block.inlines, context)}</h${block.level}>`;
    case 'paragraph':
      return `<p${renderId(block.id)}>${block.inlines === undefined ? escapeHtml(block.text) : renderInlines(block.inlines, context)}</p>`;
    case 'image':
      return renderImage(block, context);
    case 'gallery':
      return `<div class="sr-gallery">${block.images.map((image) => renderImage(image, context)).join('')}</div>`;
    case 'button':
      return `<p><a class="sr-button" href="${escapeHtml(rewriteReference(block.href, context))}">${escapeHtml(block.label)}</a></p>`;
    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul';
      return `<${tag}${renderId(block.id)}>${block.items.map((item, index) => `<li>${block.itemInlines === undefined ? escapeHtml(item) : renderInlines(block.itemInlines[index]!, context)}</li>`).join('')}</${tag}>`;
    }
    case 'columns':
      return `<div class="sr-columns">${block.columns
        .map((column) => `<section>${column.map((child) => renderBlock(child, context)).join('\n')}</section>`)
        .join('')}</div>`;
    case 'divider':
      return '<hr>';
    case 'video': {
      const poster =
        block.poster === undefined
          ? ''
          : ` poster="${escapeHtml(rewriteReference(block.poster, context))}"`;
      return `<video controls preload="metadata" src="${escapeHtml(rewriteReference(block.src, context))}"${poster}></video>`;
    }
    case 'embed':
      return renderPreservedHtml(
        block.provider === undefined ? 'Preserved embed' : `Preserved ${block.provider} embed`,
        block.html,
      );
    case 'rawHtml':
      return renderPreservedHtml(`Preserved HTML: ${block.reason}`, block.html);
  }
}

function renderNavigation(items: NavigationItem[], context: RenderContext): string {
  const renderItems = (children: NavigationItem[]): string =>
    `<ul>${children
      .map(
        (item) =>
          `<li><a href="${escapeHtml(rewriteReference(item.href, context))}">${escapeHtml(item.label)}</a>${
            item.children.length === 0 ? '' : renderItems(item.children)
          }</li>`,
      )
      .join('')}</ul>`;
  return items.length === 0 ? '' : `<nav aria-label="Site navigation">${renderItems(items)}</nav>`;
}

function renderPage(site: Site, page: Page, context: RenderContext): string {
  const title = page.seo?.title ?? page.title;
  const description = page.seo?.description ?? site.metadata.description;
  const stylesheet = relativeReference(context.currentFile, STYLESHEET_PATH);
  const sourceStylesheets = context.sourceStylesheetPaths
    .map(
      (path) =>
        `  <link rel="stylesheet" href="${escapeHtml(relativeReference(context.currentFile, path))}" data-site-rescue-style="source">`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="${escapeHtml(site.metadata.language ?? 'en')}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>${
    description === undefined
      ? ''
      : `\n  <meta name="description" content="${escapeHtml(description)}">`
  }
  <link rel="stylesheet" href="${escapeHtml(stylesheet)}" data-site-rescue-style="baseline">${
    sourceStylesheets === '' ? '' : `\n${sourceStylesheets}`
  }
</head>
<body>
  <header>
    <strong>${escapeHtml(site.metadata.title)}</strong>
    ${renderNavigation(site.navigation, context)}
  </header>
  <main>
${page.blocks.map((block) => `    ${renderBlock(block, context)}`).join('\n')}
  </main>
  <footer>Exported locally by Site Rescue.</footer>
</body>
</html>
`;
}

function renderRedirectPage(currentFile: string, targetFile: string): string {
  const target = relativeReference(currentFile, targetFile);
  const escapedTarget = escapeHtml(target);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="0; url=${escapedTarget}">
  <link rel="canonical" href="${escapedTarget}">
  <title>Page moved</title>
</head>
<body>
  <p>This page moved to <a href="${escapedTarget}">${escapedTarget}</a>.</p>
</body>
</html>
`;
}

function validateRedirectPath(value: string, field: 'from' | 'to'): void {
  if (value.includes('?') || value.includes('#')) {
    throw new Error(`Redirect ${field} path must not contain a query or fragment: ${value}`);
  }
}

function isStylesheetAsset(asset: Site['assets'][number]): boolean {
  if (asset.role === 'stylesheet') {
    return true;
  }
  if (asset.role === 'dependency') {
    return false;
  }
  const mediaType = asset.mediaType?.split(';', 1)[0]?.trim().toLowerCase();
  if (mediaType === 'text/css') {
    return true;
  }
  try {
    return new URL(asset.sourceUrl).pathname.toLowerCase().endsWith('.css');
  } catch {
    return false;
  }
}

function selectSourceStylesheets(site: Site, styleMode: StaticHtmlStyleMode): string[] {
  if (styleMode === 'baseline') {
    return [];
  }
  const candidates = site.assets.filter(isStylesheetAsset);
  if (candidates.length === 0) {
    throw new Error('Source style mode requested, but the capture contains no source stylesheets.');
  }
  const unavailable = candidates.filter(
    (asset) => asset.localPath === undefined || asset.checksum === undefined,
  );
  if (unavailable.length > 0) {
    throw new Error(
      `Source style mode requires every source stylesheet to be downloaded and verified; ${unavailable.length} unavailable stylesheet(s) found. Capture again without --skip-assets or use --style-mode baseline.`,
    );
  }
  return [
    ...new Set(candidates.map((asset) => asset.localPath).filter((path) => path !== undefined)),
  ];
}

function checksum(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function copyAssets(
  site: Site,
  captureDirectory: string,
  outputDirectory: string,
): Promise<number> {
  const copied = new Set<string>();
  for (const asset of site.assets) {
    if (asset.localPath === undefined || copied.has(asset.localPath)) {
      continue;
    }
    const source = resolveAssetWithin(captureDirectory, asset.localPath);
    const destination = resolveAssetWithin(outputDirectory, asset.localPath);
    const bytes = await readFile(source);
    if (asset.checksum !== undefined && checksum(bytes) !== asset.checksum) {
      throw new Error(`Asset checksum mismatch: ${asset.localPath}`);
    }
    await mkdir(dirname(destination), { recursive: true });
    if (source !== destination) {
      await writeFile(destination, bytes);
    }
    copied.add(asset.localPath);
  }
  return copied.size;
}

export async function exportStaticHtml(
  site: Site,
  options: ExportStaticHtmlOptions,
): Promise<ExportStaticHtmlResult> {
  site = parseSite(site);
  const outputDirectory = resolve(options.outputDirectory);
  const captureDirectory = resolve(options.captureDirectory);
  const styleMode = options.styleMode ?? 'baseline';
  const sourceStylesheetPaths = selectSourceStylesheets(site, styleMode);
  const pageFilesBySourceUrl = new Map<string, string>();
  const assetFilesBySourceUrl = new Map(site.assets.flatMap((asset) => {
    const source = normalizedUrl(asset.sourceUrl, site.source.baseUrl);
    return asset.localPath === undefined || source === undefined ? [] : [[source.href, asset.localPath] as const];
  }));
  const pageFilesByTargetPath = new Map<string, string>();
  const claimedFiles = new Set<string>([
    collisionKey(STYLESHEET_PATH),
    collisionKey(REDIRECT_MANIFEST_PATH),
    ...site.assets.flatMap((asset) =>
      asset.localPath === undefined ? [] : [collisionKey(asset.localPath)],
    ),
  ]);

  for (const page of site.pages) {
    const outputFile = targetPathToFile(page.targetPath);
    const outputKey = collisionKey(outputFile);
    if (claimedFiles.has(outputKey)) {
      throw new Error(`Multiple outputs target the same file: ${outputFile}`);
    }
    claimedFiles.add(outputKey);
    const source = normalizedUrl(page.sourceUrl, site.source.baseUrl);
    if (source === undefined) {
      throw new Error(`Invalid page source URL: ${page.sourceUrl}`);
    }
    if (pageFilesBySourceUrl.has(source.href)) {
      throw new Error(`Multiple pages share the same source URL: ${source.href}`);
    }
    pageFilesBySourceUrl.set(source.href, outputFile);
    pageFilesByTargetPath.set(page.targetPath, outputFile);
  }

  const redirectFiles = new Map<string, string>();
  for (const redirect of site.redirects) {
    validateRedirectPath(redirect.from, 'from');
    validateRedirectPath(redirect.to, 'to');
    const targetFile = pageFilesByTargetPath.get(redirect.to);
    if (targetFile === undefined) {
      throw new Error(`Redirect target does not match an exported page: ${redirect.to}`);
    }
    const redirectFile = targetPathToFile(redirect.from);
    const redirectKey = collisionKey(redirectFile);
    if (claimedFiles.has(redirectKey)) {
      throw new Error(`Redirect output collides with another file: ${redirectFile}`);
    }
    claimedFiles.add(redirectKey);
    redirectFiles.set(redirectFile, targetFile);
  }

  await mkdir(resolveWithin(outputDirectory, 'assets'), { recursive: true });
  await writeFile(resolveWithin(outputDirectory, STYLESHEET_PATH), STYLESHEET, 'utf8');
  await writeFile(
    resolveWithin(outputDirectory, REDIRECT_MANIFEST_PATH),
    `${JSON.stringify(
      {
        version: REDIRECT_MANIFEST_VERSION,
        redirects: site.redirects,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  const copiedAssetCount = await copyAssets(site, captureDirectory, outputDirectory);
  const localAssetPaths = new Set(
    site.assets.flatMap((asset) => (asset.localPath === undefined ? [] : [asset.localPath])),
  );

  for (const page of site.pages) {
    const currentFile = targetPathToFile(page.targetPath);
    const destination = resolveWithin(outputDirectory, currentFile);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(
      destination,
      renderPage(site, page, {
        baseUrl: site.source.baseUrl,
        sourceUrl: page.sourceUrl,
        assetFilesBySourceUrl,
        currentFile,
        localAssetPaths,
        pageFilesBySourceUrl,
        sourceStylesheetPaths,
      }),
      'utf8',
    );
  }

  for (const [redirectFile, targetFile] of redirectFiles) {
    const destination = resolveWithin(outputDirectory, redirectFile);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, renderRedirectPage(redirectFile, targetFile), 'utf8');
  }

  return {
    outputDirectory,
    pageCount: site.pages.length,
    redirectPageCount: redirectFiles.size,
    copiedAssetCount,
    appliedSourceStylesheetCount: sourceStylesheetPaths.length,
  };
}
