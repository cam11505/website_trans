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
const REQUIRED_PROJECT_FILES = [
  'README.md',
  'CHANGELOG.md',
  'SECURITY.md',
  'LICENSE',
] as const;

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
  thirdPartyPackageCount: number;
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
  if (rootMetadata.license !== 'Apache-2.0') {
    throw new Error('Root package license must use the Apache-2.0 SPDX identifier.');
  }
  const licenseText = await readFile(join(repositoryRoot, 'LICENSE'), 'utf8');
  if (
    !licenseText.includes('Apache License') ||
    !licenseText.includes('Version 2.0, January 2004') ||
    !licenseText.includes('END OF TERMS AND CONDITIONS')
  ) {
    throw new Error('LICENSE does not contain the expected Apache License 2.0 text.');
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
    if (metadata.license !== 'Apache-2.0') {
      throw new Error(
        `License mismatch in ${portablePath(relative(repositoryRoot, manifest))}: expected Apache-2.0.`,
      );
    }
  }
  return { rootMetadata, version };
}

function packageRootFromInput(repositoryRoot: string, input: string): string | undefined {
  const path = input.replaceAll('\\', '/');
  const pnpmMatch = /^(.*node_modules\/\.pnpm\/[^/]+\/node_modules\/(?:@[^/]+\/)?[^/]+)(?:\/|$)/u.exec(
    path,
  );
  const standardMatch = /^(.*node_modules\/(?:@[^/]+\/)?[^/]+)(?:\/|$)/u.exec(path);
  const packagePath = pnpmMatch?.[1] ?? standardMatch?.[1];
  return packagePath === undefined
    ? undefined
    : resolve(repositoryRoot, ...packagePath.split('/'));
}

