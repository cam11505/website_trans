import { createHash } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import { lstat, open, opendir, realpath } from 'node:fs/promises';
import { extname, join, posix, resolve } from 'node:path';
import { load } from 'cheerio';
import { collectCssReferences } from '@site-rescue/css-references';

export interface InventoryLimits {
  maxEntries: number;
  maxDepth: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  maxTextBytes: number;
  maxReferences: number;
}

export const DEFAULT_INVENTORY_LIMITS: Readonly<InventoryLimits> = Object.freeze({
  maxEntries: 10_000,
  maxDepth: 16,
  maxFileBytes: 64 * 1024 * 1024,
  maxTotalBytes: 256 * 1024 * 1024,
  maxTextBytes: 2 * 1024 * 1024,
  maxReferences: 20_000,
});

export interface InventoryFile {
  path: string;
  kind: 'html' | 'css' | 'asset' | 'other';
  bytes: number;
  sha256: string;
  referenceInspection: 'checked' | 'skipped' | 'not-applicable';
}

export interface InventoryReference {
  sourcePath: string;
  context: string;
  value: string;
  status: 'present' | 'missing' | 'external' | 'embedded' | 'unsafe' | 'unresolved';
  targetPath?: string;
}

export interface InventoryWarning {
  code: string;
  path?: string;
  message: string;
  action: string;
}

export interface SourceInventory {
  inventoryVersion: '1.0.0';
  sourceKind: 'html-directory';
  scope: 'inventory-only';
  reviewRequired: true;
  limits: InventoryLimits;
  coverage: {
    fileEnumeration: 'complete';
    referenceInspection: 'complete' | 'partial';
    migration: 'not-assessed';
  };
  summary: { files: number; directories: number; htmlFiles: number; cssFiles: number; totalBytes: number };
  files: InventoryFile[];
  references: InventoryReference[];
  warnings: InventoryWarning[];
}

interface SourceEntry { path: string; absolutePath: string; stat: Stats }

