import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseSite } from '@site-rescue/content-schema';
import { selectSourceAdapter, type SourceAdapter } from '@site-rescue/core';
import {
  downloadSiteAssets,
  type AssetFetcher,
} from '@site-rescue/asset-pipeline';
import {
  crawlSameOrigin,
  DEFAULT_MAX_PAGES,
  fetchHtmlDocument,
  normalizeStartUrl,
  type Fetcher,
} from '@site-rescue/crawler';
import { applyRedirectEvidence } from '@site-rescue/redirects';
import { withFreshOutputDirectory } from '@site-rescue/output-safety';
import { DEFAULT_SOURCE_ADAPTERS } from './adapters.js';

export interface CaptureOptions {
  outputDirectory: string;
  maxPages?: number;
  maxRetries?: number;
  requestTimeoutMs?: number;
  maxHtmlBytes?: number;
  fetcher?: Fetcher;
  assetFetcher?: AssetFetcher;
  adapters?: readonly SourceAdapter[];
  downloadAssets?: boolean;
  maxAssetBytes?: number;
  maxCssDepth?: number;
  maxCssDependencies?: number;
  capturedAt?: string;
  writeLine?: (line: string) => void;
}

export interface CaptureResult {
  outputFile: string;
  pageCount: number;
  assetCount: number;
  downloadedAssetCount: number;
  storedFileCount: number;
  deduplicatedAssetCount: number;
  failedAssetCount: number;
  cssFileCount: number;
  discoveredCssDependencyCount: number;
  rewrittenCssReferenceCount: number;
  warningCount: number;
  redirectCount: number;
}

async function writeJsonAtomically(outputDirectory: string, value: unknown): Promise<string> {
  const absoluteDirectory = resolve(outputDirectory);
  await mkdir(absoluteDirectory, { recursive: true });
  const outputFile = resolve(absoluteDirectory, 'site.json');
  const temporaryFile = resolve(absoluteDirectory, `.site.json.${randomUUID()}.tmp`);

  try {
    await writeFile(temporaryFile, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(temporaryFile, outputFile);
  } catch (error) {
    await rm(temporaryFile, { force: true });
    throw error;
  }
  return outputFile;
}

export async function runCapture(inputUrl: string, options: CaptureOptions): Promise<CaptureResult> {
  return withFreshOutputDirectory(options.outputDirectory, async (outputDirectory) =>
    runCaptureInDirectory(inputUrl, { ...options, outputDirectory }),
  );
}

async function runCaptureInDirectory(
  inputUrl: string,
  options: CaptureOptions,
): Promise<CaptureResult> {
  const writeLine = options.writeLine ?? console.log;
  const url = normalizeStartUrl(inputUrl);
  const initialDocument = await fetchHtmlDocument(url, {
    fetcher: options.fetcher,
    maxHtmlBytes: options.maxHtmlBytes,
    maxRetries: options.maxRetries,
    timeoutMs: options.requestTimeoutMs,
  });
  const selection = selectSourceAdapter(
    { url: initialDocument.url, html: initialDocument.html },
    options.adapters ?? DEFAULT_SOURCE_ADAPTERS,
  );
  if (selection === undefined) {
    throw new Error('No supported source adapter detected this website.');
  }

  const crawl = await crawlSameOrigin(url, {
    fetcher: options.fetcher,
    initialDocument,
    maxHtmlBytes: options.maxHtmlBytes,
    maxPages: options.maxPages ?? DEFAULT_MAX_PAGES,
    maxRetries: options.maxRetries,
    timeoutMs: options.requestTimeoutMs,
  });
  let site = parseSite(
    selection.adapter.normalize({
      baseUrl: crawl.startUrl,
      capturedAt: options.capturedAt,
      pages: crawl.pages.map((page) => ({
        url: page.url,
        html: page.html,
        title: page.title,
      })),
      warnings: crawl.warnings,
    }),
  );
  const redirectResult = applyRedirectEvidence(site, crawl.redirects);
  site = redirectResult.site;
  let downloadedAssetCount = 0;
  let storedFileCount = 0;
  let deduplicatedAssetCount = 0;
  let failedAssetCount = 0;
  let cssFileCount = 0;
  let discoveredCssDependencyCount = 0;
  let rewrittenCssReferenceCount = 0;
  if (options.downloadAssets !== false) {
    const assetResult = await downloadSiteAssets(site, {
      fetcher: options.assetFetcher ?? options.fetcher,
      maxAssetBytes: options.maxAssetBytes,
      maxRetries: options.maxRetries,
      maxCssDepth: options.maxCssDepth,
      maxCssDependencies: options.maxCssDependencies,
      outputDirectory: options.outputDirectory,
      timeoutMs: options.requestTimeoutMs,
    });
    site = assetResult.site;
    downloadedAssetCount = assetResult.downloadedAssetCount;
    storedFileCount = assetResult.storedFileCount;
    deduplicatedAssetCount = assetResult.deduplicatedAssetCount;
    failedAssetCount = assetResult.failedAssetCount;
    cssFileCount = assetResult.cssFileCount;
    discoveredCssDependencyCount = assetResult.discoveredCssDependencyCount;
    rewrittenCssReferenceCount = assetResult.rewrittenCssReferenceCount;
  }
  const outputFile = await writeJsonAtomically(options.outputDirectory, site);

  writeLine('Site Rescue capture complete');
  writeLine(
    `Platform: ${selection.adapter.displayName} (${Math.round(selection.detection.confidence * 100)}% confidence)`,
  );
  writeLine(`Pages: ${site.pages.length}`);
  writeLine(`Assets in manifest: ${site.assets.length}`);
  writeLine(`Assets downloaded: ${downloadedAssetCount}`);
  writeLine(`Asset files stored: ${storedFileCount}`);
  writeLine(`Asset downloads failed: ${failedAssetCount}`);
  writeLine(`CSS files processed: ${cssFileCount}`);
  writeLine(`CSS dependencies discovered: ${discoveredCssDependencyCount}`);
  writeLine(`CSS references rewritten: ${rewrittenCssReferenceCount}`);
  writeLine(`Warnings: ${site.warnings.length}`);
  writeLine(`Redirects preserved: ${site.redirects.length}`);
  writeLine(`Output: ${outputFile}`);

  return {
    outputFile,
    pageCount: site.pages.length,
    assetCount: site.assets.length,
    downloadedAssetCount,
    storedFileCount,
    deduplicatedAssetCount,
    failedAssetCount,
    cssFileCount,
    discoveredCssDependencyCount,
    rewrittenCssReferenceCount,
    warningCount: site.warnings.length,
    redirectCount: site.redirects.length,
  };
}
