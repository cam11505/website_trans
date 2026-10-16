import { createHash } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import { lstat, open, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { parseSite, type Site } from '@site-rescue/content-schema';

export const ACQUISITION_EVIDENCE_FILENAME = 'acquisition-evidence.json';
const MAX_EVIDENCE_BYTES = 1024 * 1024;
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const detailsSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('live-url'), normalizedPageCount: count, capturedPageCount: count,
    discoveredUrlCount: count, acquisitionWarningCount: count, redirectCount: count,
    truncated: z.boolean(), maxPages: count.positive() }).strict(),
  z.object({ kind: z.enum(['html-directory', 'snapshot-replay']), normalizedPageCount: count,
    inventoriedHtmlCount: count, originalFileCount: count, totalSourceBytes: count,
    missingReferenceCount: count, externalReferenceCount: count, unsafeReferenceCount: count,
    referenceInspection: z.enum(['complete', 'partial']) }).strict(),
]);
const evidenceSchema = z.object({ evidenceVersion: z.literal('1.0.0'), siteChecksum: z.string().regex(/^[a-f0-9]{64}$/u), acquisition: detailsSchema }).strict();
export type AcquisitionEvidence = z.infer<typeof evidenceSchema>;
export type AcquisitionDetails = AcquisitionEvidence['acquisition'];
const siteChecksum = (site: Site): string => createHash('sha256').update(JSON.stringify(parseSite(site))).digest('hex');

export function validateAcquisitionEvidence(site: Site, value: unknown): AcquisitionEvidence {
  const parsed = evidenceSchema.safeParse(value);
  if (!parsed.success) throw new Error('Acquisition evidence is invalid or has an unsupported version.');
  const evidence = parsed.data;
  if (evidence.siteChecksum !== siteChecksum(site) || evidence.acquisition.normalizedPageCount !== site.pages.length) {
    throw new Error('Acquisition evidence checksum does not match the validated Site. Regenerate capture and report together.');
  }
  const acquisition = evidence.acquisition;
  if (acquisition.kind === 'live-url' ? acquisition.capturedPageCount < acquisition.normalizedPageCount || acquisition.discoveredUrlCount < acquisition.capturedPageCount
    : acquisition.inventoriedHtmlCount < acquisition.normalizedPageCount || acquisition.originalFileCount < acquisition.inventoriedHtmlCount) {
    throw new Error('Acquisition evidence counts are inconsistent.');
  }
  return evidence;
}

export async function writeAcquisitionEvidence(directory: string, site: Site, acquisition: AcquisitionDetails): Promise<void> {
  const evidence = validateAcquisitionEvidence(site, { evidenceVersion: '1.0.0', siteChecksum: siteChecksum(site), acquisition });
  await writeFile(join(directory, ACQUISITION_EVIDENCE_FILENAME), `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
}

const sameStat = (left: Stats, right: Stats): boolean => left.dev === right.dev && left.ino === right.ino && left.size === right.size &&
  left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs && left.mode === right.mode;

/** Optional fixed-name evidence; never infer metrics from messages or unrelated neighboring files. */
export async function readAcquisitionEvidence(directory: string, site: Site): Promise<AcquisitionEvidence | undefined> {
  const root = await realpath(directory);
  const path = join(root, ACQUISITION_EVIDENCE_FILENAME);
  let stat: Stats;
  try { stat = await lstat(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Acquisition evidence must be a regular file, not a symbolic link.');
  if (stat.size > MAX_EVIDENCE_BYTES) throw new Error('Acquisition evidence byte limit exceeded.');
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    if (!sameStat(stat, await handle.stat())) throw new Error('Acquisition evidence changed during read.');
    const buffer = Buffer.alloc(64 * 1024);
    while (true) {
      const read = await handle.read(buffer, 0, buffer.length, null);
      if (read.bytesRead === 0) break;
      bytes += read.bytesRead;
      if (bytes > MAX_EVIDENCE_BYTES) throw new Error('Acquisition evidence byte limit exceeded during read.');
      chunks.push(Buffer.from(buffer.subarray(0, read.bytesRead)));
    }
    if (bytes !== stat.size || !sameStat(stat, await handle.stat())) throw new Error('Acquisition evidence changed during read.');
  } finally { await handle.close(); }
  if (!sameStat(stat, await lstat(path)) || await realpath(directory) !== root) throw new Error('Acquisition evidence changed during read.');
  let value: unknown;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw new Error('Acquisition evidence must be valid UTF-8 JSON.'); }
  return validateAcquisitionEvidence(site, value);
}
