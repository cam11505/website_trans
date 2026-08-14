import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { detectWeebly, normalizeWeeblySite } from '@site-rescue/adapter-weebly';
import {
  crawlSameOrigin,
  DEFAULT_MAX_PAGES,
  fetchHtmlDocument,
  normalizeStartUrl,
  type Fetcher,
} from '@site-rescue/crawler';

export interface CaptureOptions {
  outputDirectory: string;
  maxPages?: number;
  fetcher?: Fetcher;
  capturedAt?: string;
  writeLine?: (line: string) => void;
}

export interface CaptureResult {
  outputFile: string;
  pageCount: number;
  assetCount: number;
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
  const detection = detectWeebly({ url: initialDocument.url, html: initialDocument.html });
  if (!detection.detected) {
    throw new Error('Capture currently supports Weebly sites only.');
  }

  const crawl = await crawlSameOrigin(initialDocument.url, {
    fetcher: options.fetcher,
    initialDocument,
    maxPages: options.maxPages ?? DEFAULT_MAX_PAGES,
  });
  const site = normalizeWeeblySite({
    baseUrl: crawl.startUrl,
    capturedAt: options.capturedAt,
    pages: crawl.pages.map((page) => ({
      url: page.url,
      html: page.html,
      title: page.title,
    })),
    warnings: crawl.warnings,
  });
  const outputFile = await writeJsonAtomically(options.outputDirectory, site);

  writeLine('Site Rescue capture complete');
  writeLine(`Platform: Weebly (${Math.round(detection.confidence * 100)}% confidence)`);
  writeLine(`Pages: ${site.pages.length}`);
  writeLine(`Assets in manifest: ${site.assets.length}`);
  writeLine(`Warnings: ${site.warnings.length}`);
  writeLine(`Output: ${outputFile}`);

  return {
    outputFile,
    pageCount: site.pages.length,
    assetCount: site.assets.length,
    warningCount: site.warnings.length,
  };
}
