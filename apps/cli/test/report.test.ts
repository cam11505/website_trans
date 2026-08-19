import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSite } from '@site-rescue/content-schema';
import { runReport } from '../src/report.js';

describe('report command', () => {
  it('reads a validated capture and writes both report formats', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'site-rescue-cli-report-'));
    const inputFile = join(workspace, 'capture', 'site.json');
    const outputDirectory = join(workspace, 'report');
    const lines: string[] = [];
    const site = parseSite({
      schemaVersion: '1.0.0',
      source: {
        adapter: 'fixture',
        baseUrl: 'https://fixture.test/',
        capturedAt: '2026-08-19T00:00:00.000Z',
      },
      metadata: { title: 'CLI report fixture' },
      navigation: [],
      pages: [
        {
          id: 'home',
          sourceUrl: 'https://fixture.test/',
          sourcePath: '/',
          targetPath: '/',
          title: 'Home',
          blocks: [{ type: 'heading', level: 1, text: 'Home' }],
        },
      ],
      assets: [],
      redirects: [],
      warnings: [],
    });
    try {
      await mkdir(join(workspace, 'capture'), { recursive: true });
      await writeFile(inputFile, `${JSON.stringify(site)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
      });
      const result = await runReport(inputFile, {
        outputDirectory,
        writeLine: (line) => lines.push(line),
      });

      expect(result).toMatchObject({
        readiness: 'ready',
        warningCount: 0,
        reviewItemCount: 0,
      });
      expect(JSON.parse(await readFile(result.jsonFile, 'utf8'))).toMatchObject({
        reportVersion: '1.0.0',
        readiness: 'ready',
      });
      expect(await readFile(result.markdownFile, 'utf8')).toContain(
        'Readiness: **ready**',
      );
      expect(lines).toContain('Site Rescue migration report complete');
      expect(lines).toContain('Readiness: ready');
    } finally {
      await rm(workspace, { force: true, recursive: true });
    }
  });
});
