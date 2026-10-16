import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { main } from '../src/index.js';

let workspace: string;
let original: string;
let first: string;
let snapshot: string;
let output: string;
beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'site-rescue-replay-'));
  original = join(workspace, 'original');
  first = join(workspace, 'first');
  snapshot = join(first, 'capture/source');
  output = join(workspace, 'replayed');
  await cp(join(process.cwd(), 'fixtures/shared/offline-import'), original, { recursive: true });
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Replay must never fetch'); }));
  expect(await main(['import-source', original, '--output', first, '--style-mode', 'source'])).toBe(0);
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await rm(workspace, { recursive: true, force: true });
});
const replay = (...args: string[]) => main(['replay-source', snapshot, '--output', output, ...args]);
const index = () => readFile(join(snapshot, 'source-snapshot.json'), 'utf8');

describe('versioned generic source snapshot replay', () => {
  it('writes a versioned raw source index and reparses without the original folder or normalized site.json', async () => {
    const before = await index();
    const manifest = JSON.parse(before);
    expect(manifest).toMatchObject({ snapshotVersion: '1.0.0', acquisition: 'html-directory', adapter: 'generic-html',
      mappingOrigin: 'https://site-rescue.invalid/', publicOrigin: null, filesPath: 'files', homePath: 'index.html' });
    expect(manifest.files).toHaveLength(6);
    expect(Number.isNaN(Date.parse(manifest.acquiredAt))).toBe(false);
    expect(manifest.files.every((file: { sourceUrl: string }) => file.sourceUrl.startsWith(manifest.mappingOrigin))).toBe(true);
    await rename(original, join(workspace, 'original-moved'));
    await writeFile(join(first, 'capture/site.json'), 'invalid old normalized schema; must not be read');
    expect(await replay('--style-mode', 'source')).toBe(0);
    const site = JSON.parse(await readFile(join(output, 'capture/site.json'), 'utf8'));
    expect(site.pages).toHaveLength(2);
    expect(site.assets.every((asset: { localPath?: string }) => asset.localPath !== undefined)).toBe(true);
    expect(site.warnings.some((warning: { code: string }) => warning.code === 'source-snapshot-replayed')).toBe(true);
    expect(await readFile(join(output, 'site/index.html'))).toEqual(await readFile(join(first, 'site/index.html')));
    expect(await main(['verify-bundle', output])).toBe(0);
    expect(await index()).toBe(before);
    expect(await readFile(join(output, 'capture/source/source-snapshot.json'), 'utf8')).toBe(before);
    const second = join(workspace, 'second-replay');
    expect(await main(['replay-source', join(output, 'capture/source'), '--output', second])).toBe(0);
    expect(await readFile(join(second, 'capture/source/source-snapshot.json'), 'utf8')).toBe(before);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['modified', 'missing', 'extra'])('rejects %s source files before leaving output', async (mode) => {
    if (mode === 'modified') await writeFile(join(snapshot, 'files/index.html'), '<p>Tampered</p>');
    if (mode === 'missing') await rm(join(snapshot, 'files/assets/logo.svg'));
    if (mode === 'extra') await writeFile(join(snapshot, 'files/extra.txt'), 'unexpected');
    expect(await replay()).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/snapshot|checksum/iu));
    await expect(readdir(output)).rejects.toThrow();
  });

  it('refuses legacy evidence without a snapshot contract and gives a migration message', async () => {
    await rm(join(snapshot, 'source-snapshot.json'), { force: true });
    expect(await replay()).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/re-import|import-source/iu));
    await expect(readdir(output)).rejects.toThrow();
  });

  it.each([
    ['version', (value: Record<string, unknown>) => { value.snapshotVersion = '999.0.0'; }],
    ['traversal', (value: Record<string, unknown>) => { (value.files as { path: string }[])[0]!.path = '../../outside'; }],
    ['duplicate', (value: Record<string, unknown>) => { (value.files as unknown[]).push((value.files as unknown[])[0]); }],
    ['origin', (value: Record<string, unknown>) => { value.mappingOrigin = 'https://external.example/'; }],
  ])('rejects invalid snapshot %s metadata without following its paths', async (_name, change) => {
    const value = JSON.parse(await index());
    change(value);
    await writeFile(join(snapshot, 'source-snapshot.json'), JSON.stringify(value));
    expect(await replay()).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/snapshot/iu));
    await expect(readdir(output)).rejects.toThrow();
  });

  it('bounds snapshot metadata bytes before parsing', async () => {
    await writeFile(join(snapshot, 'source-snapshot.json'), ' '.repeat(4 * 1024 * 1024 + 1));
    expect(await replay()).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/snapshot.*limit/iu));
    await expect(readdir(output)).rejects.toThrow();
  });

  it('rejects output overlap/parent aliases and preserves existing output', async () => {
    expect(await main(['replay-source', snapshot, '--output', join(snapshot, 'new')])).toBe(1);
    expect(console.error).toHaveBeenLastCalledWith(expect.stringMatching(/separate/iu));
    const alias = join(workspace, 'alias');
    await symlink(snapshot, alias, process.platform === 'win32' ? 'junction' : 'dir');
    expect(await main(['replay-source', snapshot, '--output', join(alias, 'new')])).toBe(1);
    expect(console.error).toHaveBeenLastCalledWith(expect.stringMatching(/separate/iu));
    await mkdir(output);
    await writeFile(join(output, 'keep'), 'untouched');
    expect(await replay()).toBe(1);
    expect(await readFile(join(output, 'keep'), 'utf8')).toBe('untouched');
    expect(await readdir(output)).toEqual(['keep']);
  });

  it('rejects a snapshot files-root symlink/junction', async () => {
    await rename(join(snapshot, 'files'), join(workspace, 'files-moved'));
    await symlink(join(workspace, 'files-moved'), join(snapshot, 'files'), process.platform === 'win32' ? 'junction' : 'dir');
    expect(await replay()).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/symbolic|snapshot/iu));
    await expect(readdir(output)).rejects.toThrow();
  });

  it('rejects a snapshot root alias', async () => {
    const alias = join(workspace, 'snapshot-alias');
    await symlink(snapshot, alias, process.platform === 'win32' ? 'junction' : 'dir');
    expect(await main(['replay-source', alias, '--output', output])).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/symbolic link/iu));
    await expect(readdir(output)).rejects.toThrow();
  });

  it.skipIf(process.platform === 'win32')('rejects a symlinked metadata file', async () => {
    const outside = join(workspace, 'outside.json');
    await rename(join(snapshot, 'source-snapshot.json'), outside);
    await symlink(outside, join(snapshot, 'source-snapshot.json'));
    expect(await replay()).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/symbolic link/iu));
    await expect(readdir(output)).rejects.toThrow();
  });

  it('uses current resource limits instead of trusting stored acquisition settings', async () => {
    expect(await replay('--max-entries', '1')).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/limit/iu));
    await expect(readdir(output)).rejects.toThrow();
  });
});
