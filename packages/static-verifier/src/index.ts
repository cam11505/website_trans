import { lstat, readdir, readFile } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { collectCssReferences, type CssReference } from '@site-rescue/css-references';
import { load } from 'cheerio';

export interface VerificationIssue {
  code:
    | 'invalid-reference'
    | 'invalid-css'
    | 'missing-file'
    | 'missing-fragment'
    | 'outside-root'
    | 'symbolic-link-not-verified';
  sourceFile: string;
  element: string;
  attribute: string;
  reference: string;
  targetFile?: string;
}

export interface VerifyStaticSiteResult {
  directory: string;
  htmlFileCount: number;
  cssFileCount: number;
  checkedReferenceCount: number;
  internalReferenceCount: number;
  externalReferenceCount: number;
  issueCount: number;
  valid: boolean;
  issues: VerificationIssue[];
}

interface Reference {
  element: string;
  attribute: string;
  value: string;
}

const REFERENCE_SELECTORS = [
  ['a[href]', 'href'],
  ['img[src]', 'src'],
  ['link[href]', 'href'],
  ['script[src]', 'src'],
  ['source[src]', 'src'],
  ['video[src]', 'src'],
  ['video[poster]', 'poster'],
] as const;

function toPosixPath(root: string, file: string): string {
  return relative(root, file).split(sep).join('/');
}

async function collectFiles(directory: string, extension: string): Promise<string[]> {
  const files: string[] = [];
  const visit = async (current: string): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const target = resolve(current, entry.name);
      if (entry.isDirectory()) {
        await visit(target);
      } else if (entry.isFile() && extname(entry.name).toLowerCase() === extension) {
        files.push(target);
      }
    }
  };
  await visit(directory);
  return files;
}

function collectReferences(html: string): Reference[] {
  const $ = load(html);
  return REFERENCE_SELECTORS.flatMap(([selector, attribute]) =>
    $(selector)
      .toArray()
      .flatMap((node): Reference[] => {
        const value = $(node).attr(attribute)?.trim();
        return value === undefined || value === ''
          ? []
          : [{ element: node.name, attribute, value }];
      }),
  );
}

function classifyReference(value: string): 'external' | 'internal' | 'invalid' {
  if (value.startsWith('//')) {
    return 'external';
  }
  const scheme = /^([a-z][a-z0-9+.-]*):/iu.exec(value)?.[1]?.toLowerCase();
  if (scheme === undefined) {
    return 'internal';
  }
  return ['data', 'http', 'https', 'mailto', 'tel'].includes(scheme)
    ? 'external'
    : 'invalid';
}

function splitReference(value: string): { path: string; fragment?: string } {
  const hashIndex = value.indexOf('#');
  const withoutFragment = hashIndex === -1 ? value : value.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? undefined : value.slice(hashIndex + 1);
  const queryIndex = withoutFragment.indexOf('?');
  return {
    path: queryIndex === -1 ? withoutFragment : withoutFragment.slice(0, queryIndex),
    ...(fragment === undefined || fragment === '' ? {} : { fragment }),
  };
}

function resolveReferenceTarget(
  root: string,
  sourceFile: string,
  referencePath: string,
): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(referencePath);
  } catch {
    throw new Error('invalid-encoding');
  }
  if (decoded.includes('\\') || decoded.includes('\0')) {
    throw new Error('invalid-path');
  }
  if (decoded === '') {
    return sourceFile;
  }
  return decoded.startsWith('/')
    ? resolve(root, ...decoded.slice(1).split('/'))
    : resolve(dirname(sourceFile), ...decoded.split('/'));
}

function isWithinRoot(root: string, target: string): boolean {
  return target === root || target.startsWith(`${root}${sep}`);
}

async function resolveExistingTarget(target: string): Promise<{
  file?: string;
  symbolicLink: boolean;
}> {
  try {
    const information = await lstat(target);
    if (information.isSymbolicLink()) {
      return { symbolicLink: true };
    }
    if (information.isDirectory()) {
      const indexFile = resolve(target, 'index.html');
      const indexInformation = await lstat(indexFile);
      return indexInformation.isFile()
        ? { file: indexFile, symbolicLink: false }
        : { symbolicLink: indexInformation.isSymbolicLink() };
    }
    return information.isFile()
      ? { file: target, symbolicLink: false }
      : { symbolicLink: false };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { symbolicLink: false };
    }
    throw error;
  }
}

