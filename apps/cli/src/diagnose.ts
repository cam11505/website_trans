import { selectSourceAdapter, type SourceAdapter } from '@site-rescue/core';
import {
  crawlSameOrigin,
  DEFAULT_MAX_PAGES,
  fetchHtmlDocument,
  normalizeStartUrl,
  type Fetcher,
} from '@site-rescue/crawler';
import { DEFAULT_SOURCE_ADAPTERS } from './adapters.js';

export interface DiagnoseOptions {
  maxPages?: number;
  fetcher?: Fetcher;
  adapters?: readonly SourceAdapter[];
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
  const selection = selectSourceAdapter(
    { url: initialDocument.url, html: initialDocument.html },
    options.adapters ?? DEFAULT_SOURCE_ADAPTERS,
  );
  const crawl = await crawlSameOrigin(url, {
    fetcher: options.fetcher,
    initialDocument,
    maxPages: options.maxPages ?? DEFAULT_MAX_PAGES,
  });

  writeLine('Site Rescue diagnosis');
  writeLine(`URL: ${crawl.startUrl}`);
  writeLine(
    selection === undefined
      ? 'Platform: Unknown'
      : `Platform: ${selection.adapter.displayName} (${Math.round(selection.detection.confidence * 100)}% confidence)`,
  );

  for (const item of selection?.detection.evidence ?? []) {
    writeLine(`  evidence: ${item.signal}`);
  }

  writeLine(`Discovered pages (${crawl.pages.length}):`);
  for (const page of crawl.pages) {
    writeLine(`  - ${displayPath(page.url)}`);
  }

  if (crawl.redirects.length > 0) {
    writeLine(`Discovered redirects (${crawl.redirects.length}):`);
    for (const redirect of crawl.redirects) {
      writeLine(`  - ${displayPath(redirect.fromUrl)} -> ${displayPath(redirect.toUrl)}`);
    }
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
