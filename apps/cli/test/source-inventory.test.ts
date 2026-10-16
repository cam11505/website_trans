import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { main } from '../src/index.js';

interface Inventory {
  inventoryVersion: string;
  scope: string;
  reviewRequired: boolean;
  coverage: { fileEnumeration: string; referenceInspection: string; migration: string };
  files: { path: string; bytes: number; sha256: string }[];
  references: { sourcePath: string; value: string; status: string; targetPath?: string }[];
  warnings: { code: string; path?: string; message: string; action: string }[];
}

const fixture = join(process.cwd(), 'fixtures/shared/html-directory');
let workspace: string;
let source: string;
let output: string;

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'site-rescue-inventory-'));
  source = join(workspace, 'source');
  output = join(workspace, 'inventory');
  await cp(fixture, source, { recursive: true });
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Offline inventory must never fetch'); }));
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await rm(workspace, { recursive: true, force: true });
});

async function inspect(...options: string[]): Promise<number> {
  return main(['inspect-source', source, '--output', output, ...options]);
}

async function inventory(): Promise<Inventory> {
  return JSON.parse(await readFile(join(output, 'source-inventory.json'), 'utf8')) as Inventory;
}

describe('generic HTML directory inventory CLI', () => {
  it('inventories all source files without mutation, network access or a ready claim', async () => {
    const original = await readFile(join(source, 'index.html'));
    // Before SR-003 this is an unknown command and returns 1.
    expect(await inspect()).toBe(0);
    const result = await inventory();
    expect(result).toMatchObject({ inventoryVersion: '1.0.0', scope: 'inventory-only', reviewRequired: true,
      coverage: { fileEnumeration: 'complete', migration: 'not-assessed' } });
    expect(result.files.map((file) => file.path)).toEqual([
      'README.txt', 'assets/logo.svg', 'assets/site.css', 'assets/theme.css', 'guide/index.html', 'index.html',
    ]);
    for (const file of result.files) {
      const bytes = await readFile(join(source, file.path));
      expect(file.bytes).toBe(bytes.length);
      expect(file.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    }
    expect(await readFile(join(source, 'index.html'))).toEqual(original);
    expect((await readdir(source)).sort()).toEqual(['README.txt', 'assets', 'guide', 'index.html']);
    expect(result.references).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: '/guide/index.html#details', status: 'present', targetPath: 'guide/index.html' }),
      expect.objectContaining({ value: 'theme.css', status: 'present', targetPath: 'assets/theme.css' }),
      expect.objectContaining({ value: 'assets/missing.png', status: 'missing' }),
      expect.objectContaining({ value: 'missing-background.png', status: 'missing' }),
      expect.objectContaining({ value: 'https://external.example/help', status: 'external' }),
    ]));
    expect(result.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining([
      'inventory-only', 'missing-local-reference', 'active-content-not-inspected', 'query-reference-not-inspected',
    ]));
    expect(result.warnings.every((warning) => warning.action.length > 0)).toBe(true);
    expect(await readFile(join(output, 'source-inventory.md'), 'utf8')).toContain('Migration: not assessed');
    expect(fetch).not.toHaveBeenCalled();
    expect(await readdir(output)).toEqual(['source-inventory.json', 'source-inventory.md']);
  });

  it('produces byte-identical inventories for identical folders at different locations', async () => {
    expect(await inspect()).toBe(0);
    const second = join(workspace, 'second-source');
    const secondOutput = join(workspace, 'second-inventory');
    await cp(source, second, { recursive: true });
    expect(await main(['inspect-source', second, '--output', secondOutput])).toBe(0);
    for (const filename of ['source-inventory.json', 'source-inventory.md']) {
      expect(await readFile(join(output, filename))).toEqual(await readFile(join(secondOutput, filename)));
    }
  });

  it('warns on folders without HTML instead of claiming a supported backup', async () => {
    await rm(source, { recursive: true });
    await mkdir(source);
    await writeFile(join(source, 'opaque.dat'), 'unknown format');
    expect(await inspect()).toBe(0);
    expect((await inventory()).warnings.map((warning) => warning.code)).toContain('no-html-files');
    expect((await inventory()).reviewRequired).toBe(true);
  });

  it('rejects a ZIP file without creating output or extracting it', async () => {
    const archive = join(workspace, 'backup.zip');
    await writeFile(archive, 'not a supported archive');
    expect(await main(['inspect-source', archive, '--output', output])).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/HTML directory/iu));
    expect(await readdir(workspace)).toEqual(['backup.zip', 'source']);
  });

  it('rejects an output inside the source, including a missing parent path', async () => {
    output = join(source, 'new-parent', 'inventory');
    expect(await inspect()).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/separate/iu));
    expect((await readdir(source)).sort()).toEqual(['README.txt', 'assets', 'guide', 'index.html']);
  });

  it('does not overwrite existing output', async () => {
    await mkdir(output);
    await writeFile(join(output, 'keep.txt'), 'keep');
    expect(await inspect()).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/already exists/iu));
    expect(await readdir(output)).toEqual(['keep.txt']);
    expect(await readFile(join(output, 'keep.txt'), 'utf8')).toBe('keep');
  });

  it.each([
    ['--max-entries', '2'], ['--max-file-bytes', '5'], ['--max-total-bytes', '5'],
    ['--max-depth', '1'], ['--max-references', '1'],
  ])('fails closed when %s is exceeded', async (option, value) => {
    expect(await inspect(option, value)).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/limit/iu));
    expect(await readdir(workspace)).toEqual(['source']);
  });

  it('hashes large text but explicitly marks skipped reference inspection', async () => {
    expect(await inspect('--max-text-bytes', '16')).toBe(0);
    const result = await inventory();
    expect(result.files).toHaveLength(6);
    expect(result.coverage.referenceInspection).toBe('partial');
    expect(result.warnings.map((warning) => warning.code)).toContain('text-inspection-skipped');
  });

  it('reports escaping and malformed references without opening targets', async () => {
    await writeFile(join(source, 'bad.html'), '<a href="../outside-secret.txt">escape</a><img src="%2e%2e/outside-secret.txt"><a href="file:///etc/passwd">file</a><a href="javascript:alert(1)">active</a><img src="bad%zz.png"><img src="C:\\secret.txt">');
    await writeFile(join(workspace, 'outside-secret.txt'), 'must not be read');
    expect(await inspect()).toBe(0);
    const bad = (await inventory()).references.filter((reference) => reference.sourcePath === 'bad.html');
    expect(bad).toHaveLength(6);
    expect(bad.every((reference) => reference.status === 'unsafe')).toBe(true);
    expect((await inventory()).files.map((file) => file.path)).not.toContain('outside-secret.txt');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not fabricate local paths when base, srcset or invalid text prevents inspection', async () => {
    await writeFile(join(source, 'base.html'), '<base href="https://external.example/"><img src="assets/logo.svg"><img srcset="one.png 1x, two.png 2x">');
    await writeFile(join(source, 'invalid.html'), Buffer.from([0xff, 0xfe, 0xff]));
    expect(await inspect()).toBe(0);
    const result = await inventory();
    expect(result.references).toContainEqual(expect.objectContaining({ sourcePath: 'base.html', value: 'assets/logo.svg', status: 'unresolved' }));
    expect(result.coverage.referenceInspection).toBe('partial');
    expect(result.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining([
      'html-base-not-inspected', 'srcset-not-inspected', 'text-inspection-skipped',
    ]));
  });

  it('records unsupported encodings and malformed CSS without losing file evidence', async () => {
    await writeFile(join(source, 'latin.html'), '<meta charset="iso-8859-1"><img src="not-inferred.png">');
    await writeFile(join(source, 'latin.css'), '@charset "iso-8859-1"; body { background: url(not-inferred.png); }');
    await writeFile(join(source, 'broken.css'), 'body {');
    expect(await inspect()).toBe(0);
    const result = await inventory();
    expect(result.files).toHaveLength(9);
    expect(result.coverage.referenceInspection).toBe('partial');
    expect(result.references.map((reference) => reference.value)).not.toContain('not-inferred.png');
    expect(result.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining(['text-inspection-skipped', 'css-inspection-skipped']));
  });

  it('checks inline CSS and preserves unknown markup warnings', async () => {
    await writeFile(join(source, 'inline.html'), '<style>p { background: url(assets/logo.svg); }</style><p style="background: url(missing-inline.png)" onpointerenter="throw 1">text</p><svg><use href="icons.svg#x"/></svg>');
    expect(await inspect()).toBe(0);
    const result = await inventory();
    expect(result.references).toContainEqual(expect.objectContaining({ sourcePath: 'inline.html', value: 'assets/logo.svg', status: 'present' }));
    expect(result.references).toContainEqual(expect.objectContaining({ value: 'missing-inline.png', status: 'missing' }));
    expect(result.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining(['unsupported-reference-markup', 'active-content-not-inspected']));
  });

  it('handles custom element names that match object prototype properties', async () => {
    await writeFile(join(source, 'custom.html'), '<constructor href="custom-target.html">custom markup</constructor>');
    expect(await inspect()).toBe(0);
    expect((await inventory()).warnings.map((warning) => warning.code)).toContain('uninspected-url-attribute');
  });

  it('rejects output equal to the source or an existing ancestor', async () => {
    for (const target of [source, workspace]) {
      expect(await main(['inspect-source', source, '--output', target])).toBe(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/separate/iu));
    }
    expect(await readFile(join(source, 'README.txt'), 'utf8')).toContain('Synthetic fixture');
  });

  it('rejects directory symlinks/junctions before reading their targets', async () => {
    const outside = join(workspace, 'outside');
    await mkdir(outside);
    await writeFile(join(outside, 'private.html'), 'do not inspect');
    await symlink(outside, join(source, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    expect(await inspect()).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/symbolic link/iu));
    expect(await readdir(workspace)).toEqual(['outside', 'source']);
  });

  it('rejects a symlink/junction input root', async () => {
    const alias = join(workspace, 'alias');
    await symlink(source, alias, process.platform === 'win32' ? 'junction' : 'dir');
    expect(await main(['inspect-source', alias, '--output', output])).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/symbolic link/iu));
  });

  it('rejects an output parent alias into the source', async () => {
    const alias = join(workspace, 'alias');
    await symlink(source, alias, process.platform === 'win32' ? 'junction' : 'dir');
    output = join(alias, 'inventory');
    expect(await inspect()).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/separate/iu));
    expect(await readdir(source)).not.toContain('inventory');
  });

  it.runIf(process.platform !== 'win32')('rejects portable case collisions', async (context) => {
    await writeFile(join(source, 'INDEX.html'), 'duplicate on Windows');
    const names = await readdir(source);
    if (!names.includes('INDEX.html') || !names.includes('index.html')) {
      // Default macOS volumes cannot represent this fixture; Linux still exercises rejection.
      context.skip();
      return;
    }
    expect(await inspect()).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/collision/iu));
  });

  it.runIf(process.platform !== 'win32')('rejects non-portable filenames', async () => {
    await writeFile(join(source, 'CON.txt'), 'unsafe Windows name');
    expect(await inspect()).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/portable/iu));
  });

  it.runIf(process.platform === 'linux')('rejects a FIFO without opening or blocking on it', async () => {
    execFileSync('mkfifo', [join(source, 'pipe')]);
    expect(await inspect()).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/special source file/iu));
  });

  it.runIf(process.platform !== 'win32')('rejects a file symlink', async () => {
    await symlink(join(source, 'index.html'), join(source, 'alias.html'), 'file');
    expect(await inspect()).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/symbolic link/iu));
  });

  it.each([['--max-entries', '0'], ['--max-file-bytes', 'NaN'], ['--max-depth', '1.5'],
    ['--max-total-bytes', '9007199254740992'], ['--max-references', '-1'],
    ['--max-text-bytes'], ['--typo', '1'], ['--max-depth', '2', '--max-depth', '3']])(
    'rejects malformed, unknown or duplicate options: %s', async (...options) => {
      expect(await inspect(...options)).toBe(1);
      expect(await readdir(workspace)).toEqual(['source']);
    },
  );
});
