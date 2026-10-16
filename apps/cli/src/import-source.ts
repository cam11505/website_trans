import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizeGenericHtmlSite } from '@site-rescue/adapter-generic-html';
import { downloadSiteAssets } from '@site-rescue/asset-pipeline';
import { parseSite } from '@site-rescue/content-schema';
import { acquireHtmlDirectory } from '@site-rescue/html-directory';
import { assertSeparateSourceOutput, withFreshOutputDirectory } from '@site-rescue/output-safety';
import type { InventoryLimits } from '@site-rescue/source-inventory';
import { createSourceSnapshot, serializeSourceSnapshot, SOURCE_SNAPSHOT_FILENAME, type SourceSnapshot } from '@site-rescue/source-snapshot';
import type { StaticHtmlStyleMode } from '@site-rescue/exporter-static-html';
import { runExport } from './export.js';
import { runManifest } from './manifest.js';
import { runReport } from './report.js';
import { runVerify } from './verify.js';

export interface ImportSourceOptions {
  outputDirectory: string;
  limits?: Partial<InventoryLimits>;
  styleMode?: StaticHtmlStyleMode;
  capturedAt?: string;
  writeLine?: (line: string) => void;
  /** Internal replay pin; checked against acquired original bytes, never used as filesystem paths. */
  expectedSnapshot?: SourceSnapshot;
}

export async function runImportSource(directory: string, options: ImportSourceOptions) {
  await assertSeparateSourceOutput(directory, options.outputDirectory);
  return withFreshOutputDirectory(options.outputDirectory, async (outputDirectory) => {
    const captureDirectory = join(outputDirectory, 'capture');
    const acquired = await acquireHtmlDirectory(directory, captureDirectory, options.limits, options.expectedSnapshot?.files);
    await writeFile(join(captureDirectory, 'source', SOURCE_SNAPSHOT_FILENAME), serializeSourceSnapshot(createSourceSnapshot(
      acquired.inventory, options.expectedSnapshot?.acquiredAt ?? options.capturedAt ?? new Date().toISOString(),
    )));
    let site = normalizeGenericHtmlSite({ baseUrl: acquired.homeUrl, pages: acquired.pages, capturedAt: options.capturedAt });
    const targets = new Map(acquired.pages.map((page) => [page.url, page.targetPath]));
    const assetUrls = new Set(site.assets.map((asset) => asset.sourceUrl));
    site = parseSite({ ...site,
      pages: site.pages.map((page) => ({ ...page, targetPath: targets.get(page.sourceUrl)! })),
      assets: [...site.assets, ...acquired.linkedFiles.filter((url) => !assetUrls.has(url))
        .map((sourceUrl, index) => ({ id: `offline-linked-${index + 1}`, sourceUrl, role: 'dependency' }))],
      warnings: [...site.warnings, {
        code: 'offline-html-import', sourceUrl: acquired.homeUrl,
        message: 'Generic HTML directory imported offline. https://site-rescue.invalid/ is a synthetic mapping namespace, not the original website. Review source inventory, conversion warnings, external dependencies and dynamic functionality; static integrity does not establish complete migration.',
      }, ...(options.expectedSnapshot === undefined ? [] : [{ code: 'source-snapshot-replayed',
        message: 'Source Snapshot 1.0.0 bytes were verified and re-normalized with the current generic adapter offline. Previous normalized content was not reused; review conversion warnings and output.' }]),
      ...acquired.inventory.warnings.filter((warning) => warning.code !== 'inventory-only').map((warning) => ({
        code: warning.code, message: `${warning.path === undefined ? '' : `${warning.path}: `}${warning.message} ${warning.action}`,
      }))],
    });
    const assets = await downloadSiteAssets(site, { outputDirectory: captureDirectory, fetcher: acquired.assetFetcher,
      maxRetries: 0, maxAssetBytes: acquired.inventory.limits.maxFileBytes,
      maxCssDepth: acquired.inventory.limits.maxDepth, maxCssDependencies: acquired.inventory.limits.maxReferences });
    site = assets.site;
    const captureFile = join(captureDirectory, 'site.json');
    await writeFile(captureFile, `${JSON.stringify(site, null, 2)}\n`);
    const silent = { writeLine: () => undefined };
    const exported = await runExport(captureFile, { ...silent, outputDirectory: join(outputDirectory, 'site'), styleMode: options.styleMode });
    const report = await runReport(captureFile, { ...silent, outputDirectory: join(outputDirectory, 'report') });
    const verification = await runVerify(join(outputDirectory, 'site'), silent);
    const manifest = verification.valid ? await runManifest(outputDirectory, silent) : undefined;
    const writeLine = options.writeLine ?? console.log;
    writeLine('Site Rescue offline HTML import finished — review required');
    writeLine(`Pages imported/exported: ${site.pages.length}/${exported.pageCount}`);
    writeLine(`Assets stored: ${assets.storedFileCount}; unavailable: ${assets.failedAssetCount}`);
    writeLine(`Readiness: ${report.readiness}; static verification: ${verification.valid ? 'valid' : 'invalid'}`);
    writeLine(`Original bytes and provenance: ${join(captureDirectory, 'source')} and import-source.json`);
    writeLine(manifest === undefined ? 'Bundle manifest not written: repair static verification issues.' : `Bundle manifest: ${manifest.manifestFile}`);
    writeLine(`Output: ${outputDirectory}`);
    return { outputDirectory, site, export: exported, report, verification, manifest };
  });
}
