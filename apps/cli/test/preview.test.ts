import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { main } from '../src/index.js';
import { runPreview } from '../src/preview.js';

async function createStaticFixture(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'site-rescue-cli-preview-'));
  await mkdir(join(directory, 'assets'));
  await writeFile(
    join(directory, 'index.html'),
    '<!doctype html><link rel="stylesheet" href="assets/site.css"><h1>Rescued site</h1>',
    'utf8',
  );
  await writeFile(join(directory, 'assets', 'site.css'), 'body { color: navy; }', 'utf8');
  return directory;
}

describe('preview command', () => {
  it('verifies, serves, and stops a generated-site fixture', async () => {
    const directory = await createStaticFixture();
    const controller = new AbortController();
    const lines: string[] = [];
    let fetchedHtml = '';
    let fetchComplete: Promise<void> | undefined;

    try {
      const result = await runPreview(directory, {
        port: 0,
        signal: controller.signal,
        writeLine: (line) => {
          lines.push(line);
          if (line.startsWith('URL: ')) {
            fetchComplete = fetch(line.slice('URL: '.length))
              .then((response) => response.text())
              .then((html) => {
                fetchedHtml = html;
              })
              .finally(() => {
                controller.abort();
              });
          }
        },
      });
      await fetchComplete;

      expect(result.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);
      expect(fetchedHtml).toContain('<h1>Rescued site</h1>');
      expect(lines).toContain('Site Rescue preview ready');
      expect(lines).toContain('Press Ctrl+C to stop.');
    } finally {
      controller.abort();
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('refuses to serve a site that fails preflight verification', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'site-rescue-cli-preview-invalid-'));
    try {
      await writeFile(join(directory, 'index.html'), '<img src="missing.png">', 'utf8');
      await expect(
        runPreview(directory, { port: 0, signal: new AbortController().signal }),
      ).rejects.toThrow('Static site verification failed with 1 issue(s).');
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('rejects an invalid CLI port before starting the server', async () => {
    const directory = await createStaticFixture();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(main(['preview', directory, '--port', '0'])).resolves.toBe(1);
      expect(error).toHaveBeenCalledWith(
        'Error: --port must be an integer between 1 and 65535.',
      );
    } finally {
      error.mockRestore();
      await rm(directory, { force: true, recursive: true });
    }
  });
});
