import { detectWeebly } from '@site-rescue/adapter-weebly';
import {
  crawlSameOrigin,
  DEFAULT_MAX_PAGES,
  fetchHtmlDocument,
  normalizeStartUrl,
  type Fetcher,
} from '@site-rescue/crawler';

export interface DiagnoseOptions {
  maxPages?: number;
  fetcher?: Fetcher;
  writeLine?: (line: string) => void;
}

function displayPath(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

export async function runDiagnose(inputUrl: string, options: DiagnoseOptions = {}): Promise<void> {
  const writeLine = options.writeLine ?? console.log;
  const url = normalizeStartUrl(inputUrl);
  const initialDocument = await fetchHtmlDocument(url, { fetcher: options.fetcher });
  const detection = detectWeebly({ url: initialDocument.url, html: initialDocument.html });
  const crawl = await crawlSameOrigin(initialDocument.url, {
    fetcher: options.fetcher,
    initialDocument,
    maxPages: options.maxPages ?? DEFAULT_MAX_PAGES,
  });

  writeLine('Site Rescue diagnosis');
  writeLine(`URL: ${crawl.startUrl}`);
  writeLine(
    detection.detected
      ? `Platform: Weebly (${Math.round(detection.confidence * 100)}% confidence)`
      : 'Platform: Unknown',
  );

  for (const item of detection.evidence) {
    writeLine(`  evidence: ${item.signal}`);
  }

  writeLine(`Discovered pages (${crawl.discoveredUrls.length}):`);
  for (const discoveredUrl of crawl.discoveredUrls) {
    writeLine(`  - ${displayPath(discoveredUrl)}`);
  }

  if (crawl.warnings.length > 0) {
    writeLine(`Warnings (${crawl.warnings.length}):`);
    for (const warning of crawl.warnings) {
      writeLine(`  - ${displayPath(warning.url)}: ${warning.message}`);
    }
  }
  if (crawl.truncated) {
    writeLine('Warning: crawl stopped at the page limit; more pages remain queued.');
  }
}

