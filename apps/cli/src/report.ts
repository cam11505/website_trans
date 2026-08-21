import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseSite } from '@site-rescue/content-schema';
import { writeMigrationReport } from '@site-rescue/report';

export interface ReportOptions {
  outputDirectory: string;
  writeLine?: (line: string) => void;
}

export interface ReportResult {
  outputDirectory: string;
  jsonFile: string;
  markdownFile: string;
  readiness: 'ready' | 'review-required';
  warningCount: number;
  redirectCount: number;
  reviewItemCount: number;
}

export async function runReport(inputFile: string, options: ReportOptions): Promise<ReportResult> {
  const writeLine = options.writeLine ?? console.log;
  const absoluteInput = resolve(inputFile);
  const site = parseSite(JSON.parse(await readFile(absoluteInput, 'utf8')) as unknown);
  const result = await writeMigrationReport(site, {
    outputDirectory: options.outputDirectory,
  });

  writeLine('Site Rescue migration report complete');
  writeLine(`Readiness: ${result.report.readiness}`);
  writeLine(`Warnings: ${result.report.summary.warningCount}`);
  writeLine(`Redirects: ${result.report.summary.redirectCount}`);
  writeLine(`Manual review items: ${result.report.summary.reviewItemCount}`);
  writeLine(`JSON: ${result.jsonFile}`);
  writeLine(`Markdown: ${result.markdownFile}`);

  return {
    outputDirectory: result.outputDirectory,
    jsonFile: result.jsonFile,
    markdownFile: result.markdownFile,
    readiness: result.report.readiness,
    warningCount: result.report.summary.warningCount,
    redirectCount: result.report.summary.redirectCount,
    reviewItemCount: result.report.summary.reviewItemCount,
  };
}
