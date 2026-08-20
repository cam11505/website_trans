import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyStaticSite } from '../src/index.js';

describe('static site verifier', () => {
  it('accepts existing internal pages, fragments, and assets', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'site-rescue-verify-valid-'));
    try {
      await mkdir(join(directory, 'assets'), { recursive: true });
      await mkdir(join(directory, 'nested'), { recursive: true });
      await writeFile(
        join(directory, 'index.html'),
        '<a href="about.html#team">About</a><a href="nested/">Nested</a><a href="https://external.test/">External</a><img src="assets/photo.png"><link rel="stylesheet" href="assets/site.css">',
        'utf8',
      );
      await writeFile(
        join(directory, 'about.html'),
        '<h1 id="team">Team</h1><a href="/index.html">Home</a>',
        'utf8',
      );
      await writeFile(
        join(directory, 'nested', 'index.html'),
        '<a href="../about.html">About</a>',
        'utf8',
      );
      await writeFile(join(directory, 'assets', 'photo.png'), 'image', 'utf8');
      await writeFile(join(directory, 'assets', 'site.css'), 'body {}', 'utf8');

      const result = await verifyStaticSite(directory);

      expect(result).toMatchObject({
        htmlFileCount: 3,
        cssFileCount: 1,
        checkedReferenceCount: 7,
        internalReferenceCount: 6,
        externalReferenceCount: 1,
        issueCount: 0,
        valid: true,
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('reports missing files, fragments, unsafe paths, and invalid encoding', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'site-rescue-verify-invalid-'));
    try {
      await mkdir(join(directory, 'nested'), { recursive: true });
      await writeFile(
        join(directory, 'index.html'),
        '<a href="missing.html">Missing</a><a href="about.html#missing">Fragment</a><a href="javascript:alert(1)">Unsafe</a><img src="bad%GG.png">',
        'utf8',
      );
      await writeFile(join(directory, 'about.html'), '<h1 id="present">About</h1>', 'utf8');
      await writeFile(
        join(directory, 'nested', 'index.html'),
        '<a href="../../../outside.html">Outside</a>',
        'utf8',
      );

      const result = await verifyStaticSite(directory);

      expect(result.valid).toBe(false);
      expect(result.issueCount).toBe(5);
      expect(result.issues.map((issue) => issue.code)).toEqual(
        expect.arrayContaining([
          'missing-file',
          'missing-fragment',
          'outside-root',
          'invalid-reference',
        ]),
      );
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('rejects a directory without HTML files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'site-rescue-verify-empty-'));
    try {
      await expect(verifyStaticSite(directory)).rejects.toThrow('No HTML files found');
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('checks local, external, unsafe, and malformed CSS references offline', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'site-rescue-verify-css-'));
    try {
      await mkdir(join(directory, 'assets', 'css'), { recursive: true });
      await writeFile(join(directory, 'index.html'), '<h1>CSS fixture</h1>', 'utf8');
      await writeFile(
        join(directory, 'assets', 'css', 'site.css'),
        '@import "theme.css"; .a { background: url(../missing.png) } .b { background: url(https://cdn.test/image.png) } .c { background: url(javascript:alert(1)) } .d { background: url(../../../outside.png) }',
        'utf8',
      );
      await writeFile(
        join(directory, 'assets', 'css', 'theme.css'),
        '.theme { color: navy }',
        'utf8',
      );
      await writeFile(
        join(directory, 'assets', 'css', 'broken.css'),
        '.broken { color: red;',
        'utf8',
      );

      const result = await verifyStaticSite(directory);

      expect(result).toMatchObject({
        htmlFileCount: 1,
        cssFileCount: 3,
        checkedReferenceCount: 5,
        internalReferenceCount: 3,
        externalReferenceCount: 1,
        issueCount: 4,
        valid: false,
      });
      expect(result.issues.map((issue) => issue.code)).toEqual(
        expect.arrayContaining([
          'invalid-css',
          'invalid-reference',
          'missing-file',
          'outside-root',
        ]),
      );
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
