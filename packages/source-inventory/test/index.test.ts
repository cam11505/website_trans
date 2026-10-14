import { appendFile, mkdir, mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import type * as FsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { inspectHtmlDirectory } from '../src/index.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return { ...actual, open: vi.fn(actual.open) };
});

let workspace: string;
let source: string;
beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'source-inventory-api-'));
  source = join(workspace, 'source');
  await mkdir(source);
});
afterEach(async () => {
  vi.mocked(open).mockReset();
  const actual = await vi.importActual<typeof FsPromises>('node:fs/promises');
  vi.mocked(open).mockImplementation(actual.open);
  await rm(workspace, { recursive: true, force: true });
});

it('accepts exact byte limits and keeps inventory scope separate from readiness', async () => {
  const bytes = Buffer.from('<main>owned</main>');
  await writeFile(join(source, 'index.html'), bytes);
  const result = await inspectHtmlDirectory(source, { maxFileBytes: bytes.length, maxTotalBytes: bytes.length });
  expect(result.summary.totalBytes).toBe(bytes.length);
  expect(result.coverage).toEqual({ fileEnumeration: 'complete', referenceInspection: 'complete', migration: 'not-assessed' });
  expect(result.reviewRequired).toBe(true);
  expect(result.warnings.map((warning) => warning.code)).toEqual(['inventory-only']);
});

it('counts empty directories against the entry limit', async () => {
  for (const name of ['a', 'b', 'c']) await mkdir(join(source, name));
  await expect(inspectHtmlDirectory(source, { maxEntries: 2 })).rejects.toThrow(/entry count limit/iu);
});

it('rejects a source file changed during reading', async () => {
  const file = join(source, 'index.html');
  await writeFile(file, '<main>original</main>');
  const actual = await vi.importActual<typeof FsPromises>('node:fs/promises');
  vi.mocked(open).mockImplementationOnce(async (...args) => {
    const handle = await actual.open(...args);
    const read = handle.read.bind(handle);
    vi.spyOn(handle, 'read').mockImplementationOnce(async (...readArgs) => {
      const result = await read(...readArgs);
      await appendFile(file, '<p>concurrent writer</p>');
      return result;
    });
    return handle;
  });
  await expect(inspectHtmlDirectory(source)).rejects.toThrow(/changed during inspection/iu);
});
