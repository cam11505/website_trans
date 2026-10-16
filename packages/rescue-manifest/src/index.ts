import { createHash, randomUUID } from 'node:crypto';
import { lstat, open, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  parseSite,
  siteSchemaVersionSchema,
  type Site,
} from '@site-rescue/content-schema';
import { createMigrationReport, renderMigrationReportMarkdown, createLegacyMigrationReport,
  renderLegacyMigrationReportMarkdown, readAcquisitionEvidence } from '@site-rescue/report';
import {
  verifyStaticSite,
  type VerifyStaticSiteResult,
} from '@site-rescue/static-verifier';

export const CURRENT_RESCUE_MANIFEST_VERSION = '1.0.0' as const;
export const RESCUE_MANIFEST_FILENAME = 'rescue-manifest.json' as const;
export const DEFAULT_MAX_BUNDLE_FILES = 100_000;

export type RescueManifestFileRole = 'capture' | 'site' | 'report';

export interface RescueManifestFile {
  path: string;
  role: RescueManifestFileRole;
  size: number;
  sha256: string;
}

export interface RescueManifest {
  manifestVersion: typeof CURRENT_RESCUE_MANIFEST_VERSION;
  schemaVersion: Site['schemaVersion'];
  source: Site['source'];
  files: RescueManifestFile[];
}

export interface RescueManifestOptions {
  maxFiles?: number;
}

export interface WriteRescueManifestResult {
  directory: string;
  manifestFile: string;
  manifest: RescueManifest;
  fileCount: number;
  totalBytes: number;
  staticVerification: VerifyStaticSiteResult;
}

export interface BundleVerificationIssue {
  code:
    | 'missing-file'
    | 'unexpected-file'
    | 'size-mismatch'
    | 'checksum-mismatch'
    | 'artifact-validation-failed'
    | 'source-mismatch';
  path: string;
  message: string;
}

export interface VerifyRescueBundleResult {
  directory: string;
  manifestFile: string;
  fileCount: number;
  totalBytes: number;
  issueCount: number;
  valid: boolean;
  issues: BundleVerificationIssue[];
  staticVerification?: VerifyStaticSiteResult;
}

interface CollectedFile {
  path: string;
  role?: RescueManifestFileRole;
  size: number;
  sha256: string;
}

interface ValidatedArtifacts {
  site: Site;
  staticVerification: VerifyStaticSiteResult;
}

const BUNDLE_DIRECTORIES = ['capture', 'site', 'report'] as const;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function roleForTopLevelName(name: string): RescueManifestFileRole | undefined {
  return BUNDLE_DIRECTORIES.find((directory) => directory === name);
}

function assertSafeManifestPath(path: string, role: RescueManifestFileRole): void {
  if (
    path.length === 0 ||
    path.includes('\\') ||
    path.includes('\0') ||
    path.startsWith('/') ||
    path.endsWith('/')
  ) {
    throw new Error(`Unsafe bundle manifest path: ${path}`);
  }
  const segments = path.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`Unsafe bundle manifest path: ${path}`);
  }
  if (segments[0] !== role || path === RESCUE_MANIFEST_FILENAME) {
    throw new Error(`Bundle manifest role does not match path: ${path}`);
  }
}

function parseSource(value: unknown): Site['source'] {
  if (!isRecord(value)) {
    throw new Error('Bundle manifest source must be an object.');
  }
  const adapter = value.adapter;
  const baseUrl = value.baseUrl;
  const capturedAt = value.capturedAt;
  if (
    typeof adapter !== 'string' ||
    adapter.length === 0 ||
    typeof baseUrl !== 'string' ||
    typeof capturedAt !== 'string'
  ) {
    throw new Error('Bundle manifest source is invalid.');
  }
  try {
    new URL(baseUrl);
  } catch {
    throw new Error('Bundle manifest source URL is invalid.');
  }
  if (Number.isNaN(Date.parse(capturedAt))) {
    throw new Error('Bundle manifest capture timestamp is invalid.');
  }
  return { adapter, baseUrl, capturedAt };
}

