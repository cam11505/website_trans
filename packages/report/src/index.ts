import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  parseSite,
  type ContentBlock,
  type MigrationWarning,
  type Page,
  type Site,
} from '@site-rescue/content-schema';

export const CURRENT_REPORT_VERSION = '1.0.0' as const;

export interface PageReport {
  id: string;
  title: string;
  sourceUrl: string;
  targetPath: string;
  blockCount: number;
  reviewItemCount: number;
}

export interface MigrationReviewItem {
  code:
    | 'embed-review-required'
    | 'raw-html-review-required'
    | 'remote-asset'
    | 'unverified-local-asset';
  message: string;
  sourceUrl: string;
  pageId?: string;
}

export interface MigrationReport {
  reportVersion: typeof CURRENT_REPORT_VERSION;
  source: Site['source'];
  siteTitle: string;
  readiness: 'ready' | 'review-required';
  summary: {
    pageCount: number;
    blockCount: number;
    assetCount: number;
    localAssetCount: number;
    verifiedLocalAssetCount: number;
    unverifiedLocalAssetCount: number;
    remoteAssetCount: number;
    warningCount: number;
    reviewItemCount: number;
  };
  pages: PageReport[];
  warningCounts: Record<string, number>;
  warnings: MigrationWarning[];
  reviewItems: MigrationReviewItem[];
}

export interface WriteMigrationReportOptions {
  outputDirectory: string;
}

export interface WriteMigrationReportResult {
  outputDirectory: string;
  jsonFile: string;
  markdownFile: string;
  report: MigrationReport;
}

interface PageAnalysis {
  blockCount: number;
  reviewItems: MigrationReviewItem[];
}

function analyzeBlock(block: ContentBlock, page: Page): PageAnalysis {
  if (block.type === 'columns') {
    return block.columns.flat().reduce<PageAnalysis>(
      (result, child) => {
        const analysis = analyzeBlock(child, page);
        return {
          blockCount: result.blockCount + analysis.blockCount,
          reviewItems: [...result.reviewItems, ...analysis.reviewItems],
        };
      },
      { blockCount: 1, reviewItems: [] },
    );
  }
  if (block.type === 'embed') {
    return {
      blockCount: 1,
      reviewItems: [
        {
          code: 'embed-review-required',
          message: `Embedded content${block.provider === undefined ? '' : ` from ${block.provider}`} is preserved as inert source and requires review.`,
          pageId: page.id,
          sourceUrl: page.sourceUrl,
        },
      ],
    };
  }
  if (block.type === 'rawHtml') {
    return {
      blockCount: 1,
      reviewItems: [
        {
          code: 'raw-html-review-required',
          message: `${block.reason}; preserved HTML requires review.`,
          pageId: page.id,
          sourceUrl: page.sourceUrl,
        },
      ],
    };
  }
  return { blockCount: 1, reviewItems: [] };
}

function analyzePage(page: Page): PageAnalysis {
  return page.blocks.reduce<PageAnalysis>(
    (result, block) => {
      const analysis = analyzeBlock(block, page);
      return {
        blockCount: result.blockCount + analysis.blockCount,
        reviewItems: [...result.reviewItems, ...analysis.reviewItems],
      };
    },
    { blockCount: 0, reviewItems: [] },
  );
}

function countWarnings(warnings: MigrationWarning[]): Record<string, number> {
  return warnings.reduce<Record<string, number>>((counts, warning) => {
    counts[warning.code] = (counts[warning.code] ?? 0) + 1;
    return counts;
  }, {});
}

