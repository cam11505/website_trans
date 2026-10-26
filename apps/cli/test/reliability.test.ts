import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Fetcher } from '@site-rescue/crawler';
import { runCapture } from '../src/capture.js';
import { main } from '../src/index.js';
import { runRescue } from '../src/rescue.js';

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe('CLI reliability and safe output', () => {
  it('prints the release version without running a command', async () => {
    const lines: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((line?: unknown) => {
      lines.push(String(line));
    });
    try {
      await expect(main(['--version'])).resolves.toBe(0);
      const metadata = JSON.parse(await readFile(join(process.cwd(), 'package.json'), 'utf8'));
      expect(lines).toEqual([metadata.version]);
    } finally {
      log.mockRestore();
    }
  });

  it('refuses an existing capture directory before making a request', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'site-rescue-cli-existing-'));
    const fetcher = vi.fn<Fetcher>();
    try {
      await writeFile(join(outputDirectory, 'keep.txt'), 'keep', 'utf8');

      await expect(
        runCapture('https://example.test/', {
          fetcher,
          outputDirectory,
          writeLine: () => undefined,
        }),
      ).rejects.toThrow('Output directory already exists; choose a new directory:');

      expect(fetcher).not.toHaveBeenCalled();
      expect(await readFile(join(outputDirectory, 'keep.txt'), 'utf8')).toBe('keep');
    } finally {
      await rm(outputDirectory, { force: true, recursive: true });
    }
  });

  it('removes a newly created rescue directory when capture fails', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'site-rescue-cli-cleanup-'));
    const outputDirectory = join(workspace, 'rescue');
    const neighbor = join(workspace, 'keep.txt');
    try {
      await writeFile(neighbor, 'keep', 'utf8');

      await expect(
        runRescue('https://example.test/', {
          fetcher: async () => {
            throw new Error('offline');
          },
          maxRetries: 0,
          outputDirectory,
          writeLine: () => undefined,
        }),
      ).rejects.toThrow('Request failed after 1 attempt(s): offline');

      expect(await exists(outputDirectory)).toBe(false);
      expect(await readFile(neighbor, 'utf8')).toBe('keep');
    } finally {
      await rm(workspace, { force: true, recursive: true });
    }
  });

  it('rejects retry counts above the CLI safety bound', async () => {
    const lines: string[] = [];
    const error = vi.spyOn(console, 'error').mockImplementation((line?: unknown) => {
      lines.push(String(line));
    });
    try {
      await expect(
        main(['diagnose', 'https://example.test/', '--max-retries', '6']),
      ).resolves.toBe(1);
      expect(lines).toContain('Error: --max-retries must be an integer between 0 and 5.');
    } finally {
      error.mockRestore();
    }
  });
});
