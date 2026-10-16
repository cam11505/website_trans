import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseSite, type MigrationWarning, type Site } from '@site-rescue/content-schema';
import type { VerifyStaticSiteResult } from '@site-rescue/static-verifier';
import { createMigrationReport as createLegacyMigrationReport, renderMigrationReportMarkdown as renderLegacyMigrationReportMarkdown,
  type MigrationReport as LegacyMigrationReport } from './legacy-v1.js';
import { validateAcquisitionEvidence, type AcquisitionEvidence } from './evidence.js';

export { createLegacyMigrationReport, renderLegacyMigrationReportMarkdown };
export * from './evidence.js';
export type { PageReport, MigrationReviewItem } from './legacy-v1.js';
export const CURRENT_REPORT_VERSION = '2.0.0' as const;
type WarningGroup = 'acquisition' | 'conversion' | 'assets' | 'unclassified';
export interface ReportContext { acquisitionEvidence?: AcquisitionEvidence; staticVerification?: VerifyStaticSiteResult }
export interface MigrationReport extends Omit<LegacyMigrationReport, 'reportVersion' | 'summary' | 'readiness'> {
  reportVersion: typeof CURRENT_REPORT_VERSION;
  readiness: 'review-required';
  summary: Omit<LegacyMigrationReport['summary'], 'verifiedLocalAssetCount'> & { checksumRecordedLocalAssetCount: number };
  warningGroups: Record<WarningGroup, MigrationWarning[]>;
  coverage: {
    sourceAcquisition: { status: 'unknown' | 'partial' | 'observed-scope-complete'; sourceCompleteness: 'unknown'; evidence: AcquisitionEvidence['acquisition'] | null };
    conversion: { status: 'no-known-losses' | 'review-required'; completeness: 'not-proven'; unsupportedBlockCount: number; unrepresentedPageCount: number | null };
    staticIntegrity: { status: 'not-checked'; scope: 'generated-local-references' } | {
      scope: 'generated-local-references';
      status: 'valid' | 'invalid'; htmlFileCount: number; cssFileCount: number; checkedReferenceCount: number;
      internalReferenceCount: number; externalReferenceCount: number; issueCount: number;
    };
    manualReview: { status: 'not-assessed'; checks: string[] };
  };
}

const acquisitionCodes = new Set(['crawl-truncated', 'crawl-fetch-failed', 'offline-html-import', 'source-snapshot-replayed',
  'missing-local-reference', 'unsafe-reference', 'query-reference-not-inspected', 'text-inspection-skipped', 'css-inspection-skipped',
  'html-base-not-inspected', 'entry-point-not-identified', 'no-html-files', 'external-references-not-fetched']);
const conversionCodes = new Set(['generic-html-fallback', 'unsupported-html-preserved', 'unsupported-inline-content', 'unsafe-inline-link',
  'inline-content-flattened', 'srcset-not-inspected', 'unsupported-reference-markup', 'uninspected-url-attribute', 'active-content-not-inspected']);
const assetCodes = new Set(['asset-download-failed', 'css-parse-failed', 'css-depth-limit-reached', 'css-dependency-limit-reached']);
function warningGroup(code: string): WarningGroup {
  if (acquisitionCodes.has(code)) return 'acquisition';
  if (conversionCodes.has(code)) return 'conversion';
  if (assetCodes.has(code)) return 'assets';
  return 'unclassified';
}

function staticIntegrity(verification: VerifyStaticSiteResult | undefined): MigrationReport['coverage']['staticIntegrity'] {
  if (verification === undefined) return { status: 'not-checked', scope: 'generated-local-references' };
  const { htmlFileCount, cssFileCount, checkedReferenceCount, internalReferenceCount, externalReferenceCount, issueCount } = verification;
  const counts = { htmlFileCount, cssFileCount, checkedReferenceCount, internalReferenceCount, externalReferenceCount, issueCount };
  if (Object.values(counts).some((value) => !Number.isSafeInteger(value) || value < 0) ||
    verification.valid !== (issueCount === 0) || verification.issues.length !== issueCount) throw new Error('Static verification evidence is inconsistent.');
  return { status: verification.valid ? 'valid' : 'invalid', scope: 'generated-local-references', ...counts };
}

