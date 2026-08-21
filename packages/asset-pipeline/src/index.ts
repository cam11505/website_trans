import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { posix } from 'node:path';
import {
  parseSite,
  type Asset,
  type ContentBlock,
  type MigrationWarning,
  type Page,
  type Site,
} from '@site-rescue/content-schema';
import {
  collectCssReferences,
  rewriteCssReferences,
  type CssReference,
} from '@site-rescue/css-references';
import {
  fetchWithRetry,
  readResponseBytes,
  type HttpFetcher,
} from '@site-rescue/http-policy';

export const DEFAULT_MAX_ASSET_BYTES = 50 * 1024 * 1024;
export const DEFAULT_ASSET_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_CSS_DEPTH = 5;
export const DEFAULT_MAX_CSS_DEPENDENCIES = 500;

export type AssetFetcher = HttpFetcher;

export interface DownloadSiteAssetsOptions {
  outputDirectory: string;
  fetcher?: AssetFetcher;
  maxAssetBytes?: number;
  timeoutMs?: number;
  maxRetries?: number;
  maxCssDepth?: number;
  maxCssDependencies?: number;
}

export interface DownloadSiteAssetsResult {
  site: Site;
  downloadedAssetCount: number;
  storedFileCount: number;
  deduplicatedAssetCount: number;
  failedAssetCount: number;
  cssFileCount: number;
  discoveredCssDependencyCount: number;
  rewrittenCssReferenceCount: number;
}

interface FetchResult {
  bytes: Uint8Array;
  mediaType?: string;
  finalUrl: string;
}

interface QueueItem {
  asset: Asset;
  cssDepth: number;
}

interface FetchedRecord extends QueueItem, FetchResult {
  cssParseFailed: boolean;
  localPath?: string;
  checksum?: string;
}

const EXTENSION_BY_MEDIA_TYPE: Record<string, string> = {
  'application/javascript': '.js',
  'application/pdf': '.pdf',
  'font/otf': '.otf',
  'font/ttf': '.ttf',
  'font/woff': '.woff',
  'font/woff2': '.woff2',
  'image/avif': '.avif',
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/svg+xml': '.svg',
  'image/webp': '.webp',
  'text/css': '.css',
  'text/javascript': '.js',
  'video/mp4': '.mp4',
  'video/ogg': '.ogv',
  'video/webm': '.webm',
};

const MEDIA_TYPE_BY_EXTENSION: Record<string, string> = Object.fromEntries(
  Object.entries(EXTENSION_BY_MEDIA_TYPE).map(([mediaType, extension]) => [extension, mediaType]),
);

function checksum(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeMediaType(value: string | null | undefined): string | undefined {
  const mediaType = value?.split(';', 1)[0]?.trim().toLowerCase();
  return mediaType === undefined || mediaType === '' ? undefined : mediaType;
}

function inferMediaType(sourceUrl: string): string | undefined {
  return MEDIA_TYPE_BY_EXTENSION[extname(new URL(sourceUrl).pathname).toLowerCase()];
}

function extensionFor(asset: Asset, mediaType: string | undefined): string {
  if (mediaType !== undefined && EXTENSION_BY_MEDIA_TYPE[mediaType] !== undefined) {
    return EXTENSION_BY_MEDIA_TYPE[mediaType];
  }
  const extension = extname(new URL(asset.sourceUrl).pathname).toLowerCase();
  return /^\.[a-z0-9]{1,10}$/u.test(extension) ? extension : '.bin';
}

function canonicalHttpUrl(input: string, baseUrl?: string): string | undefined {
  try {
    const url = baseUrl === undefined ? new URL(input) : new URL(input, baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return undefined;
    }
    url.hash = '';
    return url.href;
  } catch {
    return undefined;
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'AbortError') {
    return 'request timed out';
  }
  return error instanceof Error ? error.message : String(error);
}

async function fetchAsset(
  asset: Asset,
  fetcher: AssetFetcher,
  maxAssetBytes: number,
  timeoutMs: number,
  maxRetries: number | undefined,
): Promise<FetchResult> {
  const url = new URL(asset.sourceUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`unsupported URL protocol: ${url.protocol}`);
  }
  const response = await fetchWithRetry(
    asset.sourceUrl,
    {
      headers: {
        Accept: '*/*',
        'User-Agent': 'SiteRescue/0.1',
      },
      redirect: 'follow',
    },
    { fetcher, maxRetries, timeoutMs },
  );
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const finalUrl = canonicalHttpUrl(response.url === '' ? asset.sourceUrl : response.url);
  if (finalUrl === undefined) {
    throw new Error('asset redirected to an unsupported URL');
  }
  return {
    bytes: await readResponseBytes(response, { label: 'asset', maxBytes: maxAssetBytes }),
    mediaType: normalizeMediaType(response.headers.get('content-type')) ?? asset.mediaType,
    finalUrl,
  };
}