export function parseRescueManifest(value: unknown): RescueManifest {
  if (!isRecord(value)) {
    throw new Error('Bundle manifest must be an object.');
  }
  if (value.manifestVersion !== CURRENT_RESCUE_MANIFEST_VERSION) {
    throw new Error(`Unsupported bundle manifest version: ${String(value.manifestVersion)}`);
  }
  const schemaVersion = siteSchemaVersionSchema.safeParse(value.schemaVersion);
  if (!schemaVersion.success) {
    throw new Error(`Unsupported site schema version: ${String(value.schemaVersion)}`);
  }
  if (!Array.isArray(value.files)) {
    throw new Error('Bundle manifest files must be an array.');
  }

  const seenPaths = new Set<string>();
  const files = value.files.map((entry): RescueManifestFile => {
    if (!isRecord(entry)) {
      throw new Error('Bundle manifest file entry must be an object.');
    }
    const path = entry.path;
    const role = entry.role;
    const size = entry.size;
    const sha256 = entry.sha256;
    if (
      typeof path !== 'string' ||
      (role !== 'capture' && role !== 'site' && role !== 'report') ||
      typeof size !== 'number' ||
      !Number.isSafeInteger(size) ||
      size < 0 ||
      typeof sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(sha256)
    ) {
      throw new Error('Bundle manifest file entry is invalid.');
    }
    assertSafeManifestPath(path, role);
    if (seenPaths.has(path)) {
      throw new Error(`Bundle manifest contains a duplicate path: ${path}`);
    }
    seenPaths.add(path);
    return { path, role, size, sha256 };
  });

  const sortedPaths = files.map((entry) => entry.path).sort(compareText);
  if (files.some((entry, index) => entry.path !== sortedPaths[index])) {
    throw new Error('Bundle manifest files are not in canonical path order.');
  }

  return {
    manifestVersion: CURRENT_RESCUE_MANIFEST_VERSION,
    schemaVersion: schemaVersion.data,
    source: parseSource(value.source),
    files,
  };
}

function normalizeMaxFiles(value: number | undefined): number {
  const maxFiles = value ?? DEFAULT_MAX_BUNDLE_FILES;
  if (!Number.isSafeInteger(maxFiles) || maxFiles < 1) {
    throw new Error('Bundle maxFiles must be a positive integer.');
  }
  return maxFiles;
}

async function hashRegularFile(path: string): Promise<{ size: number; sha256: string }> {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink()) {
    throw new Error(`Bundle entry is not a regular file: ${path}`);
  }
  const handle = await open(path, 'r');
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let size = 0;
  try {
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) {
        break;
      }
      hash.update(buffer.subarray(0, bytesRead));
      size += bytesRead;
    }
  } finally {
    await handle.close();
  }
  const after = await lstat(path);
  if (!after.isFile() || after.isSymbolicLink() || before.size !== after.size || size !== after.size) {
    throw new Error(`Bundle file changed while it was being read: ${path}`);
  }
  return { size, sha256: hash.digest('hex') };
}