function samePath(left: string, right: string): boolean {
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function sameStat(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size &&
    left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs && left.mode === right.mode;
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

async function assertUnchanged(entry: SourceEntry): Promise<void> {
  const stat = await lstat(entry.absolutePath);
  if (stat.isSymbolicLink() || !sameStat(entry.stat, stat) ||
    !samePath(await realpath(entry.absolutePath), entry.absolutePath)) {
    throw new Error(`Source changed during inspection: ${entry.path || '.'}. Stop source writers and retry.`);
  }
}

function assertPortableName(name: string): void {
  if (hasControlCharacters(name) || /[<>:"\\|?*]/u.test(name) || /[. ]$/u.test(name) ||
    /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(name)) {
    throw new Error(`Source filename is not portable: ${name}. Use a sanitized working copy.`);
  }
}

function fileKind(path: string): InventoryFile['kind'] {
  const extension = extname(path).toLowerCase();
  if (extension === '.html' || extension === '.htm') return 'html';
  if (extension === '.css') return 'css';
  return /\.(?:png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|mp[34]|webm|ogg|wav|pdf|js)$/iu.test(path)
    ? 'asset' : 'other';
}

/** Read-only, bounded inventory. This does not import, normalize or certify a backup. */
export async function inspectHtmlDirectory(
  directory: string,
  options: Partial<InventoryLimits> = {},
): Promise<SourceInventory> {
  const limits = { ...DEFAULT_INVENTORY_LIMITS, ...options };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} limit must be a positive safe integer.`);
  }
  const input = resolve(directory);
  const rootStat = await lstat(input);
  if (rootStat.isSymbolicLink()) throw new Error('Input HTML directory must not be a symbolic link.');
  if (!rootStat.isDirectory()) throw new Error('Input must be an HTML directory; ZIP files are not supported.');
  const root = await realpath(input);
  const directories: SourceEntry[] = [{ path: '', absolutePath: root, stat: rootStat }];
  const entries: SourceEntry[] = [];
  const portablePaths = new Set<string>();
  let entryCount = 0;
  let expectedBytes = 0;

  async function walk(parent: SourceEntry, depth: number): Promise<void> {
    await assertUnchanged(parent);
    const names: string[] = [];
    // Bound enumeration itself, including empty directories, before sorting or reading bytes.
    for await (const entry of await opendir(parent.absolutePath)) {
      if (++entryCount > limits.maxEntries) throw new Error('Source entry count limit exceeded.');
      if (depth > limits.maxDepth) throw new Error('Source path depth limit exceeded.');
      assertPortableName(entry.name);
      names.push(entry.name);
    }
    names.sort();
    for (const name of names) {
      const path = parent.path === '' ? name : `${parent.path}/${name}`;
      const portable = path.normalize('NFC').toLowerCase();
      if (portablePaths.has(portable)) throw new Error(`Portable source path collision: ${path}.`);
      portablePaths.add(portable);
      const absolutePath = join(parent.absolutePath, name);
      const stat = await lstat(absolutePath);
      if (stat.isSymbolicLink()) throw new Error(`Source symbolic link is not supported: ${path}.`);
      const child = { path, absolutePath, stat };
      if (stat.isDirectory()) {
        directories.push(child);
        await walk(child, depth + 1);
      } else if (stat.isFile()) {
        if (stat.size > limits.maxFileBytes) throw new Error(`Source per-file byte limit exceeded: ${path}.`);
        expectedBytes += stat.size;
        if (expectedBytes > limits.maxTotalBytes) throw new Error('Source total byte limit exceeded.');
        entries.push(child);
      } else {
        throw new Error(`Unexpected special source file: ${path}. Only regular files and directories are supported.`);
      }
    }
    await assertUnchanged(parent);
  }
  await walk(directories[0]!, 1);
  entries.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const knownFiles = new Set(entries.map((entry) => entry.path));
  const files: InventoryFile[] = [];
  const references: InventoryReference[] = [];
  const warnings: InventoryWarning[] = [{
    code: 'inventory-only', message: 'This inventory does not establish source completeness, official archive format or migration readiness.',
    action: 'Review missing files and uninspected content; provide an authorized sample before implementing a platform importer.',
  }];
  let partial = false;
  let totalBytes = 0;
  const warn = (code: string, path: string, message: string, action: string): void => {
    warnings.push({ code, path, message, action });
  };

  function recordReference(sourcePath: string, context: string, raw: string, hasBase: boolean): void {
    if (references.length >= limits.maxReferences) throw new Error('Source reference count limit exceeded.');
    const value = raw.trim();
    const reference: InventoryReference = { sourcePath, context, value, status: 'unsafe' };
    references.push(reference);
    const unsafe = (): void => warn('unsafe-reference', sourcePath,
      'A reference uses an unsafe scheme, malformed encoding or an escaping/non-portable path.',
      'Review the recorded reference manually; it was not opened or fetched.');
    if (hasControlCharacters(value) || value.includes('\\')) return unsafe();
    if (/^(?:https?:|\/\/|mailto:|tel:)/iu.test(value)) {
      reference.status = 'external';
      return;
    }
    if (/^data:/iu.test(value) || value.startsWith('#') || value === '') {
      reference.status = 'embedded';
      return;
    }
    if (/^[a-z][a-z0-9+.-]*:/iu.test(value)) return unsafe();
    const rawPath = value.split(/[?#]/u)[0] ?? '';
    let decoded: string;
    try { decoded = decodeURIComponent(rawPath); } catch { return unsafe(); }
    if (hasControlCharacters(decoded) || /[\\:]/u.test(decoded) || /%2f|%5c/iu.test(rawPath)) return unsafe();
    const parts = decoded.startsWith('/') ? [] : posix.dirname(sourcePath).split('/').filter((part) => part !== '.');
    if (decoded !== '') {
      for (const part of decoded.split('/')) {
        if (part === '' || part === '.') continue;
        if (part === '..') {
          if (parts.length === 0) return unsafe();
          parts.pop();
        } else parts.push(part);
      }
    }
    // HTML <base> changes URL semantics. Never invent an origin or silently ignore it.
    if (hasBase) {
      reference.status = 'unresolved';
      return;
    }
    if (value.includes('?')) {
      partial = true;
      warn('query-reference-not-inspected', sourcePath, 'Only the file path of a query-bearing reference is checked.',
        'Confirm query-driven content and server behavior manually.');
    }
    const target = decoded === '' ? sourcePath : parts.join('/');
    const candidates = decoded.endsWith('/') || target === ''
      ? [posix.join(target, 'index.html'), posix.join(target, 'index.htm')]
      : [target, posix.join(target, 'index.html'), posix.join(target, 'index.htm')];
    const found = candidates.find((candidate) => knownFiles.has(candidate));
    reference.targetPath = found ?? target;
    reference.status = found === undefined ? 'missing' : 'present';
    if (found === undefined) warn('missing-local-reference', sourcePath, `Local reference target was not inventoried: ${target || '/'}.`,
      'Restore the missing source file or confirm the intended mapping before import.');
  }

  function inspectCss(text: string, path: string, context: string, hasBase = false): boolean {
    let collected: ReturnType<typeof collectCssReferences>;
    try { collected = collectCssReferences(text); } catch {
      partial = true;
      warn('css-inspection-skipped', path, 'CSS could not be parsed for references.', 'Review the original stylesheet; no references were inferred.');
      return false;
    }
    for (const reference of collected) recordReference(path, `${context}:${reference.kind}`, reference.value, hasBase);
    return true;
  }

  function inspectText(text: string, file: InventoryFile): void {
    const path = file.path;
    if (file.kind === 'css') {
      if (/^\s*@charset\s+["'](?!utf-8["'])/iu.test(text)) {
        partial = true;
        file.referenceInspection = 'skipped';
        warn('text-inspection-skipped', path, 'Declared CSS encoding is not UTF-8.', 'Review the encoding in a sanitized working copy.');
        return;
      }
      if (!inspectCss(text, path, 'css')) file.referenceInspection = 'skipped';
      return;
    }
    const $ = load(text);
    const charset = $('meta[charset]').attr('charset') ??
      /charset\s*=\s*([^\s;]+)/iu.exec($('meta[http-equiv="Content-Type" i]').attr('content') ?? '')?.[1];
    if (charset !== undefined && !/^utf-?8$/iu.test(charset.trim())) {
      partial = true;
      file.referenceInspection = 'skipped';
      warn('text-inspection-skipped', path, 'Declared HTML encoding is not UTF-8.', 'Review the encoding in a sanitized working copy.');
      return;
    }
    const hasBase = $('base[href]').length > 0;
    if (hasBase) {
      partial = true;
      warn('html-base-not-inspected', path, 'HTML base URL prevents reliable offline path mapping.',
        'Confirm the original base URL and mappings; local references are left unresolved.');
    }
    if ($('[srcset], [imagesrcset]').length > 0) {
      partial = true;
      warn('srcset-not-inspected', path, 'Responsive image candidate lists are outside this inventory stage.', 'Review srcset/imagesrcset candidates manually.');
    }
    if ($('svg, math, template, noscript, [srcdoc], meta[http-equiv="refresh" i]').length > 0) {
      partial = true;
      warn('unsupported-reference-markup', path, 'References in foreign markup, templates, embedded HTML or refresh directives are not fully inspected.',
        'Review these source elements manually before import.');
    }
    let activeContent = $('script, iframe, object, embed, form').length > 0;
    const attributes = new Map<string, string[]>([
      ['a', ['href']], ['area', ['href']], ['link', ['href']], ['img', ['src']], ['script', ['src']],
      ['source', ['src']], ['video', ['src', 'poster']], ['audio', ['src']], ['iframe', ['src']],
      ['embed', ['src']], ['object', ['data']], ['input', ['src']], ['form', ['action']],
    ]);
    const otherUrlAttributes = new Set(['href', 'src', 'poster', 'data', 'action', 'xlink:href',
      'data-src', 'data-srcset', 'cite', 'longdesc', 'formaction', 'background', 'manifest', 'ping']);
    let uninspectedUrlAttribute = false;
    $('*').each((_index, element) => {
      if (!('tagName' in element)) return;
      if (Object.keys(element.attribs).some((name) => /^on/iu.test(name))) activeContent = true;
      const supported = attributes.get(element.tagName) ?? [];
      if (Object.keys(element.attribs).some((name) => otherUrlAttributes.has(name) && !supported.includes(name) &&
        !(element.tagName === 'base' && name === 'href'))) uninspectedUrlAttribute = true;
      for (const attribute of supported) {
        const value = $(element).attr(attribute);
        if (value !== undefined) recordReference(path, `${element.tagName}[${attribute}]`, value, hasBase);
      }
      const style = $(element).attr('style');
      if (style !== undefined) inspectCss(`x { ${style} }`, path, 'style-attribute', hasBase);
      if (element.tagName === 'style') inspectCss($(element).text(), path, 'style-element', hasBase);
    });
    if (uninspectedUrlAttribute) {
      partial = true;
      warn('uninspected-url-attribute', path, 'Some URL-like attributes are outside the supported reference mapping.',
        'Review custom, lazy-loaded and less common URL attributes manually.');
    }
    if (activeContent) {
      partial = true;
      warn('active-content-not-inspected', path, 'Scripts, embedded documents or dynamic interactions are not executed or analyzed.',
        'Review runtime-only assets and functionality manually.');
    }
  }

  for (const entry of entries) {
    await assertUnchanged(entry);
    const kind = fileKind(entry.path);
    const isText = kind === 'html' || kind === 'css';
    const hash = createHash('sha256');
    const chunks: Buffer[] = [];
    let bytes = 0;
    // O_NOFOLLOW protects the final component on platforms that support it.
    const handle = await open(entry.absolutePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      if (!sameStat(entry.stat, await handle.stat())) throw new Error(`Source changed during inspection: ${entry.path}.`);
      const buffer = Buffer.alloc(64 * 1024);
      while (true) {
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
        if (bytesRead === 0) break;
        bytes += bytesRead;
        totalBytes += bytesRead;
        if (bytes > limits.maxFileBytes || totalBytes > limits.maxTotalBytes) throw new Error('Source byte limit exceeded during read.');
        hash.update(buffer.subarray(0, bytesRead));
        if (isText && entry.stat.size <= limits.maxTextBytes && bytes <= limits.maxTextBytes) {
          chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
        }
      }
      if (bytes !== entry.stat.size || !sameStat(entry.stat, await handle.stat())) throw new Error(`Source changed during inspection: ${entry.path}.`);
    } finally { await handle.close(); }
    await assertUnchanged(entry);
    const file: InventoryFile = { path: entry.path, kind, bytes, sha256: hash.digest('hex'),
      referenceInspection: isText ? 'checked' : 'not-applicable' };
    files.push(file);
    if (!isText) continue;
    let text: string | undefined;
    try {
      if (bytes > limits.maxTextBytes) throw new Error('Text inspection byte limit exceeded.');
      text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
    } catch { /* Hashed bytes remain recorded; uninspected references are explicit below. */ }
    if (text === undefined) {
      partial = true;
      file.referenceInspection = 'skipped';
      warn('text-inspection-skipped', entry.path, 'Text exceeds the inspection limit or is not supported UTF-8.',
        'Review the original bytes and encoding, or raise max-text-bytes within available memory.');
    } else {
      inspectText(text, file);
    }
  }
  // Detect common concurrent changes, including added/removed directory entries.
  for (const entry of [...entries, ...directories]) await assertUnchanged(entry);
  if (!sameStat(rootStat, await lstat(input)) || !samePath(root, await realpath(input))) {
    throw new Error('Source input path changed during inspection. Stop source writers and retry.');
  }
  if (!files.some((file) => file.kind === 'html')) {
    partial = true;
    warnings.push({ code: 'no-html-files', message: 'No .html or .htm files were found; this folder is not a verified HTML backup.',
      action: 'Locate an authorized HTML directory or provide a sample for format investigation.' });
  } else if (!knownFiles.has('index.html') && !knownFiles.has('index.htm')) {
    warnings.push({ code: 'entry-point-not-identified', message: 'No root index.html/index.htm entry point was found.',
      action: 'Identify the intended home page and folder layout manually before import.' });
  }
  if (references.some((reference) => reference.status === 'external')) {
    warnings.push({ code: 'external-references-not-fetched', message: 'External references were recorded without network access.',
      action: 'Confirm external dependencies and availability before any offline import or migration.' });
  }
  return {
    inventoryVersion: '1.0.0', sourceKind: 'html-directory', scope: 'inventory-only', reviewRequired: true, limits,
    coverage: { fileEnumeration: 'complete', referenceInspection: partial ? 'partial' : 'complete', migration: 'not-assessed' },
    summary: { files: files.length, directories: directories.length - 1, htmlFiles: files.filter((file) => file.kind === 'html').length,
      cssFiles: files.filter((file) => file.kind === 'css').length, totalBytes },
    files, references, warnings,
  };
}