function resolveAssetTarget(outputDirectory: string, localPath: string): string {
  const absoluteOutput = resolve(outputDirectory);
  const assetDirectory = resolve(absoluteOutput, 'assets');
  const target = resolve(absoluteOutput, ...localPath.split('/'));
  if (target !== assetDirectory && !target.startsWith(`${assetDirectory}${sep}`)) {
    throw new Error(`Unsafe asset path: ${localPath}`);
  }
  return target;
}

async function writeAssetAtomically(
  outputDirectory: string,
  localPath: string,
  bytes: Uint8Array,
  expectedChecksum: string,
): Promise<void> {
  const target = resolveAssetTarget(outputDirectory, localPath);
  await mkdir(dirname(target), { recursive: true });
  try {
    const existing = await readFile(target);
    if (checksum(existing) === expectedChecksum) {
      return;
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      throw error;
    }
  }

  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, bytes);
    await rm(target, { force: true });
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

function isCssAsset(asset: Asset, mediaType: string | undefined): boolean {
  return (
    asset.role === 'stylesheet' ||
    mediaType === 'text/css' ||
    extname(new URL(asset.sourceUrl).pathname).toLowerCase() === '.css'
  );
}

function dependencyId(sourceUrl: string, existingIds: Set<string>): string {
  const prefix = `asset-dependency-${checksum(sourceUrl).slice(0, 16)}`;
  let id = prefix;
  let suffix = 2;
  while (existingIds.has(id)) {
    id = `${prefix}-${suffix}`;
    suffix += 1;
  }
  existingIds.add(id);
  return id;
}

function warning(code: string, message: string, sourceUrl: string): MigrationWarning {
  return { code, message, sourceUrl };
}

function rewriteBlock(block: ContentBlock, localPaths: ReadonlyMap<string, string>): ContentBlock {
  const localPath = (value: string): string =>
    localPaths.get(value) ?? localPaths.get(canonicalHttpUrl(value) ?? '') ?? value;
  if (block.type === 'image') {
    return { ...block, src: localPath(block.src) };
  }
  if (block.type === 'gallery') {
    return {
      ...block,
      images: block.images.map((image) => ({ ...image, src: localPath(image.src) })),
    };
  }
  if (block.type === 'video') {
    return {
      ...block,
      src: localPath(block.src),
      ...(block.poster === undefined ? {} : { poster: localPath(block.poster) }),
    };
  }
  if (block.type === 'columns') {
    return {
      ...block,
      columns: block.columns.map((column) =>
        column.map((child) => rewriteBlock(child, localPaths)),
      ),
    };
  }
  return block;
}

function rewritePages(pages: Page[], localPaths: ReadonlyMap<string, string>): Page[] {
  return pages.map((page) => ({
    ...page,
    blocks: page.blocks.map((block) => rewriteBlock(block, localPaths)),
  }));
}