export function createMigrationReport(input: Site): MigrationReport {
  const site = parseSite(input);
  const pageAnalyses = site.pages.map((page) => ({ page, analysis: analyzePage(page) }));
  const pageReviewItems = pageAnalyses.flatMap(({ analysis }) => analysis.reviewItems);
  const remoteAssets = site.assets.filter((asset) => asset.localPath === undefined);
  const localAssets = site.assets.filter((asset) => asset.localPath !== undefined);
  const unverifiedLocalAssets = localAssets.filter((asset) => asset.checksum === undefined);
  const reviewItems: MigrationReviewItem[] = [
    ...pageReviewItems,
    ...remoteAssets.map((asset) => ({
      code: 'remote-asset' as const,
      message: 'Asset was not stored locally and still depends on the source URL.',
      sourceUrl: asset.sourceUrl,
    })),
    ...unverifiedLocalAssets.map((asset) => ({
      code: 'unverified-local-asset' as const,
      message: 'Local asset has no checksum and cannot be integrity-verified.',
      sourceUrl: asset.sourceUrl,
    })),
  ];
  const blockCount = pageAnalyses.reduce(
    (total, { analysis }) => total + analysis.blockCount,
    0,
  );
  const verifiedLocalAssetCount = localAssets.length - unverifiedLocalAssets.length;
  const readiness =
    site.warnings.length === 0 && reviewItems.length === 0 ? 'ready' : 'review-required';

  return {
    reportVersion: CURRENT_REPORT_VERSION,
    source: site.source,
    siteTitle: site.metadata.title,
    readiness,
    summary: {
      pageCount: site.pages.length,
      blockCount,
      assetCount: site.assets.length,
      localAssetCount: localAssets.length,
      verifiedLocalAssetCount,
      unverifiedLocalAssetCount: unverifiedLocalAssets.length,
      remoteAssetCount: remoteAssets.length,
      warningCount: site.warnings.length,
      reviewItemCount: reviewItems.length,
    },
    pages: pageAnalyses.map(({ page, analysis }) => ({
      id: page.id,
      title: page.title,
      sourceUrl: page.sourceUrl,
      targetPath: page.targetPath,
      blockCount: analysis.blockCount,
      reviewItemCount: analysis.reviewItems.length,
    })),
    warningCounts: countWarnings(site.warnings),
    warnings: site.warnings,
    reviewItems,
  };
}

function markdownText(value: string): string {
  return value
    .replace(/\r?\n/gu, ' ')
    .replace(/\\/gu, '\\\\')
    .replace(/([`*_[\]#|<>])/gu, '\\$1');
}

function markdownLink(label: string, url: string): string {
  return `[${markdownText(label)}](<${url.replace(/>/gu, '%3E')}>)`;
}

export function renderMigrationReportMarkdown(report: MigrationReport): string {
  const lines = [
    '# Site Rescue Migration Report',
    '',
    `- Site: ${markdownText(report.siteTitle)}`,
    `- Source: ${markdownLink(report.source.baseUrl, report.source.baseUrl)}`,
    `- Adapter: ${markdownText(report.source.adapter)}`,
    `- Captured: ${report.source.capturedAt}`,
    `- Readiness: **${report.readiness}**`,
    '',
    '## Summary',
    '',
    '| Item | Count |',
    '| --- | ---: |',
    `| Pages | ${report.summary.pageCount} |`,
    `| Content blocks | ${report.summary.blockCount} |`,
    `| Assets | ${report.summary.assetCount} |`,
    `| Local assets | ${report.summary.localAssetCount} |`,
    `| Verified local assets | ${report.summary.verifiedLocalAssetCount} |`,
    `| Unverified local assets | ${report.summary.unverifiedLocalAssetCount} |`,
    `| Remote assets | ${report.summary.remoteAssetCount} |`,
    `| Warnings | ${report.summary.warningCount} |`,
    `| Manual review items | ${report.summary.reviewItemCount} |`,
    '',
    '## Pages',
    '',
    '| Page | Target | Blocks | Review items |',
    '| --- | --- | ---: | ---: |',
    ...report.pages.map(
      (page) =>
        `| ${markdownLink(page.title, page.sourceUrl)} | ${markdownText(page.targetPath)} | ${page.blockCount} | ${page.reviewItemCount} |`,
    ),
    '',
    '## Warnings',
    '',
    ...(report.warnings.length === 0
      ? ['None.']
      : report.warnings.map(
          (warning) =>
            `- **${markdownText(warning.code)}**: ${markdownText(warning.message)}${warning.sourceUrl === undefined ? '' : ` (${markdownLink('source', warning.sourceUrl)})`}`,
        )),
    '',
    '## Manual review',
    '',
    ...(report.reviewItems.length === 0
      ? ['None.']
      : report.reviewItems.map(
          (item) =>
            `- **${markdownText(item.code)}**: ${markdownText(item.message)} (${markdownLink('source', item.sourceUrl)})`,
        )),
    '',
  ];
  return `${lines.join('\n')}\n`;
}

async function writeAtomically(target: string, contents: string): Promise<void> {
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, contents, 'utf8');
    await rm(target, { force: true });
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function writeMigrationReport(
  input: Site,
  options: WriteMigrationReportOptions,
): Promise<WriteMigrationReportResult> {
  const outputDirectory = resolve(options.outputDirectory);
  const report = createMigrationReport(input);
  const jsonFile = resolve(outputDirectory, 'migration-report.json');
  const markdownFile = resolve(outputDirectory, 'migration-report.md');
  await mkdir(outputDirectory, { recursive: true });
  await writeAtomically(jsonFile, `${JSON.stringify(report, null, 2)}\n`);
  await writeAtomically(markdownFile, renderMigrationReportMarkdown(report));
  return { outputDirectory, jsonFile, markdownFile, report };
}
