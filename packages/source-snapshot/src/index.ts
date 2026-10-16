import { constants, type Stats } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import type { SourceInventory } from '@site-rescue/source-inventory';

export const SOURCE_SNAPSHOT_FILENAME = 'source-snapshot.json';
export const MAX_SNAPSHOT_INDEX_BYTES = 4 * 1024 * 1024;
const mappingOrigin = 'https://site-rescue.invalid/';
const sourceUrl = (path: string): string => mappingOrigin + path.split('/').map(encodeURIComponent).join('/');

function portablePath(path: string): boolean {
  return path.length > 0 && path.split('/').every((part) => part !== '' && part !== '.' && part !== '..' &&
    !/[<>:"\\|?*\p{Cc}]/u.test(part) && !/[. ]$/u.test(part) &&
    !/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(part));
}

const snapshotSchema = z.object({
  snapshotVersion: z.literal('1.0.0'),
  acquisition: z.literal('html-directory'),
  acquiredAt: z.string().datetime(),
  adapter: z.literal('generic-html'),
  mappingOrigin: z.literal(mappingOrigin),
  publicOrigin: z.null(),
  filesPath: z.literal('files'),
  homePath: z.enum(['index.html', 'index.htm']),
  sourceCompleteness: z.literal('unknown'),
  files: z.array(z.object({
    path: z.string().refine(portablePath, 'Unsafe snapshot source path.'),
    kind: z.enum(['html', 'css', 'asset', 'other']),
    bytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    sourceUrl: z.string(),
  }).strict()).min(1).max(100_000),
}).strict().superRefine((snapshot, context) => {
  const paths = new Set<string>();
  let previous = '';
  for (const file of snapshot.files) {
    const key = file.path.normalize('NFC').toLowerCase();
    if (paths.has(key) || file.path <= previous || file.sourceUrl !== sourceUrl(file.path)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Snapshot files must be sorted, portable, unique and use matching synthetic source URLs.' });
      break;
    }
    paths.add(key);
    previous = file.path;
  }
  const home = snapshot.files.find((file) => file.path === 'index.html') ?? snapshot.files.find((file) => file.path === 'index.htm');
  if (home?.path !== snapshot.homePath || home?.kind !== 'html') {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Snapshot home must match the root HTML index.' });
  }
});

export type SourceSnapshot = z.infer<typeof snapshotSchema>;
export function parseSourceSnapshot(value: unknown): SourceSnapshot {
  const result = snapshotSchema.safeParse(value);
  if (!result.success) throw new Error(`Invalid source snapshot: ${result.error.issues[0]?.message ?? 'unsupported contract'}`);
  return result.data;
}

export function createSourceSnapshot(inventory: SourceInventory, acquiredAt: string): SourceSnapshot {
  return parseSourceSnapshot({ snapshotVersion: '1.0.0', acquisition: 'html-directory', adapter: 'generic-html',
    acquiredAt,
    mappingOrigin, publicOrigin: null, filesPath: 'files', sourceCompleteness: 'unknown',
    homePath: inventory.files.some((file) => file.path === 'index.html') ? 'index.html' : 'index.htm',
    files: inventory.files.map(({ path, kind, bytes, sha256 }) => ({ path, kind, bytes, sha256, sourceUrl: sourceUrl(path) })),
  });
}

export function serializeSourceSnapshot(snapshot: SourceSnapshot): string {
  const json = `${JSON.stringify(parseSourceSnapshot(snapshot), null, 2)}\n`;
  if (Buffer.byteLength(json) > MAX_SNAPSHOT_INDEX_BYTES) throw new Error('Source snapshot index byte limit exceeded. Split the source into smaller folders.');
  return json;
}

const sameStat = (left: Stats, right: Stats): boolean => left.dev === right.dev && left.ino === right.ino && left.size === right.size &&
  left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs && left.mode === right.mode;
const samePath = (left: string, right: string): boolean => process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;

/** Reads only bounded, fixed-name metadata. Acquisition checks byte integrity before adapter normalization. */
export async function readSourceSnapshot(directory: string): Promise<SourceSnapshot> {
  const input = resolve(directory);
  const rootStat = await lstat(input);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error('Source snapshot must be a directory, not a symbolic link.');
  const root = await realpath(input);
  const path = join(root, SOURCE_SNAPSHOT_FILENAME);
  let stat: Stats;
  try { stat = await lstat(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    throw new Error('Source snapshot index missing. Re-import the saved original files using import-source; legacy Inventory/provenance is not a replay contract.');
  }
  if (stat.isSymbolicLink() || !stat.isFile() || !samePath(await realpath(path), path)) throw new Error('Source snapshot index must be a regular file, not a symbolic link.');
  if (stat.size > MAX_SNAPSHOT_INDEX_BYTES) throw new Error('Source snapshot index byte limit exceeded.');
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    if (!sameStat(stat, await handle.stat())) throw new Error('Source snapshot changed during read.');
    const buffer = Buffer.alloc(64 * 1024);
    while (true) {
      const read = await handle.read(buffer, 0, buffer.length, null);
      if (read.bytesRead === 0) break;
      bytes += read.bytesRead;
      if (bytes > MAX_SNAPSHOT_INDEX_BYTES) throw new Error('Source snapshot index byte limit exceeded during read.');
      chunks.push(Buffer.from(buffer.subarray(0, read.bytesRead)));
    }
    if (bytes !== stat.size || !sameStat(stat, await handle.stat())) throw new Error('Source snapshot changed during read.');
  } finally { await handle.close(); }
  if (!sameStat(stat, await lstat(path)) || !sameStat(rootStat, await lstat(input)) ||
    !samePath(root, await realpath(input)) || !samePath(path, await realpath(path))) throw new Error('Source snapshot changed during read.');
  try {
    return parseSourceSnapshot(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid source snapshot:')) throw error;
    throw new Error('Source snapshot index is not valid UTF-8 JSON.');
  }
}