function validateOptions(options: DownloadSiteAssetsOptions): {
  maxAssetBytes: number;
  timeoutMs: number;
  maxRetries: number | undefined;
  maxCssDepth: number;
  maxCssDependencies: number;
} {
  const values = {
    maxAssetBytes: options.maxAssetBytes ?? DEFAULT_MAX_ASSET_BYTES,
    timeoutMs: options.timeoutMs ?? DEFAULT_ASSET_TIMEOUT_MS,
    maxRetries: options.maxRetries,
    maxCssDepth: options.maxCssDepth ?? DEFAULT_MAX_CSS_DEPTH,
    maxCssDependencies: options.maxCssDependencies ?? DEFAULT_MAX_CSS_DEPENDENCIES,
  };
  if (!Number.isInteger(values.maxAssetBytes) || values.maxAssetBytes < 1) {
    throw new Error('maxAssetBytes must be a positive integer.');
  }
  if (!Number.isInteger(values.timeoutMs) || values.timeoutMs < 1) {
    throw new Error('timeoutMs must be a positive integer.');
  }
  if (
    values.maxRetries !== undefined &&
    (!Number.isInteger(values.maxRetries) || values.maxRetries < 0)
  ) {
    throw new Error('maxRetries must be a non-negative integer.');
  }
  if (!Number.isInteger(values.maxCssDepth) || values.maxCssDepth < 0) {
    throw new Error('maxCssDepth must be a non-negative integer.');
  }
  if (!Number.isInteger(values.maxCssDependencies) || values.maxCssDependencies < 0) {
    throw new Error('maxCssDependencies must be a non-negative integer.');
  }
  return values;
}

