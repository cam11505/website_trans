import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BuildOptions } from 'esbuild';
import { buildReleasePackage, verifyReleasePackage } from '../src/index.js';

function fixtureBundler(root: string): (options: BuildOptions) => Promise<void> {
  return async (options) => {
    if (typeof options.outfile !== 'string') {
      throw new Error('Fixture bundler requires an outfile.');
    }
    await writeFile(
      options.outfile,
      await readFile(join(root, 'apps', 'cli', 'src', 'index.ts'), 'utf8'),
      'utf8',
    );
    await writeFile(`${options.outfile}.map`, '{}\n', 'utf8');
  };
}

async function createRepository(version = '0.1.0'): Promise<string> {
  const root = await mkdtemp(join(process.cwd(), '.tmp-release-tools-'));
  await mkdir(join(root, 'apps', 'cli', 'src'), { recursive: true });
  await mkdir(join(root, 'packages', 'fixture'), { recursive: true });
  await writeFile(
    join(root, 'package.json'),
    `${JSON.stringify({
      name: 'site-rescue',
      version,
      private: true,
      description: 'Release fixture',
      engines: { node: '>=20.19.0' },
    })}\n`,
    'utf8',
  );
  await writeFile(
    join(root, 'apps', 'cli', 'package.json'),
    `${JSON.stringify({ name: '@site-rescue/cli', version, private: true })}\n`,
    'utf8',
  );
  await writeFile(
    join(root, 'packages', 'fixture', 'package.json'),
    `${JSON.stringify({ name: '@site-rescue/fixture', version, private: true })}\n`,
    'utf8',
  );
  await writeFile(
    join(root, 'apps', 'cli', 'src', 'index.ts'),
    `#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const args = process.argv.slice(2);
if (args.includes('--version')) {
  console.log('${version}');
} else if (args.includes('--help')) {
  console.log('Usage:\\n  site-rescue rescue <url>');
} else if (args[0] === 'report') {
  const output = args[args.indexOf('--output') + 1];
  await mkdir(output, { recursive: true });
  await writeFile(
    join(output, 'migration-report.json'),
    JSON.stringify({ reportVersion: '1.0.0', summary: { pageCount: 1 } }),
    'utf8',
  );
  console.log('Site Rescue migration report complete');
} else {
  process.exitCode = 1;
}
`,
    'utf8',
  );
  for (const document of ['README.md', 'CHANGELOG.md', 'SECURITY.md']) {
    await writeFile(join(root, document), `# ${document}\n`, 'utf8');
  }
  return root;
}

describe('release tools', () => {
  it('builds and verifies a self-contained CLI package', async () => {
    const root = await createRepository();
    try {
      const built = await buildReleasePackage(root, { bundler: fixtureBundler(root) });
      const verified = await verifyReleasePackage(root);
      const metadata = JSON.parse(
        await readFile(join(built.outputDirectory, 'package.json'), 'utf8'),
      ) as { license: string; private: boolean; version: string };

      expect(built.version).toBe('0.1.0');
      expect(verified).toMatchObject({
        version: '0.1.0',
        helpSmokePassed: true,
        reportSmokePassed: true,
        versionSmokePassed: true,
      });
      expect(metadata).toMatchObject({
        license: 'UNLICENSED',
        private: true,
        version: '0.1.0',
      });
      expect(await readFile(built.checksumFile, 'utf8')).toContain('bin/site-rescue.js');
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it('rejects inconsistent workspace versions before building', async () => {
    const root = await createRepository();
    try {
      await writeFile(
        join(root, 'packages', 'fixture', 'package.json'),
        `${JSON.stringify({ name: '@site-rescue/fixture', version: '0.2.0', private: true })}\n`,
        'utf8',
      );

      await expect(buildReleasePackage(root)).rejects.toThrow(
        'Version mismatch in packages/fixture/package.json',
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it('detects a modified release package file', async () => {
    const root = await createRepository();
    try {
      const built = await buildReleasePackage(root, { bundler: fixtureBundler(root) });
      await writeFile(join(built.outputDirectory, 'README.md'), 'modified\n', 'utf8');

      await expect(verifyReleasePackage(root)).rejects.toThrow(
        'Release package checksum mismatch: README.md',
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it('removes stale and partial output when package preparation fails', async () => {
    const root = await createRepository();
    const outputDirectory = join(root, 'release', 'package');
    try {
      await mkdir(outputDirectory, { recursive: true });
      await writeFile(join(outputDirectory, 'stale.txt'), 'stale\n', 'utf8');

      await expect(
        buildReleasePackage(root, {
          bundler: async () => {
            throw new Error('bundle failed');
          },
        }),
      ).rejects.toThrow('bundle failed');

      await expect(readFile(join(outputDirectory, 'stale.txt'), 'utf8')).rejects.toMatchObject({
        code: 'ENOENT',
      });
      expect(await readdir(join(root, 'release'))).toEqual([]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
