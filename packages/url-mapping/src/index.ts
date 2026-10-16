import { createHash } from 'node:crypto';
import { posix } from 'node:path';

export const QUERY_OUTPUT_DIRECTORY = '__site-rescue-query';
export const URL_MAPPING_FILENAME = 'url-mapping.json';
export const hasQueryString = (value: string): boolean => (value.split('#', 1)[0] ?? '').includes('?');

/** HTTP resource identity: keep the serialized query exactly, including a bare empty marker. */
export function urlToSitePath(url: URL): string {
  return `${url.pathname}${url.search}${url.search === '' && (url.href.split('#', 1)[0] ?? '').endsWith('?') ? '?' : ''}`;
}

/** Shared by export and redirect planning. Query text never becomes a filesystem path segment. */
export function targetPathToFile(targetPath: string): string {
  if (!targetPath.startsWith('/') || targetPath.startsWith('//')) {
    throw new Error(`Target path must be an absolute site path: ${targetPath}`);
  }
  const resource = targetPath.split('#', 1)[0] ?? '/';
  const pathname = resource.split('?', 1)[0] ?? '/';
  if (pathname.includes('\\')) throw new Error(`Unsafe target path: ${targetPath}`);
  const segments = pathname.split('/').filter((segment) => segment !== '');
  // Validate pathname before hashing so a query cannot bypass existing traversal protections.
  for (const segment of segments) {
    let decoded: string;
    try { decoded = decodeURIComponent(segment); } catch { throw new Error(`Invalid encoded target path: ${targetPath}`); }
    if (decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\') || decoded.includes('\0')) {
      throw new Error(`Unsafe target path: ${targetPath}`);
    }
  }
  if (hasQueryString(resource)) {
    return `${QUERY_OUTPUT_DIRECTORY}/${createHash('sha256').update(resource).digest('hex')}.html`;
  }
  if (segments.length === 0) return 'index.html';
  return pathname.endsWith('/') || posix.extname(segments.at(-1) ?? '') === ''
    ? posix.join(...segments, 'index.html') : posix.join(...segments);
}
