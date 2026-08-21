import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseSite } from '@site-rescue/content-schema';
import {
  exportStaticHtml,
  type StaticHtmlStyleMode,
} from '@site-rescue/exporter-static-html';

export interface ExportOptions {
  outputDirectory: string;
  styleMode?: StaticHtmlStyleMode;
  writeLine?: (line: string) => void;
}

export interface ExportResult {
  outputDirectory: string;
  pageCount: number;
  redirectPageCount: number;
  copiedAssetCount: number;
  appliedSourceStylesheetCount: number;
}

export async function runExport(inputFile: string, options: ExportOptions): Promise<ExportResult> {
  const writeLine = options.writeLine ?? console.log;
  const absoluteInput = resolve(inputFile);
  const site = parseSite(JSON.parse(await readFile(absoluteInput, 'utf8')) as unknown);
  const result = await exportStaticHtml(site, {
    captureDirectory: dirname(absoluteInput),
    outputDirectory: options.outputDirectory,
    styleMode: options.styleMode,
  });

  writeLine('Site Rescue static export complete');
  writeLine(`Pages written: ${result.pageCount}`);
  writeLine(`Redirect fallback pages written: ${result.redirectPageCount}`);
  writeLine(`Assets copied: ${result.copiedAssetCount}`);
  writeLine(`Source stylesheets applied: ${result.appliedSourceStylesheetCount}`);
  writeLine(`Output: ${result.outputDirectory}`);
  return result;
}