async function collectBundleFiles(
  directory: string,
  options: { allowUnexpected: boolean; maxFiles: number },
): Promise<CollectedFile[]> {
  const root = resolve(directory);
  const rootInformation = await lstat(root);
  if (!rootInformation.isDirectory() || rootInformation.isSymbolicLink()) {
    throw new Error(`Rescue bundle root is not a regular directory: ${root}`);
  }

  const files: CollectedFile[] = [];
  const visit = async (
    current: string,
    relativePath: string,
    role: RescueManifestFileRole | undefined,
  ): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => compareText(left.name, right.name));
    for (const entry of entries) {
      const childRelative = relativePath === '' ? entry.name : `${relativePath}/${entry.name}`;
      const target = resolve(current, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Symbolic links are not allowed in rescue bundles: ${childRelative}`);
      }
      if (entry.isDirectory()) {
        await visit(target, childRelative, role);
        continue;
      }
      if (!entry.isFile()) {
        throw new Error(`Unsupported filesystem entry in rescue bundle: ${childRelative}`);
      }
      files.push({ path: childRelative, role, ...(await hashRegularFile(target)) });
      if (files.length > options.maxFiles) {
        throw new Error(`Rescue bundle exceeds the ${options.maxFiles} file limit.`);
      }
    }
  };

  const rootEntries = await readdir(root, { withFileTypes: true });
  rootEntries.sort((left, right) => compareText(left.name, right.name));
  const presentDirectories = new Set<string>();
  for (const entry of rootEntries) {
    if (entry.name === RESCUE_MANIFEST_FILENAME) {
      if (entry.isSymbolicLink() || !entry.isFile()) {
        throw new Error(`${RESCUE_MANIFEST_FILENAME} must be a regular file.`);
      }
      continue;
    }
    const target = resolve(root, entry.name);
    const role = roleForTopLevelName(entry.name);
    if (role !== undefined) {
      if (entry.isSymbolicLink() || !entry.isDirectory()) {
        throw new Error(`Bundle entry must be a directory: ${entry.name}`);
      }
      presentDirectories.add(entry.name);
      await visit(target, entry.name, role);
      continue;
    }
    if (!options.allowUnexpected) {
      throw new Error(`Unexpected top-level bundle entry: ${entry.name}`);
    }
    if (entry.isSymbolicLink()) {
      throw new Error(`Symbolic links are not allowed in rescue bundles: ${entry.name}`);
    }
    if (entry.isDirectory()) {
      await visit(target, entry.name, undefined);
    } else if (entry.isFile()) {
      files.push({ path: entry.name, ...(await hashRegularFile(target)) });
      if (files.length > options.maxFiles) {
        throw new Error(`Rescue bundle exceeds the ${options.maxFiles} file limit.`);
      }
    } else {
      throw new Error(`Unsupported filesystem entry in rescue bundle: ${entry.name}`);
    }
  }

  if (!options.allowUnexpected) {
    for (const directoryName of BUNDLE_DIRECTORIES) {
      if (!presentDirectories.has(directoryName)) {
        throw new Error(`Rescue bundle is missing the ${directoryName}/ directory.`);
      }
    }
  }
  return files.sort((left, right) => compareText(left.path, right.path));
}

async function validateArtifacts(directory: string): Promise<ValidatedArtifacts> {
  const root = resolve(directory);
  const captureFile = resolve(root, 'capture', 'site.json');
  const site = parseSite(JSON.parse(await readFile(captureFile, 'utf8')) as unknown);
  const actualReportJson = await readFile(resolve(root, 'report', 'migration-report.json'), 'utf8');
  const actualReportMarkdown = await readFile(
    resolve(root, 'report', 'migration-report.md'),
    'utf8',
  );
  const actualReport: unknown = JSON.parse(actualReportJson);
  if (!isRecord(actualReport) || !['1.0.0', '2.0.0'].includes(String(actualReport.reportVersion))) throw new Error('Unsupported migration report version.');
  const staticVerification = await verifyStaticSite(resolve(root, 'site'));
  let expectedJson: string;
  let expectedMarkdown: string;
  if (actualReport.reportVersion === '1.0.0') {
    const legacy = createLegacyMigrationReport(site);
    expectedJson = `${JSON.stringify(legacy, null, 2)}\n`;
    expectedMarkdown = renderLegacyMigrationReportMarkdown(legacy);
  } else {
    const integrity = isRecord(actualReport.coverage) && isRecord(actualReport.coverage.staticIntegrity) ? actualReport.coverage.staticIntegrity : undefined;
    if (integrity === undefined || !['not-checked', 'valid', 'invalid'].includes(String(integrity.status))) throw new Error('Invalid report static integrity status.');
    const expected = createMigrationReport(site, {
      acquisitionEvidence: await readAcquisitionEvidence(resolve(root, 'capture'), site),
      staticVerification: integrity.status === 'not-checked' ? undefined : staticVerification,
    });
    expectedJson = `${JSON.stringify(expected, null, 2)}\n`;
    expectedMarkdown = renderMigrationReportMarkdown(expected);
  }
  if (actualReportJson !== expectedJson) {
    throw new Error('migration-report.json does not match capture/site.json.');
  }
  if (actualReportMarkdown !== expectedMarkdown) {
    throw new Error('migration-report.md does not match capture/site.json.');
  }
  if (!staticVerification.valid) {
    throw new Error(
      `Static site verification failed with ${staticVerification.issueCount} issue(s).`,
    );
  }
  return { site, staticVerification };
}

export async function buildRescueManifest(
  directory: string,
  options: RescueManifestOptions = {},
): Promise<{ manifest: RescueManifest; staticVerification: VerifyStaticSiteResult }> {
  const root = resolve(directory);
  const validated = await validateArtifacts(root);
  const collected = await collectBundleFiles(root, {
    allowUnexpected: false,
    maxFiles: normalizeMaxFiles(options.maxFiles),
  });
  const files = collected.map((entry): RescueManifestFile => {
    if (entry.role === undefined) {
      throw new Error(`Bundle file has no supported role: ${entry.path}`);
    }
    return {
      path: entry.path,
      role: entry.role,
      size: entry.size,
      sha256: entry.sha256,
    };
  });
  return {
    manifest: {
      manifestVersion: CURRENT_RESCUE_MANIFEST_VERSION,
      schemaVersion: validated.site.schemaVersion,
      source: validated.site.source,
      files,
    },
    staticVerification: validated.staticVerification,
  };
}

async function writeAtomically(target: string, contents: string): Promise<void> {
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, contents, 'utf8');
    await rm(target, { force: true });
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function writeRescueManifest(
  directory: string,
  options: RescueManifestOptions = {},
): Promise<WriteRescueManifestResult> {
  const root = resolve(directory);
  const result = await buildRescueManifest(root, options);
  const manifestFile = resolve(root, RESCUE_MANIFEST_FILENAME);
  await writeAtomically(manifestFile, `${JSON.stringify(result.manifest, null, 2)}\n`);
  return {
    directory: root,
    manifestFile,
    manifest: result.manifest,
    fileCount: result.manifest.files.length,
    totalBytes: result.manifest.files.reduce((total, entry) => total + entry.size, 0),
    staticVerification: result.staticVerification,
  };
}

export async function verifyRescueBundle(
  directory: string,
  options: RescueManifestOptions = {},
): Promise<VerifyRescueBundleResult> {
  const root = resolve(directory);
  const manifestFile = resolve(root, RESCUE_MANIFEST_FILENAME);
  const manifest = parseRescueManifest(
    JSON.parse(await readFile(manifestFile, 'utf8')) as unknown,
  );
  const actualFiles = await collectBundleFiles(root, {
    allowUnexpected: true,
    maxFiles: normalizeMaxFiles(options.maxFiles),
  });
  const actualByPath = new Map(actualFiles.map((entry) => [entry.path, entry]));
  const expectedByPath = new Map(manifest.files.map((entry) => [entry.path, entry]));
  const issues: BundleVerificationIssue[] = [];

  for (const expected of manifest.files) {
    const actual = actualByPath.get(expected.path);
    if (actual === undefined) {
      issues.push({
        code: 'missing-file',
        path: expected.path,
        message: 'File recorded in the bundle manifest is missing.',
      });
    } else if (actual.size !== expected.size) {
      issues.push({
        code: 'size-mismatch',
        path: expected.path,
        message: `Expected ${expected.size} bytes but found ${actual.size}.`,
      });
    } else if (actual.sha256 !== expected.sha256) {
      issues.push({
        code: 'checksum-mismatch',
        path: expected.path,
        message: 'SHA-256 checksum does not match the bundle manifest.',
      });
    }
  }
  for (const actual of actualFiles) {
    if (!expectedByPath.has(actual.path)) {
      issues.push({
        code: 'unexpected-file',
        path: actual.path,
        message: 'File is not recorded in the bundle manifest.',
      });
    }
  }

  let staticVerification: VerifyStaticSiteResult | undefined;
  if (issues.length === 0) {
    try {
      const validated = await validateArtifacts(root);
      staticVerification = validated.staticVerification;
      if (
        validated.site.schemaVersion !== manifest.schemaVersion ||
        validated.site.source.adapter !== manifest.source.adapter ||
        validated.site.source.baseUrl !== manifest.source.baseUrl ||
        validated.site.source.capturedAt !== manifest.source.capturedAt
      ) {
        issues.push({
          code: 'source-mismatch',
          path: 'capture/site.json',
          message: 'Bundle manifest schema version or source metadata does not match the validated capture.',
        });
      }
    } catch (error) {
      issues.push({
        code: 'artifact-validation-failed',
        path: '.',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  issues.sort((left, right) => compareText(left.path, right.path) || compareText(left.code, right.code));
  return {
    directory: root,
    manifestFile,
    fileCount: actualFiles.length,
    totalBytes: actualFiles.reduce((total, entry) => total + entry.size, 0),
    issueCount: issues.length,
    valid: issues.length === 0,
    issues,
    ...(staticVerification === undefined ? {} : { staticVerification }),
  };
}
