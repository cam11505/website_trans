import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { withFreshOutputDirectory } from '../src/index.js';

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe('fresh output directory safety', () => {
  it('keeps a newly created directory after a successful operation', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'site-rescue-output-success-'));
    const target = join(parent, 'result');
    try {
      const result = await withFreshOutputDirectory(target, async (directory) => {
        await writeFile(join(directory, 'result.txt'), 'complete', 'utf8');
        return directory;
      });

      expect(result).toBe(target);
      expect(await readFile(join(target, 'result.txt'), 'utf8')).toBe('complete');
    } finally {
      await rm(parent, { force: true, recursive: true });
    }
  });

  it('refuses an existing path without modifying it', async () => {
    const target = await mkdtemp(join(tmpdir(), 'site-rescue-output-existing-'));
    const operation = vi.fn(async () => undefined);
    try {
      await writeFile(join(target, 'keep.txt'), 'keep', 'utf8');
      await expect(withFreshOutputDirectory(target, operation)).rejects.toThrow(
        'Output directory already exists; choose a new directory:',
      );

      expect(operation).not.toHaveBeenCalled();
      expect(await readFile(join(target, 'keep.txt'), 'utf8')).toBe('keep');
    } finally {
      await rm(target, { force: true, recursive: true });
    }
  });

  it('removes only the directory created for a failed operation', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'site-rescue-output-failure-'));
    const target = join(parent, 'failed');
    const neighbor = join(parent, 'keep.txt');
    try {
      await writeFile(neighbor, 'keep', 'utf8');
      await expect(
        withFreshOutputDirectory(target, async (directory) => {
          await writeFile(join(directory, 'partial.txt'), 'partial', 'utf8');
          throw new Error('operation failed');
        }),
      ).rejects.toThrow('operation failed');

      expect(await exists(target)).toBe(false);
      expect(await readFile(neighbor, 'utf8')).toBe('keep');
    } finally {
      await rm(parent, { force: true, recursive: true });
    }
  });
});
