import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSite, type Site } from '@site-rescue/content-schema';
import { writeMigrationReport } from '@site-rescue/report';
import {
  parseRescueManifest,
  verifyRescueBundle,
  writeRescueManifest,
} from '../src/index.js';

const site: Site = parseSite({
  schemaVersion: '1.0.0',
  source: {
    adapter: 'fixture',
    baseUrl: 'https://example.test/',
    capturedAt: '2026-08-21T00:00:00.000Z',
  },
  metadata: { title: 'Bundle fixture' },
  navigation: [],
  pages: [
    {
      id: 'home',
      sourceUrl: 'https://example.test/',
      sourcePath: '/',
      targetPath: '/',
      title: 'Home',
      blocks: [{ type: 'heading', level: 1, text: 'Rescued' }],
    },
  ],
  assets: [],
  redirects: [],
  warnings: [],
});

async function createBundleFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'site-rescue-manifest-'));
  await mkdir(join(root, 'capture', 'assets'), { recursive: true });
  await mkdir(join(root, 'site'), { recursive: true });
  await writeFile(
    join(root, 'capture', 'site.json'),
    `${JSON.stringify(site, null, 2)}\n`,
    'utf8',
  );
  await writeFile(join(root, 'site', 'index.html'), '<h1>Rescued</h1>\n', 'utf8');
  await writeFile(join(root, 'site', 'style.css'), 'body{}\n', 'utf8');
  await writeMigrationReport(site, { outputDirectory: join(root, 'report') });
  return root;
}

describe('rescue bundle manifest', () => {
  it('writes a deterministic manifest and verifies the complete bundle offline', async () => {
    const root = await createBundleFixture();
    try {
      const first = await writeRescueManifest(root);
      const firstContents = await readFile(first.manifestFile, 'utf8');
      const second = await writeRescueManifest(root);
      const secondContents = await readFile(second.manifestFile, 'utf8');
      const verification = await verifyRescueBundle(root);

      expect(secondContents).toBe(firstContents);
      expect(first.manifest.schemaVersion).toBe('1.0.0');
      expect(first.manifest.files.map((entry) => entry.path)).toEqual([
        'capture/site.json',
        'report/migration-report.json',
        'report/migration-report.md',
        'site/index.html',
        'site/style.css',
      ]);
      expect(first.manifest.files.map((entry) => entry.role)).toEqual([
        'capture',
        'report',
        'report',
        'site',
        'site',
      ]);
      expect(first.fileCount).toBe(5);
      expect(second.totalBytes).toBe(first.totalBytes);
      expect(verification).toMatchObject({
        valid: true,
        issueCount: 0,
        fileCount: 5,
        staticVerification: { valid: true },
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it('detects modified, missing, and unexpected files', async () => {
    const root = await createBundleFixture();
    try {
      await writeRescueManifest(root);
      await writeFile(join(root, 'site', 'index.html'), '<h1>Much longer content</h1>\n', 'utf8');
      await writeFile(join(root, 'site', 'style.css'), 'html{}\n', 'utf8');
      await rm(join(root, 'report', 'migration-report.md'));
      await writeFile(join(root, 'capture', 'unexpected.txt'), 'unexpected', 'utf8');

      const result = await verifyRescueBundle(root);

      expect(result.valid).toBe(false);
      expect(result.issues.map((issue) => [issue.code, issue.path])).toEqual([
        ['unexpected-file', 'capture/unexpected.txt'],
        ['missing-file', 'report/migration-report.md'],
        ['size-mismatch', 'site/index.html'],
        ['checksum-mismatch', 'site/style.css'],
      ]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it('rejects a manifest whose supported schema version differs from its capture', async () => {
    const root = await createBundleFixture();
    try {
      const result = await writeRescueManifest(root);
      await writeFile(result.manifestFile, JSON.stringify({ ...result.manifest, schemaVersion: '1.1.0' }), 'utf8');
      const verification = await verifyRescueBundle(root);
      expect(verification).toMatchObject({ valid: false, issues: [
        { code: 'source-mismatch', path: 'capture/site.json', message: expect.stringContaining('schema version') },
      ] });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it('rejects stale reports and unsafe manifest paths', async () => {
    const root = await createBundleFixture();
    try {
      await writeFile(join(root, 'report', 'migration-report.md'), 'stale\n', 'utf8');
      await expect(writeRescueManifest(root)).rejects.toThrow(
        'migration-report.md does not match capture/site.json.',
      );
      expect(() =>
        parseRescueManifest({
          manifestVersion: '1.0.0',
          schemaVersion: '1.0.0',
          source: site.source,
          files: [
            {
              path: 'capture/../secret.txt',
              role: 'capture',
              size: 1,
              sha256: '0'.repeat(64),
            },
          ],
        }),
      ).toThrow('Unsafe bundle manifest path');
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it('refuses symbolic links anywhere in the bundle', async () => {
    const root = await createBundleFixture();
    const outside = await mkdtemp(join(tmpdir(), 'site-rescue-manifest-outside-'));
    await writeFile(join(outside, 'secret.txt'), 'secret', 'utf8');
    try {
      try {
        await symlink(
          outside,
          join(root, 'site', 'escape'),
          process.platform === 'win32' ? 'junction' : 'dir',
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EPERM') {
          return;
        }
        throw error;
      }
      await expect(writeRescueManifest(root)).rejects.toThrow(
        'Symbolic links are not allowed in rescue bundles: site/escape',
      );
    } finally {
      await rm(root, { force: true, recursive: true });
      await rm(outside, { force: true, recursive: true });
    }
  });
});