async function hasFragment(targetFile: string, fragment: string): Promise<boolean> {
  if (extname(targetFile).toLowerCase() !== '.html') {
    return true;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(fragment);
  } catch {
    return false;
  }
  const $ = load(await readFile(targetFile, 'utf8'));
  return $('[id], a[name]').toArray().some((node) => {
    const element = $(node);
    return element.attr('id') === decoded || element.attr('name') === decoded;
  });
}

export async function verifyStaticSite(directory: string): Promise<VerifyStaticSiteResult> {
  const root = resolve(directory);
  const rootInformation = await lstat(root);
  if (!rootInformation.isDirectory()) {
    throw new Error(`Static site directory is not a directory: ${root}`);
  }
  const htmlFiles = await collectFiles(root, '.html');
  const cssFiles = await collectFiles(root, '.css');
  if (htmlFiles.length === 0) {
    throw new Error(`No HTML files found in static site directory: ${root}`);
  }

  const issues: VerificationIssue[] = [];
  let checkedReferenceCount = 0;
  let internalReferenceCount = 0;
  let externalReferenceCount = 0;

  const checkReference = async (sourceFile: string, reference: Reference): Promise<void> => {
    const sourceRelative = toPosixPath(root, sourceFile);
    checkedReferenceCount += 1;
    const classification = classifyReference(reference.value);
    if (classification === 'external') {
      externalReferenceCount += 1;
      return;
    }
    if (classification === 'invalid') {
      issues.push({
        code: 'invalid-reference',
        sourceFile: sourceRelative,
        element: reference.element,
        attribute: reference.attribute,
        reference: reference.value,
      });
      return;
    }
    internalReferenceCount += 1;
    const parts = splitReference(reference.value);
    let target: string;
    try {
      target = resolveReferenceTarget(root, sourceFile, parts.path);
    } catch {
      issues.push({
        code: 'invalid-reference',
        sourceFile: sourceRelative,
        element: reference.element,
        attribute: reference.attribute,
        reference: reference.value,
      });
      return;
    }
    if (!isWithinRoot(root, target)) {
      issues.push({
        code: 'outside-root',
        sourceFile: sourceRelative,
        element: reference.element,
        attribute: reference.attribute,
        reference: reference.value,
      });
      return;
    }
    const existing = await resolveExistingTarget(target);
    const targetRelative = toPosixPath(root, existing.file ?? target);
    if (existing.symbolicLink) {
      issues.push({
        code: 'symbolic-link-not-verified',
        sourceFile: sourceRelative,
        element: reference.element,
        attribute: reference.attribute,
        reference: reference.value,
        targetFile: targetRelative,
      });
    } else if (existing.file === undefined) {
      issues.push({
        code: 'missing-file',
        sourceFile: sourceRelative,
        element: reference.element,
        attribute: reference.attribute,
        reference: reference.value,
        targetFile: targetRelative,
      });
    } else if (
      parts.fragment !== undefined &&
      !(await hasFragment(existing.file, parts.fragment))
    ) {
      issues.push({
        code: 'missing-fragment',
        sourceFile: sourceRelative,
        element: reference.element,
        attribute: reference.attribute,
        reference: reference.value,
        targetFile: toPosixPath(root, existing.file),
      });
    }
  };

  for (const sourceFile of htmlFiles) {
    const references = collectReferences(await readFile(sourceFile, 'utf8'));
    for (const reference of references) {
      await checkReference(sourceFile, reference);
    }
  }

  for (const sourceFile of cssFiles) {
    let references: CssReference[];
    try {
      references = collectCssReferences(await readFile(sourceFile, 'utf8'));
    } catch {
      issues.push({
        code: 'invalid-css',
        sourceFile: toPosixPath(root, sourceFile),
        element: 'stylesheet',
        attribute: 'syntax',
        reference: '',
      });
      continue;
    }
    for (const reference of references) {
      await checkReference(sourceFile, {
        element: reference.kind === 'import' ? '@import' : 'css',
        attribute: reference.kind,
        value: reference.value,
      });
    }
  }

  return {
    directory: root,
    htmlFileCount: htmlFiles.length,
    cssFileCount: cssFiles.length,
    checkedReferenceCount,
    internalReferenceCount,
    externalReferenceCount,
    issueCount: issues.length,
    valid: issues.length === 0,
    issues,
  };
}
