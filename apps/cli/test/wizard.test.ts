import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { main } from '../src/index.js';
import { runWizard, type WizardIO } from '../src/wizard.js';

afterEach(() => vi.restoreAllMocks());

describe('wizard command entry', () => {
  it('rejects wizard flags rather than treating them as unattended consent', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await main(['wizard', '--yes'])).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('accepts no options'));
  });
  it('advertises the guided offline folder command', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    expect(await main(['--help'])).toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('site-rescue wizard'));
  });

  it('refuses noninteractive execution with direct-command guidance instead of waiting', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: false });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(await main(['wizard'])).toBe(1);
      expect(error).toHaveBeenCalledWith(expect.stringMatching(/interactive terminal.*import-source/iu));
    } finally {
      if (descriptor === undefined) Reflect.deleteProperty(process.stdin, 'isTTY');
      else Object.defineProperty(process.stdin, 'isTTY', descriptor);
    }
  });
});

describe('guided offline folder workflow', () => {
  let workspace: string;
  let source: string;
  let output: string;
  let lines: string[];
  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'site-rescue-wizard-'));
    source = join(workspace, '中文 source folder');
    output = join(workspace, 'new parent', '救援 output');
    lines = [];
    await cp(join(process.cwd(), 'fixtures/shared/offline-import'), source, { recursive: true });
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Wizard must remain offline'); }));
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await rm(workspace, { recursive: true, force: true });
  });
  function ioFor(answers: (string | undefined)[]): WizardIO {
    return { isInteractive: true, ask: vi.fn(async () => answers.shift()), writeLine: (line) => lines.push(line), close: vi.fn() };
  }
  const readJson = async (path: string) => JSON.parse(await readFile(join(output, path), 'utf8'));

  it('analyzes without writes, imports only after confirmation, verifies the real bundle and leaves preview optional', async () => {
    const before = await readFile(join(source, 'index.html'));
    const io = ioFor([source, output, 'IMPORT', 'n']);
    const ask = vi.fn(async (question: string) => {
      if (question.startsWith('Type IMPORT')) {
        expect(await readdir(workspace)).toEqual(['中文 source folder']);
        expect(lines.join('\n')).toContain('Planned writes:');
        expect(lines.join('\n')).toContain('HTML files');
      }
      return io.ask(question);
    });
    const preview = vi.fn();
    expect(await runWizard({ io: { ...io, ask }, preview })).toBe(0);
    expect(preview).not.toHaveBeenCalled();
    expect((await readJson('report/migration-report.json')).readiness).toBe('review-required');
    expect(lines.some((line) => line.startsWith('Bundle verification: valid;'))).toBe(true);
    expect(lines.some((line) => line.includes('Preview later: site-rescue preview'))).toBe(true);
    expect(await readFile(join(source, 'index.html'))).toEqual(before);
    expect(fetch).not.toHaveBeenCalled();
    expect(io.close).toHaveBeenCalledOnce();
  });

  it.each([undefined, '', 'n', 'yes'])('cancels before write on confirmation %s', async (choice) => {
    expect(await runWizard({ io: ioFor([source, output, choice]) })).toBe(0);
    expect(await readdir(workspace)).toEqual(['中文 source folder']);
    expect(lines.join('\n')).toContain('Cancelled');
  });

  it.each([[undefined], [''], [source, undefined], [source, '']])('cancels an empty or closed path prompt %j', async (...answers) => {
    expect(await runWizard({ io: ioFor(answers) })).toBe(0);
    expect(await readdir(workspace)).toEqual(['中文 source folder']);
  });

  it('refuses non-TTY IO before asking or writing', async () => {
    const io = ioFor([]);
    io.isInteractive = false;
    expect(await runWizard({ io })).toBe(1);
    expect(io.ask).not.toHaveBeenCalled();
    expect(lines.join('\n')).toMatch(/interactive terminal.*import-source/iu);
  });

  it('preserves an existing output and refuses before execution choice', async () => {
    await mkdir(output, { recursive: true });
    await writeFile(join(output, 'keep'), 'untouched');
    const io = ioFor([source, output, 'IMPORT']);
    expect(await runWizard({ io })).toBe(1);
    expect(io.ask).toHaveBeenCalledTimes(2);
    expect(await readFile(join(output, 'keep'), 'utf8')).toBe('untouched');
  });

  it.each(['inside', 'ancestor', 'alias'])('rejects %s source/output overlap before any writes', async (kind) => {
    let destination = kind === 'inside' ? join(source, 'new') : workspace;
    if (kind === 'alias') {
      const alias = join(workspace, 'source-alias');
      await symlink(source, alias, process.platform === 'win32' ? 'junction' : 'dir');
      destination = join(alias, 'new');
    }
    expect(await runWizard({ io: ioFor([source, destination, 'IMPORT']) })).toBe(1);
    expect(lines.join('\n')).toContain('separate');
    expect(await readdir(source)).not.toContain('new');
  });

  it('rejects a missing source without creating the destination parent', async () => {
    expect(await runWizard({ io: ioFor([join(workspace, 'missing'), output, 'IMPORT']) })).toBe(1);
    expect(await readdir(workspace)).toEqual(['中文 source folder']);
  });

  it('invalidates a stale analysis instead of importing source changes after confirmation', async () => {
    const answers = [source, output, 'IMPORT'];
    const io = ioFor([]);
    io.ask = async (question) => {
      if (question.startsWith('Type IMPORT')) await writeFile(join(source, 'new.html'), '<p>Changed</p>');
      return answers.shift();
    };
    expect(await runWizard({ io })).toBe(1);
    expect(lines.join('\n')).toContain('Source changed since analysis');
    expect(await readdir(workspace)).toEqual(['中文 source folder']);
  });

  it('rechecks a destination created while the user was reviewing analysis', async () => {
    const answers = [source, output, 'IMPORT'];
    const io = ioFor([]);
    io.ask = async (question) => {
      if (question.startsWith('Type IMPORT')) {
        await mkdir(output, { recursive: true });
        await writeFile(join(output, 'keep'), 'Created by another writer');
      }
      return answers.shift();
    };
    expect(await runWizard({ io })).toBe(1);
    expect(await readFile(join(output, 'keep'), 'utf8')).toBe('Created by another writer');
    expect(await readdir(output)).toEqual(['keep']);
  });

  it('actually verifies generated bundle bytes before claiming success or offering preview', async () => {
    const io = ioFor([source, output, 'IMPORT', 'yes']);
    io.writeLine = (line) => {
      lines.push(line);
      if (line.startsWith('Site Rescue offline HTML import finished')) appendFileSync(join(output, 'site/index.html'), '\n');
    };
    const preview = vi.fn();
    expect(await runWizard({ io, preview })).toBe(2);
    expect(lines.join('\n')).toContain('Bundle verification: invalid');
    expect(preview).not.toHaveBeenCalled();
    expect(io.ask).toHaveBeenCalledTimes(3);
  });

  it('retains static failure evidence, returns 2 and does not offer preview or claim bundle verification', async () => {
    await writeFile(join(source, 'index.html'), '<p><a href="guide/#absent">Broken</a></p>');
    const io = ioFor([source, output, 'IMPORT', 'yes']);
    const preview = vi.fn();
    expect(await runWizard({ io, preview })).toBe(2);
    expect(preview).not.toHaveBeenCalled();
    expect(io.ask).toHaveBeenCalledTimes(3);
    expect(lines.join('\n')).toContain('Bundle verification: not run');
    expect((await readJson('report/migration-report.json')).readiness).toBe('review-required');
    await expect(readFile(join(output, 'rescue-manifest.json'))).rejects.toThrow();
  });

  it('shows missing/unsafe references as inert terminal text and starts preview only after its own choice', async () => {
    await writeFile(join(source, 'index.html'), '<p><a href="missing.html">Missing</a><a href="../../escape">Unsafe</a><a href="missing\u001b[31m.html">Control</a></p>');
    const preview = vi.fn(async () => ({ directory: '', origin: 'http://127.0.0.1', port: 4173 }));
    expect(await runWizard({ io: ioFor([`"${source}"`, `"${output}"`, 'IMPORT', 'yes']), preview })).toBe(0);
    expect(preview).toHaveBeenCalledWith(join(output, 'site'), expect.objectContaining({ writeLine: expect.any(Function) }));
    expect(lines.join('\n')).toMatch(/missing;.*unsafe/iu);
    expect(lines.join('\n')).not.toContain('\u001b');
    expect(lines.join('\n')).toContain('Manual review: required');
  });

  it('rejects unsupported input after consent without leaving a partial rescue', async () => {
    await writeFile(join(source, 'index.html'), '<base href="https://external.example/"><p>Unsupported</p>');
    expect(await runWizard({ io: ioFor([source, output, 'IMPORT']) })).toBe(1);
    await expect(readdir(output)).rejects.toThrow();
    expect(lines.join('\n')).toContain('base URLs are unsupported');
  });
});
