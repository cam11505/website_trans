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
import { DEFAULT_SOURCE_ADAPTERS } from './adapters.js';

export interface CaptureOptions {
  outputDirectory: string;
  maxPages?: number;
  fetcher?: Fetcher;
  assetFetcher?: AssetFetcher;
  adapters?: readonly SourceAdapter[];
  downloadAssets?: boolean;
  maxAssetBytes?: number;
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
  warningCount: number;
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
  const writeLine = options.writeLine ?? console.log;
  const url = normalizeStartUrl(inputUrl);
  const initialDocument = await fetchHtmlDocument(url, { fetcher: options.fetcher });
  const selection = selectSourceAdapter(
    { url: initialDocument.url, html: initialDocument.html },
    options.adapters ?? DEFAULT_SOURCE_ADAPTERS,
  );
  if (selection === undefined) {
    throw new Error('No supported source adapter detected this website.');
  }

  const crawl = await crawlSameOrigin(initialDocument.url, {
    fetcher: options.fetcher,
    initialDocument,
    maxPages: options.maxPages ?? DEFAULT_MAX_PAGES,
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
  let downloadedAssetCount = 0;
  let storedFileCount = 0;
  let deduplicatedAssetCount = 0;
  let failedAssetCount = 0;
  if (options.downloadAssets !== false) {
    const assetResult = await downloadSiteAssets(site, {
      fetcher: options.assetFetcher ?? options.fetcher,
      maxAssetBytes: options.maxAssetBytes,
      outputDirectory: options.outputDirectory,
    });
    site = assetResult.site;
    downloadedAssetCount = assetResult.downloadedAssetCount;
    storedFileCount = assetResult.storedFileCount;
    deduplicatedAssetCount = assetResult.deduplicatedAssetCount;
    failedAssetCount = assetResult.failedAssetCount;
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
  writeLine(`Warnings: ${site.warnings.length}`);
  writeLine(`Output: ${outputFile}`);

  return {
    outputFile,
    pageCount: site.pages.length,
    assetCount: site.assets.length,
    downloadedAssetCount,
    storedFileCount,
    deduplicatedAssetCount,
    failedAssetCount,
    warningCount: site.warnings.length,
  };
}
