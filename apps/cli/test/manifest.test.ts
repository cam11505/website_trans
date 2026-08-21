import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseSite } from '@site-rescue/content-schema';
import { writeMigrationReport } from '@site-rescue/report';
import { main } from '../src/index.js';
import { runManifest } from '../src/manifest.js';
import { runVerifyBundle } from '../src/verify-bundle.js';

async function createBundleFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'site-rescue-cli-manifest-'));
  const site = parseSite({
    schemaVersion: '1.0.0',
    source: {
      adapter: 'fixture',
      baseUrl: 'https://example.test/',
      capturedAt: '2026-08-21T00:00:00.000Z',
    },
    metadata: { title: 'CLI bundle fixture' },
    navigation: [],
    pages: [
      {
        id: 'home',
        sourceUrl: 'https://example.test/',
        sourcePath: '/',
        targetPath: '/',
        title: 'Home',
        blocks: [],
      },
    ],
    assets: [],
    redirects: [],
    warnings: [],
  });
  await mkdir(join(root, 'capture'), { recursive: true });
  await mkdir(join(root, 'site'), { recursive: true });
  await writeFile(
    join(root, 'capture', 'site.json'),
    `${JSON.stringify(site, null, 2)}\n`,
    'utf8',
  );
  await writeFile(join(root, 'site', 'index.html'), '<h1>Original</h1>\n', 'utf8');
  await writeMigrationReport(site, { outputDirectory: join(root, 'report') });
  return root;
}

describe('bundle manifest CLI commands', () => {
  it('writes and verifies a bundle with concise summaries', async () => {
    const root = await createBundleFixture();
    const manifestLines: string[] = [];
    const verifyLines: string[] = [];
    try {
      const manifest = await runManifest(root, {
        writeLine: (line) => manifestLines.push(line),
      });
      const verification = await runVerifyBundle(root, {
        writeLine: (line) => verifyLines.push(line),
      });

      expect(JSON.parse(await readFile(manifest.manifestFile, 'utf8'))).toMatchObject({
        manifestVersion: '1.0.0',
        source: { adapter: 'fixture' },
      });
      expect(manifestLines).toContain('Site Rescue bundle manifest complete');
      expect(manifestLines).toContain('Files: 4');
      expect(verification.valid).toBe(true);
      expect(verifyLines).toContain('Site Rescue bundle verification complete');
      expect(verifyLines).toContain('Status: valid');
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it('returns exit code 2 when a recorded file changes', async () => {
    const root = await createBundleFixture();
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await runManifest(root, { writeLine: () => undefined });
      await writeFile(join(root, 'site', 'index.html'), '<h1>Tampered</h1>\n', 'utf8');

      await expect(main(['verify-bundle', root])).resolves.toBe(2);
    } finally {
      output.mockRestore();
      await rm(root, { force: true, recursive: true });
    }
  });
});
