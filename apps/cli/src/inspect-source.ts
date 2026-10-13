import { realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { inspectHtmlDirectory, type InventoryLimits, type SourceInventory } from '@site-rescue/source-inventory';
import { withFreshOutputDirectory } from '@site-rescue/output-safety';

export interface InspectSourceOptions {
  outputDirectory: string;
  limits?: Partial<InventoryLimits>;
  writeLine?: (line: string) => void;
}

function inside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path));
}

async function canonicalOutputPath(directory: string): Promise<string> {
  const suffix: string[] = [];
  let parent = resolve(directory);
  while (true) {
    try { return join(await realpath(parent), ...suffix); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const next = dirname(parent);
      if (next === parent) throw error;
      suffix.unshift(basename(parent));
      parent = next;
    }
  }
}

function markdown(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replace(/[\\`*_{}[\]()|#]/gu, '\\$&').replace(/[\r\n]/gu, ' ');
}

export function inventoryMarkdown(inventory: SourceInventory): string {
  const lines = [
    '# Source Inventory', '',
    'Scope: inventory-only. Review required.',
    'Migration: not assessed. Official Weebly export format: unverified.', '',
    `Files: ${inventory.summary.files}; HTML: ${inventory.summary.htmlFiles}; CSS: ${inventory.summary.cssFiles}; bytes: ${inventory.summary.totalBytes}.`,
    `File enumeration: ${inventory.coverage.fileEnumeration}; supported reference inspection: ${inventory.coverage.referenceInspection}.`, '',
    'Checksums describe bytes read during inspection, not an immutable snapshot or proof of a complete website.', '',
    '## Warnings', '',
    ...inventory.warnings.map((warning) => `- **${markdown(warning.code)}**${warning.path === undefined ? '' : ` (${markdown(warning.path)})`}: ${markdown(warning.message)} ${markdown(warning.action)}`), '',
    '## Files', '', '| Path | Kind | Bytes | SHA-256 | References |', '| --- | --- | ---: | --- | --- |',
    ...inventory.files.map((file) => `| ${markdown(file.path)} | ${file.kind} | ${file.bytes} | ${file.sha256} | ${file.referenceInspection} |`), '',
    '## Reference scope', '',
    'Recorded values and targets are in source-inventory.json. Common HTML URL attributes and CSS url()/@import are inspected without fetching targets.',
    'URL fragments, responsive image lists, JavaScript dependencies, dynamic routes, browser behavior and visual parity require separate review.', '',
  ];
  return lines.join('\n');
}

export async function runInspectSource(directory: string, options: InspectSourceOptions): Promise<{
  outputDirectory: string; inventory: SourceInventory;
}> {
  const source = await realpath(resolve(directory));
  const output = resolve(options.outputDirectory);
  const canonicalOutput = await canonicalOutputPath(output);
  const overlaps = (candidate: string): boolean => inside(source, candidate) || inside(candidate, source);
  if (overlaps(output) || overlaps(canonicalOutput)) {
    throw new Error('Inventory output must be separate from the source directory, including aliases and ancestors.');
  }
  const inventory = await inspectHtmlDirectory(directory, options.limits);
  const outputDirectory = await withFreshOutputDirectory(output, async (target) => {
    await writeFile(join(target, 'source-inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`, 'utf8');
    await writeFile(join(target, 'source-inventory.md'), inventoryMarkdown(inventory), 'utf8');
    return target;
  });
  const writeLine = options.writeLine ?? console.log;
  writeLine(`Source inventory written to ${outputDirectory}`);
  writeLine(`Inventory only — review required; migration not assessed. ${inventory.summary.files} files, ${inventory.warnings.length} warnings.`);
  return { outputDirectory, inventory };
}
