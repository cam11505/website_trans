import { resolve } from 'node:path';
import type { AssetFetcher } from '@site-rescue/asset-pipeline';
import type { SourceAdapter } from '@site-rescue/core';
import type { Fetcher } from '@site-rescue/crawler';
import { runCapture, type CaptureResult } from './capture.js';
import { runExport, type ExportResult } from './export.js';
import { runManifest } from './manifest.js';
import { runReport, type ReportResult } from './report.js';
import { runVerify } from './verify.js';
import type { VerifyStaticSiteResult } from '@site-rescue/static-verifier';
import type { StaticHtmlStyleMode } from '@site-rescue/exporter-static-html';
import type { WriteRescueManifestResult } from '@site-rescue/rescue-manifest';
import { withFreshOutputDirectory } from '@site-rescue/output-safety';

export interface RescueOptions {
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
  styleMode?: StaticHtmlStyleMode;
  capturedAt?: string;
  writeLine?: (line: string) => void;
}

export interface RescueResult {
  outputDirectory: string;
  captureDirectory: string;
  siteDirectory: string;
  reportDirectory: string;
  capture: CaptureResult;
  export: ExportResult;
  report: ReportResult;
  verification: VerifyStaticSiteResult;
  manifest?: WriteRescueManifestResult;
}

export async function runRescue(inputUrl: string, options: RescueOptions): Promise<RescueResult> {
  return withFreshOutputDirectory(options.outputDirectory, async (outputDirectory) =>
    runRescueInDirectory(inputUrl, { ...options, outputDirectory }),
  );
}

async function runRescueInDirectory(
  inputUrl: string,
  options: RescueOptions,
): Promise<RescueResult> {
  const writeLine = options.writeLine ?? console.log;
  const outputDirectory = resolve(options.outputDirectory);
  const captureDirectory = resolve(outputDirectory, 'capture');
  const siteDirectory = resolve(outputDirectory, 'site');
  const reportDirectory = resolve(outputDirectory, 'report');
  const capture = await runCapture(inputUrl, {
    outputDirectory: captureDirectory,
    maxPages: options.maxPages,
    maxRetries: options.maxRetries,
    requestTimeoutMs: options.requestTimeoutMs,
    maxHtmlBytes: options.maxHtmlBytes,
    fetcher: options.fetcher,
    assetFetcher: options.assetFetcher,
    adapters: options.adapters,
    downloadAssets: options.downloadAssets,
    maxAssetBytes: options.maxAssetBytes,
    maxCssDepth: options.maxCssDepth,
    maxCssDependencies: options.maxCssDependencies,
    capturedAt: options.capturedAt,
    writeLine: () => undefined,
  });
  const exported = await runExport(capture.outputFile, {
    outputDirectory: siteDirectory,
    styleMode: options.styleMode,
    writeLine: () => undefined,
  });
  const report = await runReport(capture.outputFile, {
    outputDirectory: reportDirectory,
    writeLine: () => undefined,
  });
  const verification = await runVerify(siteDirectory, {
    writeLine: () => undefined,
  });
  const manifest = verification.valid
    ? await runManifest(outputDirectory, { writeLine: () => undefined })
    : undefined;

  writeLine('Site Rescue complete');
  writeLine(`Pages captured: ${capture.pageCount}`);
  writeLine(`Redirects preserved: ${capture.redirectCount}`);
  writeLine(`Assets downloaded: ${capture.downloadedAssetCount}`);
  writeLine(`Asset downloads failed: ${capture.failedAssetCount}`);
  writeLine(`CSS dependencies discovered: ${capture.discoveredCssDependencyCount}`);
  writeLine(`CSS references rewritten: ${capture.rewrittenCssReferenceCount}`);
  writeLine(`Pages exported: ${exported.pageCount}`);
  writeLine(`Redirect fallback pages exported: ${exported.redirectPageCount}`);
  writeLine(`Assets copied: ${exported.copiedAssetCount}`);
  writeLine(`Source stylesheets applied: ${exported.appliedSourceStylesheetCount}`);
  writeLine(`Readiness: ${report.readiness}`);
  writeLine(`Verification: ${verification.valid ? 'valid' : 'invalid'}`);
  writeLine(
    manifest === undefined
      ? 'Bundle manifest: not written because verification failed'
      : `Bundle files recorded: ${manifest.fileCount}`,
  );
  writeLine(`Capture: ${captureDirectory}`);
  writeLine(`Website: ${siteDirectory}`);
  writeLine(`Report: ${reportDirectory}`);
  if (manifest !== undefined) {
    writeLine(`Manifest: ${manifest.manifestFile}`);
  }

  return {
    outputDirectory,
    captureDirectory,
    siteDirectory,
    reportDirectory,
    capture,
    export: exported,
    report,
    verification,
    ...(manifest === undefined ? {} : { manifest }),
  };
}
