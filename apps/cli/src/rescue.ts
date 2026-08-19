import { resolve } from 'node:path';
import type { AssetFetcher } from '@site-rescue/asset-pipeline';
import type { Fetcher } from '@site-rescue/crawler';
import { runCapture, type CaptureResult } from './capture.js';
import { runExport, type ExportResult } from './export.js';
import { runReport, type ReportResult } from './report.js';
import { runVerify } from './verify.js';
import type { VerifyStaticSiteResult } from '@site-rescue/static-verifier';

export interface RescueOptions {
  outputDirectory: string;
  maxPages?: number;
  fetcher?: Fetcher;
  assetFetcher?: AssetFetcher;
  downloadAssets?: boolean;
  maxAssetBytes?: number;
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
}

export async function runRescue(inputUrl: string, options: RescueOptions): Promise<RescueResult> {
  const writeLine = options.writeLine ?? console.log;
  const outputDirectory = resolve(options.outputDirectory);
  const captureDirectory = resolve(outputDirectory, 'capture');
  const siteDirectory = resolve(outputDirectory, 'site');
  const reportDirectory = resolve(outputDirectory, 'report');
  const capture = await runCapture(inputUrl, {
    outputDirectory: captureDirectory,
    maxPages: options.maxPages,
    fetcher: options.fetcher,
    assetFetcher: options.assetFetcher,
    downloadAssets: options.downloadAssets,
    maxAssetBytes: options.maxAssetBytes,
    capturedAt: options.capturedAt,
    writeLine: () => undefined,
  });
  const exported = await runExport(capture.outputFile, {
    outputDirectory: siteDirectory,
    writeLine: () => undefined,
  });
  const report = await runReport(capture.outputFile, {
    outputDirectory: reportDirectory,
    writeLine: () => undefined,
  });
  const verification = await runVerify(siteDirectory, {
    writeLine: () => undefined,
  });

  writeLine('Site Rescue complete');
  writeLine(`Pages captured: ${capture.pageCount}`);
  writeLine(`Assets downloaded: ${capture.downloadedAssetCount}`);
  writeLine(`Asset downloads failed: ${capture.failedAssetCount}`);
  writeLine(`Pages exported: ${exported.pageCount}`);
  writeLine(`Assets copied: ${exported.copiedAssetCount}`);
  writeLine(`Readiness: ${report.readiness}`);
  writeLine(`Verification: ${verification.valid ? 'valid' : 'invalid'}`);
  writeLine(`Capture: ${captureDirectory}`);
  writeLine(`Website: ${siteDirectory}`);
  writeLine(`Report: ${reportDirectory}`);

  return {
    outputDirectory,
    captureDirectory,
    siteDirectory,
    reportDirectory,
    capture,
    export: exported,
    report,
    verification,
  };
}
