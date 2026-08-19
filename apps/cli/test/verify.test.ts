import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { main } from '../src/index.js';
import { runVerify } from '../src/verify.js';

describe('verify command', () => {
  it('prints a local verification summary', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'site-rescue-cli-verify-'));
    const lines: string[] = [];
    try {
      await writeFile(
        join(directory, 'index.html'),
        '<a href="missing.html">Missing</a>',
        'utf8',
      );
      const result = await runVerify(directory, {
        writeLine: (line) => lines.push(line),
      });

      expect(result.valid).toBe(false);
      expect(lines).toContain('Site Rescue static verification complete');
      expect(lines).toContain('Status: invalid');
      expect(lines).toContain('CSS files: 0');
      expect(lines).toContain('Issues: 1');
      expect(lines.some((line) => line.includes('[missing-file]'))).toBe(true);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('returns exit code 2 for verification issues', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'site-rescue-cli-verify-exit-'));
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await writeFile(
        join(directory, 'index.html'),
        '<img src="missing.png">',
        'utf8',
      );
      await expect(main(['verify', directory])).resolves.toBe(2);
    } finally {
      output.mockRestore();
      await rm(directory, { force: true, recursive: true });
    }
  });
});