export function createMigrationReport(input: Site, context: ReportContext = {}): MigrationReport {
  const site = parseSite(input);
  const legacy = createLegacyMigrationReport(site);
  const warningGroups: MigrationReport['warningGroups'] = { acquisition: [], conversion: [], assets: [], unclassified: [] };
  const counts = new Map<string, number>();
  for (const warning of site.warnings) {
    warningGroups[warningGroup(warning.code)].push(warning);
    counts.set(warning.code, (counts.get(warning.code) ?? 0) + 1);
  }
  const evidence = context.acquisitionEvidence === undefined ? null : validateAcquisitionEvidence(site, context.acquisitionEvidence).acquisition;
  const knownPartial = site.warnings.some((warning) => ['crawl-truncated', 'crawl-fetch-failed', 'missing-local-reference', 'unsafe-reference'].includes(warning.code));
  let status: MigrationReport['coverage']['sourceAcquisition']['status'] = knownPartial ? 'partial' : 'unknown';
  if (evidence !== null) {
    const partial = evidence.kind === 'live-url' ? evidence.truncated || evidence.acquisitionWarningCount > 0
      : evidence.missingReferenceCount > 0 || evidence.unsafeReferenceCount > 0 || evidence.referenceInspection === 'partial' || evidence.inventoriedHtmlCount !== evidence.normalizedPageCount;
    status = partial || knownPartial ? 'partial' : 'observed-scope-complete';
  }
  const unsupportedBlockCount = legacy.reviewItems.filter((item) => item.code === 'embed-review-required' || item.code === 'raw-html-review-required').length;
  const unrepresentedPageCount = evidence === null ? null : (evidence.kind === 'live-url' ? evidence.capturedPageCount : evidence.inventoriedHtmlCount) - evidence.normalizedPageCount;
  const { verifiedLocalAssetCount, ...summary } = legacy.summary;
  return { ...legacy, reportVersion: CURRENT_REPORT_VERSION, readiness: 'review-required',
    summary: { ...summary, checksumRecordedLocalAssetCount: verifiedLocalAssetCount }, warningCounts: Object.fromEntries(counts), warningGroups,
    coverage: {
      sourceAcquisition: { status, sourceCompleteness: 'unknown', evidence },
      conversion: { status: unsupportedBlockCount > 0 || (unrepresentedPageCount ?? 0) > 0 || warningGroups.conversion.length > 0 || warningGroups.unclassified.length > 0 ? 'review-required' : 'no-known-losses', completeness: 'not-proven', unsupportedBlockCount, unrepresentedPageCount },
      staticIntegrity: staticIntegrity(context.staticVerification),
      manualReview: { status: 'not-assessed', checks: [
        'Compare source pages/content with generated output; source completeness and full semantic preservation are not proven.',
        'Review visual layout, responsive/lazy media, external dependencies and unsupported markup.',
        'Review forms, scripts, accounts, commerce and other dynamic services; source scripts are never executed by the CLI.',
        'Review production redirects, hosting and deployment behavior before publishing.',
      ] },
    },
  };
}

export function renderMigrationReportMarkdown(report: MigrationReport): string {
  const legacyShape: LegacyMigrationReport = { ...report, reportVersion: '1.0.0', summary: { ...report.summary, verifiedLocalAssetCount: report.summary.checksumRecordedLocalAssetCount } };
  const base = renderLegacyMigrationReportMarkdown(legacyShape).replace('| Verified local assets |', '| Local assets with recorded checksum (not rechecked) |')
    .replace('- Site:', '- Report version: 2.0.0\n- Site:');
  const acquisition = report.coverage.sourceAcquisition;
  const evidence = acquisition.evidence;
  const metrics = evidence === null ? 'No matching structured acquisition evidence; counts remain unknown.' : evidence.kind === 'live-url'
    ? `Discovered URLs: ${evidence.discoveredUrlCount}; captured pages: ${evidence.capturedPageCount}; normalized pages: ${evidence.normalizedPageCount}; acquisition warnings: ${evidence.acquisitionWarningCount}; truncated: ${evidence.truncated}; max pages: ${evidence.maxPages}. Redirect aliases can differ from captured pages.`
    : `Inventoried HTML: ${evidence.inventoriedHtmlCount}; normalized pages: ${evidence.normalizedPageCount}; original files: ${evidence.originalFileCount}; missing references: ${evidence.missingReferenceCount}; external references: ${evidence.externalReferenceCount}; supported reference inspection: ${evidence.referenceInspection}.`;
  const integrity = report.coverage.staticIntegrity;
  const coverage = [
    '## Coverage and evidence', '',
    'Static integrity and recorded checksums are not proof of complete migration. No source coverage or conversion accuracy percentage is asserted.', '',
    `### Source acquisition: ${acquisition.status}`, '', `Original website completeness: ${acquisition.sourceCompleteness}.`, metrics, '',
    `### Conversion: ${report.coverage.conversion.status}`, '',
    `Completeness: ${report.coverage.conversion.completeness}; unsupported blocks: ${report.coverage.conversion.unsupportedBlockCount}; acquired pages not represented: ${report.coverage.conversion.unrepresentedPageCount ?? 'unknown'}. No known losses does not certify equivalence.`, '',
    `### Static integrity: ${integrity.status}`, '',
    integrity.status === 'not-checked' ? 'Generated files have not been checked by this report. Use report --site-directory or the rescue/import/replay workflow.'
      : `HTML: ${integrity.htmlFileCount}; CSS: ${integrity.cssFileCount}; checked references: ${integrity.checkedReferenceCount}; external references: ${integrity.externalReferenceCount}; issues: ${integrity.issueCount}. This checks generated references, not source coverage or all asset bytes.`, '',
    '### Manual deployment review: not-assessed', '', ...report.coverage.manualReview.checks.map((check) => `- ${check}`), '',
  ].join('\n');
  return base.replace('## Summary', `${coverage}\n## Summary`);
}

export interface WriteMigrationReportOptions extends ReportContext { outputDirectory: string }
export interface WriteMigrationReportResult { outputDirectory: string; jsonFile: string; markdownFile: string; report: MigrationReport }
async function writeAtomically(target: string, contents: string): Promise<void> {
  const temporary = `${target}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, contents, 'utf8'); await rm(target, { force: true }); await rename(temporary, target); }
  catch (error) { await rm(temporary, { force: true }); throw error; }
}
export async function writeMigrationReport(input: Site, options: WriteMigrationReportOptions): Promise<WriteMigrationReportResult> {
  const outputDirectory = resolve(options.outputDirectory);
  const report = createMigrationReport(input, options);
  const jsonFile = resolve(outputDirectory, 'migration-report.json');
  const markdownFile = resolve(outputDirectory, 'migration-report.md');
  await mkdir(outputDirectory, { recursive: true });
  await writeAtomically(jsonFile, `${JSON.stringify(report, null, 2)}\n`);
  await writeAtomically(markdownFile, renderMigrationReportMarkdown(report));
  return { outputDirectory, jsonFile, markdownFile, report };
}