export async function downloadSiteAssets(
  site: Site,
  options: DownloadSiteAssetsOptions,
): Promise<DownloadSiteAssetsResult> {
  const fetcher = options.fetcher ?? fetch;
  const limits = validateOptions(options);
  const warnings = [...site.warnings];
  const allAssets = [...site.assets];
  const queue: QueueItem[] = site.assets.map((asset) => ({ asset, cssDepth: 0 }));
  const existingIds = new Set(site.assets.map((asset) => asset.id));
  const assetsByUrl = new Map<string, Asset>();
  for (const asset of site.assets) {
    const canonical = canonicalHttpUrl(asset.sourceUrl);
    if (canonical !== undefined && !assetsByUrl.has(canonical)) {
      assetsByUrl.set(canonical, asset);
    }
  }

  const records: FetchedRecord[] = [];
  const recordsByAsset = new Map<Asset, FetchedRecord>();
  const limitedReferences = new Set<string>();
  let failedAssetCount = 0;
  let discoveredCssDependencyCount = 0;

  for (let index = 0; index < queue.length; index += 1) {
    const item = queue[index]!;
    try {
      const fetched = await fetchAsset(
        item.asset,
        fetcher,
        limits.maxAssetBytes,
        limits.timeoutMs,
        limits.maxRetries,
      );
      const record: FetchedRecord = { ...item, ...fetched, cssParseFailed: false };
      records.push(record);
      recordsByAsset.set(item.asset, record);

      if (!isCssAsset(item.asset, fetched.mediaType)) {
        continue;
      }

      let references: CssReference[];
      try {
        references = collectCssReferences(new TextDecoder().decode(fetched.bytes));
      } catch (error) {
        record.cssParseFailed = true;
        warnings.push(
          warning(
            'css-parse-failed',
            `Could not parse stylesheet: ${errorMessage(error)}`,
            item.asset.sourceUrl,
          ),
        );
        continue;
      }

      for (const reference of references) {
        const sourceUrl = canonicalHttpUrl(reference.value, fetched.finalUrl);
        if (sourceUrl === undefined || assetsByUrl.has(sourceUrl)) {
          continue;
        }
        if (reference.kind === 'import' && item.cssDepth >= limits.maxCssDepth) {
          if (!limitedReferences.has(sourceUrl)) {
            warnings.push(
              warning(
                'css-depth-limit-reached',
                `Skipped stylesheet import beyond depth ${limits.maxCssDepth}.`,
                sourceUrl,
              ),
            );
            limitedReferences.add(sourceUrl);
          }
          continue;
        }
        if (discoveredCssDependencyCount >= limits.maxCssDependencies) {
          if (!limitedReferences.has(sourceUrl)) {
            warnings.push(
              warning(
                'css-dependency-limit-reached',
                `Skipped CSS dependency beyond the ${limits.maxCssDependencies}-asset limit.`,
                sourceUrl,
              ),
            );
            limitedReferences.add(sourceUrl);
          }
          continue;
        }

        const dependency: Asset = {
          id: dependencyId(sourceUrl, existingIds),
          sourceUrl,
          role: 'dependency',
          ...(reference.kind === 'import'
            ? { mediaType: 'text/css' }
            : inferMediaType(sourceUrl) === undefined
              ? {}
              : { mediaType: inferMediaType(sourceUrl) }),
        };
        assetsByUrl.set(sourceUrl, dependency);
        allAssets.push(dependency);
        queue.push({ asset: dependency, cssDepth: item.cssDepth + 1 });
        discoveredCssDependencyCount += 1;
      }
    } catch (error) {
      warnings.push(
        warning(
          'asset-download-failed',
          `Could not download asset: ${errorMessage(error)}`,
          item.asset.sourceUrl,
        ),
      );
      failedAssetCount += 1;
    }
  }

  const localPaths = new Map<string, string>();
  const pathsByContentKey = new Map<string, string>();
  const plannedPaths = new Set<string>();
  let deduplicatedAssetCount = 0;
  let cssFileCount = 0;

  for (const record of records) {
    if (isCssAsset(record.asset, record.mediaType)) {
      record.localPath = posix.join(
        'assets',
        'css',
        `${checksum(canonicalHttpUrl(record.asset.sourceUrl) ?? record.asset.sourceUrl)}.css`,
      );
      cssFileCount += 1;
    } else {
      const rawChecksum = checksum(record.bytes);
      const extension = extensionFor(record.asset, record.mediaType);
      const contentKey = `${rawChecksum}:${extension}`;
      const existingPath = pathsByContentKey.get(contentKey);
      record.localPath = existingPath ?? posix.join('assets', `${rawChecksum}${extension}`);
      record.checksum = rawChecksum;
      if (existingPath === undefined) {
        pathsByContentKey.set(contentKey, record.localPath);
      } else {
        deduplicatedAssetCount += 1;
      }
    }
    plannedPaths.add(record.localPath);
    localPaths.set(record.asset.sourceUrl, record.localPath);
    const canonicalSource = canonicalHttpUrl(record.asset.sourceUrl);
    if (canonicalSource !== undefined) {
      localPaths.set(canonicalSource, record.localPath);
    }
    localPaths.set(record.finalUrl, record.localPath);
  }

  let rewrittenCssReferenceCount = 0;
  for (const record of records) {
    if (record.localPath === undefined) {
      continue;
    }
    let bytes = record.bytes;
    if (isCssAsset(record.asset, record.mediaType) && !record.cssParseFailed) {
      const transformed = rewriteCssReferences(
        new TextDecoder().decode(record.bytes),
        (reference) => {
          const sourceUrl = canonicalHttpUrl(reference.value, record.finalUrl);
          if (sourceUrl === undefined) {
            return undefined;
          }
          const targetPath = localPaths.get(sourceUrl);
          return targetPath === undefined
            ? sourceUrl
            : posix.relative(posix.dirname(record.localPath!), targetPath);
        },
      );
      bytes = new TextEncoder().encode(transformed.css);
      rewrittenCssReferenceCount += transformed.rewrittenReferenceCount;
    }
    record.checksum = checksum(bytes);
    await writeAssetAtomically(
      options.outputDirectory,
      record.localPath,
      bytes,
      record.checksum,
    );
  }

  const updatedAssets = allAssets.map((asset) => {
    const record = recordsByAsset.get(asset);
    return record?.localPath === undefined || record.checksum === undefined
      ? asset
      : {
          ...asset,
          localPath: record.localPath,
          checksum: record.checksum,
          ...(record.mediaType === undefined ? {} : { mediaType: record.mediaType }),
        };
  });

  return {
    site: parseSite({
      ...site,
      pages: rewritePages(site.pages, localPaths),
      assets: updatedAssets,
      warnings,
    }),
    downloadedAssetCount: records.length,
    storedFileCount: plannedPaths.size,
    deduplicatedAssetCount,
    failedAssetCount,
    cssFileCount,
    discoveredCssDependencyCount,
    rewrittenCssReferenceCount,
  };
}
