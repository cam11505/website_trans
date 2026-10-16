import { createHash } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import { lstat, mkdir, open, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { load } from 'cheerio';
import { rewriteCssReferences } from '@site-rescue/css-references';
import type { HttpFetcher } from '@site-rescue/http-policy';
import { assertSeparateSourceOutput, withFreshOutputDirectory } from '@site-rescue/output-safety';
import { inspectHtmlDirectory, type InventoryFile, type InventoryLimits, type SourceInventory } from '@site-rescue/source-inventory';

/** An explicitly synthetic namespace for adapter URL resolution, never a public source URL. */
export const DIRECTORY_MAPPING_ORIGIN = 'https://site-rescue.invalid/';
export const directorySourceUrl = (path: string): string => DIRECTORY_MAPPING_ORIGIN + path.split('/').map(encodeURIComponent).join('/');
const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
// Keep URL-sensitive source names out of output filenames; the provenance records both paths.
const directoryTargetPath = (path: string): string => /^[a-z0-9_./-]+$/iu.test(path)
  ? `/${path}` : `/offline-pages/${hash(Buffer.from(path))}.html`;
const sameStat = (left: Stats, right: Stats): boolean => left.dev === right.dev && left.ino === right.ino &&
  left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs && left.mode === right.mode;
const samePath = (left: string, right: string): boolean => process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;

// Revalidate every component before/after bounded reads; never open a referenced or unenumerated path.
async function readSourceFile(root: string, file: InventoryFile): Promise<Buffer> {
  const components: { path: string; stat: Stats }[] = [];
  let path = root;
  for (const segment of ['', ...file.path.split('/')]) {
    if (segment !== '') path = join(path, segment);
    const stat = await lstat(path);
    if (stat.isSymbolicLink() || !samePath(await realpath(path), path) ||
      (path === join(root, file.path) ? !stat.isFile() : !stat.isDirectory())) {
      throw new Error(`Source changed or contains an unsafe path: ${file.path}. Stop source writers and retry.`);
    }
    components.push({ path, stat });
  }
  const final = components.at(-1)!;
  if (final.stat.size !== file.bytes) throw new Error(`Source changed before import: ${file.path}.`);
  const handle = await open(final.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    if (!sameStat(final.stat, await handle.stat())) throw new Error(`Source changed before import: ${file.path}.`);
    const buffer = Buffer.alloc(64 * 1024);
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      bytes += bytesRead;
      if (bytes > file.bytes) throw new Error(`Source changed during import: ${file.path}.`);
      chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
    }
    if (bytes !== file.bytes || !sameStat(final.stat, await handle.stat())) throw new Error(`Source changed during import: ${file.path}.`);
  } finally { await handle.close(); }
  for (const component of components) {
    if (!sameStat(component.stat, await lstat(component.path)) || !samePath(await realpath(component.path), component.path)) {
      throw new Error(`Source changed during import: ${file.path}.`);
    }
  }
  const result = Buffer.concat(chunks);
  if (hash(result) !== file.sha256) throw new Error(`Source checksum changed during import: ${file.path}.`);
  return result;
}

export interface AcquiredHtmlDirectory {
  inventory: SourceInventory;
  homeUrl: string;
  pages: { url: string; html: string; title: string; targetPath: string }[];
  /** Offline-only transport supplied to the existing asset pipeline; never delegates to fetch. */
  assetFetcher: HttpFetcher;
  linkedFiles: string[];
}

