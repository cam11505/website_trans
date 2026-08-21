import {
  parseSite,
  type MigrationWarning,
  type Site,
} from '@site-rescue/content-schema';
import { posix } from 'node:path';

type Redirect = Site['redirects'][number];

export interface RedirectEvidence {
  fromUrl: string;
  toUrl: string;
}

export interface ApplyRedirectEvidenceResult {
  site: Site;
  addedRedirectCount: number;
  warningCount: number;
}

function canonicalHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return undefined;
    }
    url.hash = '';
    return url.href;
  } catch {
    return undefined;
  }
}

function redirectWarning(
  code: string,
  message: string,
  sourceUrl?: string,
): MigrationWarning {
  return {
    code,
    message,
    ...(sourceUrl === undefined ? {} : { sourceUrl }),
  };
}

function routeOutputKey(sitePath: string): string | undefined {
  if (!sitePath.startsWith('/') || sitePath.startsWith('//') || sitePath.includes('\\')) {
    return undefined;
  }
  const segments = sitePath.split('/').filter((segment) => segment !== '');
  for (const segment of segments) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return undefined;
    }
    if (
      decoded === '.' ||
      decoded === '..' ||
      decoded.includes('/') ||
      decoded.includes('\\') ||
      decoded.includes('\0')
    ) {
      return undefined;
    }
  }
  if (segments.length === 0) {
    return 'index.html';
  }
  const file =
    sitePath.endsWith('/') || posix.extname(segments.at(-1) ?? '') === ''
      ? posix.join(...segments, 'index.html')
      : posix.join(...segments);
  return file.toLowerCase();
}

export function applyRedirectEvidence(
  input: Site,
  evidence: readonly RedirectEvidence[],
): ApplyRedirectEvidenceResult {
  const site = parseSite(input);
  const origin = new URL(site.source.baseUrl).origin;
  const targetPathsBySourceUrl = new Map(
    site.pages.flatMap((page) => {
      const sourceUrl = canonicalHttpUrl(page.sourceUrl);
      return sourceUrl === undefined ? [] : [[sourceUrl, page.targetPath] as const];
    }),
  );
  const pageOutputFiles = new Set(
    site.pages.flatMap((page) => {
      const outputFile = routeOutputKey(page.targetPath);
      return outputFile === undefined ? [] : [outputFile];
    }),
  );
  const redirects: Redirect[] = [...site.redirects];
  const redirectsBySource = new Map(redirects.map((redirect) => [redirect.from, redirect]));
  const redirectOutputFiles = new Set(
    redirects.flatMap((redirect) => {
      const outputFile = routeOutputKey(redirect.from);
      return outputFile === undefined ? [] : [outputFile];
    }),
  );
  const warnings: MigrationWarning[] = [];
  let addedRedirectCount = 0;

  for (const item of evidence) {
    const fromUrl = canonicalHttpUrl(item.fromUrl);
    const toUrl = canonicalHttpUrl(item.toUrl);
    if (fromUrl === undefined || toUrl === undefined) {
      warnings.push(
        redirectWarning(
          'redirect-invalid-url',
          'Skipped redirect evidence containing an invalid HTTP(S) URL.',
          fromUrl,
        ),
      );
      continue;
    }
    const from = new URL(fromUrl);
    const to = new URL(toUrl);
    if (from.origin !== origin || to.origin !== origin) {
      warnings.push(
        redirectWarning(
          'redirect-cross-origin-skipped',
          'Skipped redirect evidence that crosses the captured site origin.',
          fromUrl,
        ),
      );
      continue;
    }
    if (from.search !== '' || to.search !== '') {
      warnings.push(
        redirectWarning(
          'redirect-query-unsupported',
          'Skipped redirect evidence with a query string; conditional query redirects require manual review.',
          fromUrl,
        ),
      );
      continue;
    }
    const targetPath = targetPathsBySourceUrl.get(toUrl);
    if (targetPath === undefined) {
      warnings.push(
        redirectWarning(
          'redirect-target-missing',
          'Skipped redirect evidence whose final page is not present in the normalized capture.',
          fromUrl,
        ),
      );
      continue;
    }
    const fromPath = from.pathname;
    if (fromPath === targetPath) {
      continue;
    }
    const outputFile = routeOutputKey(fromPath);
    if (outputFile === undefined) {
      warnings.push(
        redirectWarning(
          'redirect-source-invalid',
          'Skipped redirect because its source path cannot be represented safely as a static file.',
          fromUrl,
        ),
      );
      continue;
    }
    if (pageOutputFiles.has(outputFile)) {
      warnings.push(
        redirectWarning(
          'redirect-source-conflict',
          'Skipped redirect because its source path is already used by a normalized page.',
          fromUrl,
        ),
      );
      continue;
    }
    if (redirectOutputFiles.has(outputFile) && !redirectsBySource.has(fromPath)) {
      warnings.push(
        redirectWarning(
          'redirect-source-conflict',
          'Skipped redirect because its source path collides with another redirect output.',
          fromUrl,
        ),
      );
      continue;
    }
    const existing = redirectsBySource.get(fromPath);
    if (existing !== undefined) {
      if (existing.to !== targetPath) {
        warnings.push(
          redirectWarning(
            'redirect-target-conflict',
            `Skipped redirect because ${fromPath} is already mapped to ${existing.to}.`,
            fromUrl,
          ),
        );
      }
      continue;
    }
    const redirect = { from: fromPath, to: targetPath, status: 301 } as const;
    redirects.push(redirect);
    redirectsBySource.set(fromPath, redirect);
    redirectOutputFiles.add(outputFile);
    addedRedirectCount += 1;
  }

  return {
    site: parseSite({
      ...site,
      redirects,
      warnings: [...site.warnings, ...warnings],
    }),
    addedRedirectCount,
    warningCount: warnings.length,
  };
}
