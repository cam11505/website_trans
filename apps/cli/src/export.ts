import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseSite } from '@site-rescue/content-schema';
import { exportStaticHtml } from '@site-rescue/exporter-static-html';

export interface ExportOptions {
  outputDirectory: string;
  writeLine?: (line: string) => void;
}

export interface ExportResult {
  outputDirectory: string;
  pageCount: number;
  copiedAssetCount: number;
}

export async function runExport(inputFile: string, options: ExportOptions): Promise<ExportResult> {
  const writeLine = options.writeLine ?? console.log;
  const absoluteInput = resolve(inputFile);
  const site = parseSite(JSON.parse(await readFile(absoluteInput, 'utf8')) as unknown);
  const result = await exportStaticHtml(site, {
    captureDirectory: dirname(absoluteInput),
    outputDirectory: options.outputDirectory,
  });

  writeLine('Site Rescue static export complete');
  writeLine(`Pages written: ${result.pageCount}`);
  writeLine(`Assets copied: ${result.copiedAssetCount}`);
  writeLine(`Output: ${result.outputDirectory}`);
  return result;
}
