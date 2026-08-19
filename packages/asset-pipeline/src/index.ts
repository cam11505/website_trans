import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { posix } from 'node:path';
import {
  parseSite,
  type Asset,
  type ContentBlock,
  type Page,
  type Site,
} from '@site-rescue/content-schema';

export const DEFAULT_MAX_ASSET_BYTES = 50 * 1024 * 1024;
export const DEFAULT_ASSET_TIMEOUT_MS = 30_000;

export type AssetFetcher = (input: string, init?: RequestInit) => Promise<Response>;

export interface DownloadSiteAssetsOptions {
  outputDirectory: string;
  fetcher?: AssetFetcher;
  maxAssetBytes?: number;
  timeoutMs?: number;
}

export interface DownloadSiteAssetsResult {
  site: Site;
  downloadedAssetCount: number;
  storedFileCount: number;
  deduplicatedAssetCount: number;
  failedAssetCount: number;
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

function checksum(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function normalizeMediaType(value: string | null | undefined): string | undefined {
  const mediaType = value?.split(';', 1)[0]?.trim().toLowerCase();
  return mediaType === undefined || mediaType === '' ? undefined : mediaType;
}

function extensionFor(asset: Asset, mediaType: string | undefined): string {
  if (mediaType !== undefined && EXTENSION_BY_MEDIA_TYPE[mediaType] !== undefined) {
    return EXTENSION_BY_MEDIA_TYPE[mediaType];
  }
  const extension = extname(new URL(asset.sourceUrl).pathname).toLowerCase();
  return /^\.[a-z0-9]{1,10}$/u.test(extension) ? extension : '.bin';
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
): Promise<{ bytes: Uint8Array; mediaType?: string }> {
  const url = new URL(asset.sourceUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`unsupported URL protocol: ${url.protocol}`);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(asset.sourceUrl, {
      headers: {
        Accept: '*/*',
        'User-Agent': 'SiteRescue/0.1',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > maxAssetBytes) {
      throw new Error(`asset exceeds the ${maxAssetBytes}-byte limit`);
    }
    const bytes = await readResponseBody(response, maxAssetBytes);
    return {
      bytes,
      mediaType: normalizeMediaType(response.headers.get('content-type')) ?? asset.mediaType,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function readResponseBody(response: Response, maxAssetBytes: number): Promise<Uint8Array> {
  if (response.body === null) {
    return new Uint8Array();
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      byteLength += value.byteLength;
      if (byteLength > maxAssetBytes) {
        await reader.cancel();
        throw new Error(`asset exceeds the ${maxAssetBytes}-byte limit`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
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
): Promise<boolean> {
  const target = resolveAssetTarget(outputDirectory, localPath);
  await mkdir(resolve(outputDirectory, 'assets'), { recursive: true });
  try {
    const existing = await readFile(target);
    if (checksum(existing) === expectedChecksum) {
      return false;
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
  return true;
}

function rewriteBlock(block: ContentBlock, localPaths: ReadonlyMap<string, string>): ContentBlock {
  if (block.type === 'image') {
    return { ...block, src: localPaths.get(block.src) ?? block.src };
  }
  if (block.type === 'gallery') {
    return {
      ...block,
      images: block.images.map((image) => ({
        ...image,
        src: localPaths.get(image.src) ?? image.src,
      })),
    };
  }
  if (block.type === 'video') {
    return {
      ...block,
      src: localPaths.get(block.src) ?? block.src,
      ...(block.poster === undefined
        ? {}
        : { poster: localPaths.get(block.poster) ?? block.poster }),
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

export async function downloadSiteAssets(
  site: Site,
  options: DownloadSiteAssetsOptions,
): Promise<DownloadSiteAssetsResult> {
  const fetcher = options.fetcher ?? fetch;
  const maxAssetBytes = options.maxAssetBytes ?? DEFAULT_MAX_ASSET_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_ASSET_TIMEOUT_MS;
  if (!Number.isInteger(maxAssetBytes) || maxAssetBytes < 1) {
    throw new Error('maxAssetBytes must be a positive integer.');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error('timeoutMs must be a positive integer.');
  }

  const localPaths = new Map<string, string>();
  const pathsByContentKey = new Map<string, string>();
  const updatedAssets: Asset[] = [];
  const warnings = [...site.warnings];
  let downloadedAssetCount = 0;
  let storedFileCount = 0;
  let deduplicatedAssetCount = 0;
  let failedAssetCount = 0;

  for (const asset of site.assets) {
    try {
      const fetched = await fetchAsset(asset, fetcher, maxAssetBytes, timeoutMs);
      const assetChecksum = checksum(fetched.bytes);
      const extension = extensionFor(asset, fetched.mediaType);
      const contentKey = `${assetChecksum}:${extension}`;
      const existingPath = pathsByContentKey.get(contentKey);
      const localPath =
        existingPath ?? posix.join('assets', `${assetChecksum}${extension}`);

      if (existingPath === undefined) {
        await writeAssetAtomically(
          options.outputDirectory,
          localPath,
          fetched.bytes,
          assetChecksum,
        );
        pathsByContentKey.set(contentKey, localPath);
        storedFileCount += 1;
      } else {
        deduplicatedAssetCount += 1;
      }

      localPaths.set(asset.sourceUrl, localPath);
      updatedAssets.push({
        ...asset,
        localPath,
        checksum: assetChecksum,
        ...(fetched.mediaType === undefined ? {} : { mediaType: fetched.mediaType }),
      });
      downloadedAssetCount += 1;
    } catch (error) {
      updatedAssets.push(asset);
      warnings.push({
        code: 'asset-download-failed',
        message: `Could not download asset: ${errorMessage(error)}`,
        sourceUrl: asset.sourceUrl,
      });
      failedAssetCount += 1;
    }
  }

  return {
    site: parseSite({
      ...site,
      pages: rewritePages(site.pages, localPaths),
      assets: updatedAssets,
      warnings,
    }),
    downloadedAssetCount,
    storedFileCount,
    deduplicatedAssetCount,
    failedAssetCount,
  };
}
