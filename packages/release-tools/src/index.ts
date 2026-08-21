import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { build, type BuildOptions } from 'esbuild';

const IGNORED_DIRECTORIES = new Set([
  '.git',
  'coverage',
  'dist',
  'node_modules',
  'release',
]);
const REQUIRED_DOCUMENTS = ['README.md', 'CHANGELOG.md', 'SECURITY.md'] as const;

interface PackageMetadata {
  name?: unknown;
  version?: unknown;
  private?: unknown;
  description?: unknown;
  engines?: unknown;
  license?: unknown;
}

export interface BuildReleasePackageOptions {
  outputDirectory?: string;
  bundler?: (options: BuildOptions) => Promise<unknown>;
}

export interface BuildReleasePackageResult {
  outputDirectory: string;
  checksumFile: string;
  fileCount: number;
  version: string;
}

export interface VerifyReleasePackageResult {
  outputDirectory: string;
  fileCount: number;
  version: string;
  helpSmokePassed: true;
  reportSmokePassed: true;
  versionSmokePassed: true;
}

async function readJson(path: string): Promise<PackageMetadata> {
  return JSON.parse(await readFile(path, 'utf8')) as PackageMetadata;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} must be a non-empty string.`);
  }
  return value;
}

function portablePath(path: string): string {
  return path.split(sep).join('/');
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertSafeOutputDirectory(repositoryRoot: string, outputDirectory: string): void {
  const releaseRoot = resolve(repositoryRoot, 'release');
  if (
    outputDirectory === releaseRoot ||
    !outputDirectory.startsWith(`${releaseRoot}${sep}`)
  ) {
    throw new Error(`Release output must be a child of ${releaseRoot}.`);
  }
}

async function collectPackageManifests(directory: string): Promise<string[]> {
  const manifests: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || IGNORED_DIRECTORIES.has(entry.name)) {
      continue;
    }
    const child = join(directory, entry.name);
    try {
      const packageFile = join(child, 'package.json');
      if ((await lstat(packageFile)).isFile()) {
        manifests.push(packageFile);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
    manifests.push(...(await collectPackageManifests(child)));
  }
  return manifests;
}

async function validateWorkspaceVersions(repositoryRoot: string): Promise<{
  rootMetadata: PackageMetadata;
  version: string;
}> {
  const rootPackageFile = join(repositoryRoot, 'package.json');
  const rootMetadata = await readJson(rootPackageFile);
  const version = requireString(rootMetadata.version, 'Root package version');
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)) {
    throw new Error(`Root package version is not a supported semantic version: ${version}`);
  }
  const manifests = [
    rootPackageFile,
    ...(await collectPackageManifests(join(repositoryRoot, 'apps'))),
    ...(await collectPackageManifests(join(repositoryRoot, 'packages'))),
  ];
  for (const manifest of manifests) {
    const metadata = await readJson(manifest);
    if (metadata.version !== version) {
      throw new Error(
        `Version mismatch in ${portablePath(relative(repositoryRoot, manifest))}: expected ${version}, received ${String(metadata.version)}.`,
      );
    }
    if (metadata.private !== true) {
      throw new Error(
        `Workspace package must remain private before the release policy changes: ${portablePath(relative(repositoryRoot, manifest))}.`,
      );
    }
  }
  return { rootMetadata, version };
}

async function listRegularFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listRegularFiles(path)));
    } else if (entry.isFile()) {
      files.push(path);
    } else {
      throw new Error(`Release package contains a non-regular entry: ${path}`);
    }
  }
  return files.sort((left, right) => portablePath(left).localeCompare(portablePath(right)));
}

async function writeChecksums(outputDirectory: string): Promise<{
  checksumFile: string;
  fileCount: number;
}> {
  const checksumFile = join(outputDirectory, 'SHA256SUMS.txt');
  const files = (await listRegularFiles(outputDirectory)).filter(
    (path) => path !== checksumFile,
  );
  const lines: string[] = [];
  for (const file of files) {
    lines.push(
      `${sha256(await readFile(file))}  ${portablePath(relative(outputDirectory, file))}`,
    );
  }
  await writeFile(checksumFile, `${lines.join('\n')}\n`, 'utf8');
  return { checksumFile, fileCount: files.length };
}

export async function buildReleasePackage(
  repositoryRoot: string,
  options: BuildReleasePackageOptions = {},
): Promise<BuildReleasePackageResult> {
  const root = resolve(repositoryRoot);
  const outputDirectory = resolve(options.outputDirectory ?? join(root, 'release', 'package'));
  assertSafeOutputDirectory(root, outputDirectory);
  await rm(outputDirectory, { force: true, recursive: true });
  await mkdir(dirname(outputDirectory), { recursive: true });
  const stagingDirectory = join(
    dirname(outputDirectory),
    `.${basename(outputDirectory)}.${randomUUID()}.tmp`,
  );
  try {
    const { rootMetadata, version } = await validateWorkspaceVersions(root);
    for (const document of REQUIRED_DOCUMENTS) {
      await lstat(join(root, document));
    }
    const binDirectory = join(stagingDirectory, 'bin');
    await mkdir(binDirectory, { recursive: true });
    const cliFile = join(binDirectory, 'site-rescue.js');
    await (options.bundler ?? build)({
      absWorkingDir: root,
      banner: {
        js: "import { createRequire as __siteRescueCreateRequire } from 'node:module'; const require = __siteRescueCreateRequire(import.meta.url);",
      },
      bundle: true,
      entryPoints: ['apps/cli/src/index.ts'],
      format: 'esm',
      legalComments: 'none',
      logLevel: 'silent',
      outfile: cliFile,
      platform: 'node',
      sourcemap: 'external',
      sourcesContent: false,
      target: 'node20.19',
    });
    await chmod(cliFile, 0o755);

    for (const document of REQUIRED_DOCUMENTS) {
      await copyFile(join(root, document), join(stagingDirectory, document));
    }
    let license = 'UNLICENSED';
    try {
      await copyFile(join(root, 'LICENSE'), join(stagingDirectory, 'LICENSE'));
      license = requireString(rootMetadata.license, 'Root package license');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    const releaseMetadata = {
      name: 'site-rescue',
      version,
      private: true,
      description: requireString(rootMetadata.description, 'Root package description'),
      type: 'module',
      bin: { 'site-rescue': './bin/site-rescue.js' },
      engines: rootMetadata.engines,
      license,
      repository: {
        type: 'git',
        url: 'git+https://github.com/cam11505/website_trans.git',
      },
      homepage: 'https://github.com/cam11505/website_trans#readme',
      bugs: { url: 'https://github.com/cam11505/website_trans/issues' },
    };
    await writeFile(
      join(stagingDirectory, 'package.json'),
      `${JSON.stringify(releaseMetadata, null, 2)}\n`,
      'utf8',
    );
    const checksums = await writeChecksums(stagingDirectory);
    await rename(stagingDirectory, outputDirectory);
    return {
      outputDirectory,
      version,
      checksumFile: join(outputDirectory, basename(checksums.checksumFile)),
      fileCount: checksums.fileCount,
    };
  } catch (error) {
    await rm(stagingDirectory, { force: true, recursive: true });
    throw error;
  }
}

function runNode(cliFile: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolveRun, rejectRun) => {
    execFile(
      process.execPath,
      [cliFile, ...args],
      { encoding: 'utf8', windowsHide: true },
      (error, stdout, stderr) => {
        if (error !== null) {
          rejectRun(
            new Error(`Release CLI failed: ${stderr.trim() || error.message}`, {
              cause: error,
            }),
          );
          return;
        }
        resolveRun({ stdout, stderr });
      },
    );
  });
}

export async function verifyReleasePackage(
  repositoryRoot: string,
  outputDirectory = join(repositoryRoot, 'release', 'package'),
): Promise<VerifyReleasePackageResult> {
  const root = resolve(repositoryRoot);
  const output = resolve(outputDirectory);
  assertSafeOutputDirectory(root, output);
  const { version } = await validateWorkspaceVersions(root);
  const metadata = await readJson(join(output, 'package.json'));
  if (
    metadata.name !== 'site-rescue' ||
    metadata.version !== version ||
    metadata.private !== true
  ) {
    throw new Error('Release package metadata does not match the workspace version.');
  }

  const checksumFile = join(output, 'SHA256SUMS.txt');
  const checksumLines = (await readFile(checksumFile, 'utf8'))
    .split(/\r?\n/u)
    .filter((line) => line !== '');
  const expected = new Map<string, string>();
  for (const line of checksumLines) {
    const match = /^([a-f0-9]{64}) {2}([^\\]+)$/u.exec(line);
    if (match === null || match[1] === undefined || match[2] === undefined) {
      throw new Error(`Invalid checksum entry: ${line}`);
    }
    if (expected.has(match[2])) {
      throw new Error(`Duplicate checksum entry: ${match[2]}`);
    }
    expected.set(match[2], match[1]);
  }
  const files = (await listRegularFiles(output)).filter((path) => path !== checksumFile);
  const actualPaths = files.map((path) => portablePath(relative(output, path)));
  if (
    actualPaths.length !== expected.size ||
    actualPaths.some((path) => !expected.has(path))
  ) {
    throw new Error('Release package files do not match SHA256SUMS.txt.');
  }
  for (const file of files) {
    const path = portablePath(relative(output, file));
    if (sha256(await readFile(file)) !== expected.get(path)) {
      throw new Error(`Release package checksum mismatch: ${path}`);
    }
  }

  const cliFile = join(output, 'bin', 'site-rescue.js');
  const versionRun = await runNode(cliFile, ['--version']);
  if (versionRun.stderr !== '' || versionRun.stdout.trim() !== version) {
    throw new Error('Release CLI --version output does not match the package version.');
  }
  const helpRun = await runNode(cliFile, ['--help']);
  if (
    helpRun.stderr !== '' ||
    !helpRun.stdout.includes('Usage:') ||
    !helpRun.stdout.includes('site-rescue rescue <url>')
  ) {
    throw new Error('Release CLI --help smoke test failed.');
  }

  const smokeDirectory = await mkdtemp(join(dirname(output), '.site-rescue-smoke-'));
  try {
    const captureFile = join(smokeDirectory, 'site.json');
    const reportDirectory = join(smokeDirectory, 'report');
    await writeFile(
      captureFile,
      `${JSON.stringify({
        schemaVersion: '1.0.0',
        source: {
          adapter: 'release-smoke',
          baseUrl: 'https://release-smoke.test/',
          capturedAt: '2026-08-22T00:00:00.000Z',
        },
        metadata: { title: 'Release smoke' },
        navigation: [],
        pages: [
          {
            id: 'page-0001',
            sourceUrl: 'https://release-smoke.test/',
            sourcePath: '/',
            targetPath: '/',
            title: 'Release smoke',
            blocks: [],
          },
        ],
        assets: [],
        redirects: [],
        warnings: [],
      })}\n`,
      'utf8',
    );
    const reportRun = await runNode(cliFile, [
      'report',
      captureFile,
      '--output',
      reportDirectory,
    ]);
    if (
      reportRun.stderr !== '' ||
      !reportRun.stdout.includes('Site Rescue migration report complete')
    ) {
      throw new Error('Release CLI report fixture smoke test failed.');
    }
    const report = JSON.parse(
      await readFile(join(reportDirectory, 'migration-report.json'), 'utf8'),
    ) as { reportVersion?: unknown; summary?: { pageCount?: unknown } };
    if (report.reportVersion !== '1.0.0' || report.summary?.pageCount !== 1) {
      throw new Error('Release CLI report fixture output is invalid.');
    }
  } finally {
    await rm(smokeDirectory, { force: true, recursive: true });
  }

  return {
    outputDirectory: output,
    fileCount: files.length,
    version,
    helpSmokePassed: true,
    reportSmokePassed: true,
    versionSmokePassed: true,
  };
}