async function findLicenseFile(packageRoot: string): Promise<string | undefined> {
  const candidates = (await readdir(packageRoot, { withFileTypes: true }))
    .filter(
      (entry) =>
        entry.isFile() && /^(?:licen[cs]e|copying)(?:[._-].*)?$/iu.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  const licenseFile = candidates[0];
  return licenseFile === undefined ? undefined : join(packageRoot, licenseFile);
}

async function findAuditedLicenseOverride(
  repositoryRoot: string,
  name: string,
  version: string,
): Promise<string | undefined> {
  const override = join(
    repositoryRoot,
    'third_party',
    'licenses',
    `${encodeURIComponent(name)}@${encodeURIComponent(version)}.txt`,
  );
  try {
    const entry = await lstat(override);
    if (!entry.isFile()) {
      throw new Error(`Audited license override is not a regular file: ${override}`);
    }
    return override;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

async function findNoticeFile(packageRoot: string): Promise<string | undefined> {
  const notice = (await readdir(packageRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^notice(?:[._-].*)?$/iu.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))[0];
  return notice === undefined ? undefined : join(packageRoot, notice);
}

async function writeThirdPartyNotices(
  repositoryRoot: string,
  outputDirectory: string,
  inputs: readonly string[],
): Promise<number> {
  const packageRoots = new Set<string>();
  for (const input of inputs) {
    const packageRoot = packageRootFromInput(repositoryRoot, input);
    if (packageRoot !== undefined) {
      packageRoots.add(packageRoot);
    }
  }
  const notices: Array<{
    license: string;
    licenseSource: string;
    name: string;
    noticeFile?: string;
    noticeText?: string;
    text: string;
    version: string;
  }> = [];
  const missingLicenseFiles: string[] = [];
  for (const packageRoot of packageRoots) {
    const metadata = await readJson(join(packageRoot, 'package.json'));
    const name = requireString(metadata.name, 'Bundled package name');
    const version = requireString(metadata.version, 'Bundled package version');
    const license = requireString(metadata.license, 'Bundled package license');
    let licenseFile = await findLicenseFile(packageRoot);
    let licenseSource: string;
    if (licenseFile === undefined) {
      licenseFile = await findAuditedLicenseOverride(repositoryRoot, name, version);
      if (licenseFile === undefined) {
        missingLicenseFiles.push(`${name}@${version}`);
        continue;
      }
      licenseSource = `audited override: ${portablePath(relative(repositoryRoot, licenseFile))}`;
    } else {
      licenseSource = `published package file: ${basename(licenseFile)}`;
    }
    const noticeFile = await findNoticeFile(packageRoot);
    const licenseText = requireString(
      await readFile(licenseFile, 'utf8'),
      `${name}@${version} license text`,
    );
    notices.push({
      name,
      version,
      license,
      licenseSource,
      text: licenseText.trimEnd(),
      ...(noticeFile === undefined
        ? {}
        : {
            noticeFile: basename(noticeFile),
            noticeText: (await readFile(noticeFile, 'utf8')).trimEnd(),
      }),
    });
  }
  if (missingLicenseFiles.length > 0) {
    throw new Error(
      `Bundled dependencies have neither packaged nor audited license files: ${missingLicenseFiles.sort().join(', ')}`,
    );
  }
  notices.sort((left, right) =>
    `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`),
  );
  const sections = notices.map(
    (notice) =>
      `${'='.repeat(80)}\n${notice.name}@${notice.version}\nDeclared license: ${notice.license}\nLicense source: ${notice.licenseSource}\n${'-'.repeat(80)}\n${notice.text}${notice.noticeText === undefined ? '' : `\n\nThird-party NOTICE file: ${notice.noticeFile}\n${'-'.repeat(80)}\n${notice.noticeText}`}`,
  );
  const introduction =
    'THIRD-PARTY NOTICES\n\nSite Rescue bundles the following third-party runtime packages. These components remain subject to their own license terms; the Apache-2.0 license for Site Rescue does not replace them.';
  await writeFile(
    join(outputDirectory, 'THIRD_PARTY_NOTICES.txt'),
    `${introduction}${sections.length === 0 ? '\n\nNo third-party runtime packages were bundled.' : `\n\n${sections.join('\n\n')}`}\n`,
    'utf8',
  );
  return notices.length;
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
    for (const file of REQUIRED_PROJECT_FILES) {
      await lstat(join(root, file));
    }
    const binDirectory = join(stagingDirectory, 'bin');
    await mkdir(binDirectory, { recursive: true });
    const cliFile = join(binDirectory, 'site-rescue.js');
    const bundleResult = await (options.bundler ?? build)({
      absWorkingDir: root,
      banner: {
        js: "import { createRequire as __siteRescueCreateRequire } from 'node:module'; const require = __siteRescueCreateRequire(import.meta.url);",
      },
      bundle: true,
      entryPoints: ['apps/cli/src/index.ts'],
      format: 'esm',
      legalComments: 'eof',
      logLevel: 'silent',
      metafile: true,
      outfile: cliFile,
      platform: 'node',
      sourcemap: 'external',
      sourcesContent: false,
      target: 'node20.19',
    });
    await chmod(cliFile, 0o755);

    for (const file of REQUIRED_PROJECT_FILES) {
      await copyFile(join(root, file), join(stagingDirectory, file));
    }
    if (
      typeof bundleResult !== 'object' ||
      bundleResult === null ||
      !('metafile' in bundleResult) ||
      typeof bundleResult.metafile !== 'object' ||
      bundleResult.metafile === null ||
      !('inputs' in bundleResult.metafile) ||
      typeof bundleResult.metafile.inputs !== 'object' ||
      bundleResult.metafile.inputs === null
    ) {
      throw new Error('Bundler did not return an esbuild metafile.');
    }
    const thirdPartyPackageCount = await writeThirdPartyNotices(
      root,
      stagingDirectory,
      Object.keys(bundleResult.metafile.inputs),
    );

    const releaseMetadata = {
      name: 'site-rescue',
      version,
      private: true,
      description: requireString(rootMetadata.description, 'Root package description'),
      type: 'module',
      bin: { 'site-rescue': './bin/site-rescue.js' },
      engines: rootMetadata.engines,
      license: requireString(rootMetadata.license, 'Root package license'),
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
      thirdPartyPackageCount,
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
    metadata.private !== true ||
    metadata.license !== 'Apache-2.0'
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
    ) as { reportVersion?: unknown; readiness?: unknown; summary?: { pageCount?: unknown }; coverage?: { staticIntegrity?: { status?: unknown }; manualReview?: { status?: unknown } } };
    if (report.reportVersion !== '2.0.0' || report.summary?.pageCount !== 1 || report.readiness !== 'review-required' ||
      report.coverage?.staticIntegrity?.status !== 'not-checked' || report.coverage?.manualReview?.status !== 'not-assessed') {
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