/** Acquires generic directory bytes and mappings only; platform interpretation stays in adapters. */
export async function acquireHtmlDirectory(directory: string, captureDirectory: string,
  limits?: Partial<InventoryLimits>, expectedFiles?: readonly Pick<InventoryFile, 'path' | 'kind' | 'bytes' | 'sha256'>[]): Promise<AcquiredHtmlDirectory> {
  await assertSeparateSourceOutput(directory, captureDirectory);
  const inventory = await inspectHtmlDirectory(directory, limits);
  if (expectedFiles !== undefined) {
    const records = (files: typeof expectedFiles) => files.map(({ path, kind, bytes, sha256 }) => ({ path, kind, bytes, sha256 }));
    if (JSON.stringify(records(inventory.files)) !== JSON.stringify(records(expectedFiles))) {
      throw new Error('Source snapshot file set or checksum mismatch: modified, missing or unexpected source files. Restore the recorded source before replay.');
    }
  }
  const home = inventory.files.find((file) => file.path === 'index.html') ?? inventory.files.find((file) => file.path === 'index.htm');
  if (home === undefined) throw new Error('HTML directory import requires a root index.html or index.htm. Use inspect-source to review the layout.');
  if (inventory.files.some((file) => (file.kind === 'html' || file.kind === 'css') && file.referenceInspection !== 'checked')) {
    throw new Error('All HTML/CSS must be inspected UTF-8 within the text limit before import; review inspect-source warnings.');
  }
  if (inventory.warnings.some((warning) => warning.code === 'html-base-not-inspected')) {
    throw new Error('HTML base URLs are unsupported for directory import. Resolve mappings in a separate working copy first.');
  }
  const root = await realpath(resolve(directory));
  const targetPath = (file: InventoryFile): string => file === home ? '/index.html' : directoryTargetPath(file.path);
  return withFreshOutputDirectory(captureDirectory, async (capture) => {
    // Resolve only the fresh output root before creating evidence. Descendant link checks stay strict.
    const filesRoot = join(await realpath(capture), 'source/files');
    for (const file of inventory.files) {
      const bytes = await readSourceFile(root, file);
      const destination = join(filesRoot, file.path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, bytes, { flag: 'wx' });
    }
    // Detect added/removed/replaced files between inventory and acquisition, before normalization.
    const finalInventory = await inspectHtmlDirectory(directory, limits);
    if (JSON.stringify(finalInventory) !== JSON.stringify(inventory)) throw new Error('Source changed during import. Stop source writers and retry.');
    await writeFile(join(capture, 'source/source-inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`);
    const filesByUrl = new Map(inventory.files.map((file) => [directorySourceUrl(file.path), file]));
    const referencesByPath = new Map<string, Map<string, SourceInventory['references'][number]>>();
    const contextsByPath = new Map<string, Set<string>>();
    for (const reference of inventory.references) {
      const references = referencesByPath.get(reference.sourcePath) ?? new Map();
      references.set(reference.value, reference);
      referencesByPath.set(reference.sourcePath, references);
      const contexts = contextsByPath.get(reference.sourcePath) ?? new Set();
      contexts.add(`${reference.context}\0${reference.value}`);
      contextsByPath.set(reference.sourcePath, contexts);
    }
    const mapReference = (path: string, value: string): string => {
      const reference = referencesByPath.get(path)?.get(value.trim());
      if (reference?.status === 'unsafe') return 'about:invalid#site-rescue-unsafe-reference';
      if (reference?.status !== 'present' || reference.targetPath === undefined) return value;
      const fragment = value.includes('#') ? value.slice(value.indexOf('#')) : '';
      return `${directorySourceUrl(reference.targetPath)}${fragment}`;
    };
    const pages: AcquiredHtmlDirectory['pages'] = [];
    const htmlFiles = inventory.files.filter((file) => file.kind === 'html');
    const htmlPaths = new Set(htmlFiles.map((file) => file.path));
    htmlFiles.sort((left, right) => left === home ? -1 : right === home ? 1 : left.path < right.path ? -1 : 1);
    for (const file of htmlFiles) {
      const $ = load((await readSourceFile(filesRoot, file)).toString('utf8'));
      $('*').each((_index, element) => {
        if (!('tagName' in element)) return;
        for (const [attribute, value] of Object.entries(element.attribs)) {
          if (contextsByPath.get(file.path)?.has(`${element.tagName}[${attribute}]\0${value.trim()}`)) {
            $(element).attr(attribute, mapReference(file.path, value));
          }
        }
      });
      pages.push({ url: directorySourceUrl(file.path), html: $.html(), title: $('title').text().trim(), targetPath: targetPath(file) });
    }
    await writeFile(join(capture, 'import-source.json'), `${JSON.stringify({
      importVersion: '1.0.0', sourceKind: 'html-directory', mappingOrigin: DIRECTORY_MAPPING_ORIGIN,
      publicOrigin: null, adapter: 'generic-html', homePath: home.path,
      inventoryPath: 'source/source-inventory.json', originalFilesPath: 'source/files',
      pages: htmlFiles.map((file) => ({ path: file.path, sourceUrl: directorySourceUrl(file.path), targetPath: targetPath(file), sha256: file.sha256 })),
      coverage: 'generic-static-content-only', reviewRequired: true,
    }, null, 2)}\n`);
    const linkedFiles = [...new Set(inventory.references.filter((reference) => reference.context === 'a[href]' && reference.status === 'present' &&
      reference.targetPath !== undefined && !htmlPaths.has(reference.targetPath)).map((reference) => directorySourceUrl(reference.targetPath!)))];
    const assetFetcher: HttpFetcher = async (input) => {
      const url = new URL(String(input));
      url.hash = '';
      url.search = '';
      const file = filesByUrl.get(url.href);
      if (file === undefined) throw new Error('Offline import does not fetch external or missing files; review source inventory.');
      const bytes = await readSourceFile(filesRoot, file);
      const content = file.kind === 'css' ? Buffer.from(rewriteCssReferences(bytes.toString('utf8'),
        (reference) => mapReference(file.path, reference.value)).css) : bytes;
      return new Response(new Uint8Array(content), { headers: file.kind === 'css' ? { 'Content-Type': 'text/css' } : {} });
    };
    return { inventory, pages, homeUrl: directorySourceUrl(home.path), assetFetcher, linkedFiles };
  });
}
