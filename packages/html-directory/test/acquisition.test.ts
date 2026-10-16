import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type * as FsPromises from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { acquireHtmlDirectory } from '../src/index.js';

const hook = vi.hoisted(() => ({ beforeOpen: undefined as ((path: string) => Promise<void>) | undefined }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return { ...actual, open: async (...args: Parameters<typeof actual.open>) => {
    await hook.beforeOpen?.(String(args[0]));
    return actual.open(...args);
  } };
});

let workspace: string;
let source: string;
let capture: string;
beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'site-rescue-acquisition-'));
  source = join(workspace, 'source');
  capture = join(workspace, 'capture');
  await mkdir(source);
  await writeFile(join(source, 'index.html'), '<title>Test</title><p>Original</p>');
  await writeFile(join(source, 'asset.png'), 'original asset');
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('No network'); }));
});
afterEach(async () => {
  hook.beforeOpen = undefined;
  vi.unstubAllGlobals();
  await rm(workspace, { recursive: true, force: true });
});

it('rejects a file changed between inventory and acquisition and removes only its new capture', async () => {
  let reads = 0;
  hook.beforeOpen = async (path) => {
    if (path === join(source, 'index.html') && ++reads === 2) await writeFile(path, '<p>Changed after inventory</p>');
  };
  await expect(acquireHtmlDirectory(source, capture)).rejects.toThrow(/changed/iu);
  await expect(readFile(join(capture, 'import-source.json'))).rejects.toThrow();
  expect(await readFile(join(source, 'index.html'), 'utf8')).toContain('Changed after inventory');
});

it('detects tampering in the saved acquisition and never falls back to network', async () => {
  const result = await acquireHtmlDirectory(source, capture);
  await writeFile(join(capture, 'source/files/asset.png'), 'tampered asset');
  await expect(result.assetFetcher('https://site-rescue.invalid/asset.png')).rejects.toThrow(/checksum/iu);
  await expect(result.assetFetcher('https://external.example/asset.png')).rejects.toThrow(/does not fetch/iu);
  await expect(result.assetFetcher('file:///etc/passwd')).rejects.toThrow(/does not fetch/iu);
  expect(fetch).not.toHaveBeenCalled();
});
