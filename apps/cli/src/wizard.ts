import { lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { assertSeparateSourceOutput } from '@site-rescue/output-safety';
import { inspectHtmlDirectory, type SourceInventory } from '@site-rescue/source-inventory';
import { runImportSource } from './import-source.js';
import { runPreview } from './preview.js';
import { runVerifyBundle } from './verify-bundle.js';

export interface WizardIO {
  isInteractive: boolean;
  ask: (question: string) => Promise<string | undefined>;
  writeLine: (line: string) => void;
  writeError?: (line: string) => void;
  close?: () => void;
}

/** Display untrusted source references as inert terminal text, with bounded summaries. */
function terminalText(value: string): string {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || (code >= 127 && code <= 159) ? ' ' : character;
  }).join('');
}

function terminalIO(): WizardIO {
  const isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (!isInteractive) return { isInteractive, ask: async () => undefined, writeLine: console.log, writeError: console.error };
  const reader = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  const lines = reader[Symbol.asyncIterator]();
  const stop = (): void => reader.close();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  return {
    isInteractive,
    writeLine: (line) => console.log(terminalText(line)),
    writeError: (line) => console.error(terminalText(line)),
    ask: async (question) => {
      process.stdout.write(`${question}\n> `);
      const answer = await lines.next();
      return answer.done ? undefined : answer.value;
    },
    close: () => {
      reader.close();
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
    },
  };
}

function pathAnswer(answer: string | undefined): string | undefined {
  const value = answer?.trim();
  if (!value) return undefined;
  const unquoted = (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))
    ? value.slice(1, -1) : value;
  if (unquoted.trim() === '') return undefined;
  return resolve(unquoted);
}

async function requireNewOutput(source: string, output: string): Promise<void> {
  await assertSeparateSourceOutput(source, output);
  try { await lstat(output); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  throw new Error(`Output directory already exists; choose a new directory: ${output}`);
}

function showAnalysis(inventory: SourceInventory, write: (line: string) => void): void {
  const counts = (status: string): number => inventory.references.filter((reference) => reference.status === status).length;
  write(`Analysis: ${inventory.summary.htmlFiles} HTML files; ${inventory.summary.files} total files; ${inventory.summary.totalBytes} bytes.`);
  write(`References: ${counts('missing')} missing; ${counts('unsafe')} unsafe; ${counts('external')} external (not fetched).`);
  for (const reference of inventory.references.filter((item) => item.status === 'missing' || item.status === 'unsafe').slice(0, 10)) {
    write(`  ${reference.status}: ${reference.sourcePath}: ${reference.value.slice(0, 240)}`);
  }
  write(`Warnings / unsupported items: ${inventory.warnings.length}. Showing at most 10; the import report records review evidence.`);
  for (const warning of inventory.warnings.slice(0, 10)) write(`  [${warning.code}] ${warning.message.slice(0, 240)} ${warning.action.slice(0, 240)}`);
  write('Analysis is in memory only. Original-site completeness: unknown; conversion and static integrity: not yet checked; manual review: required.');
}

function shellPath(path: string): string {
  return process.platform === 'win32' ? `'${path.replaceAll("'", "''")}'` : `'${path.replaceAll("'", "'\\''")}'`;
}

export async function runWizard(options: { io?: WizardIO; preview?: typeof runPreview } = {}): Promise<number> {
  const io = options.io ?? terminalIO();
  const write = (line: string): void => io.writeLine(terminalText(line));
  try {
    if (!io.isInteractive) throw new Error('Wizard requires an interactive terminal. For scripts use site-rescue import-source <html-directory> --output <new-directory>.');
    write('Site Rescue — guided offline HTML folder import');
    write('Generic UTF-8 HTML folder only. ZIP, live URLs and official Weebly archive validation are unavailable. Enter an empty path or close input to cancel.');
    const source = pathAnswer(await io.ask('Source HTML folder:'));
    if (source === undefined) { write('Cancelled; no rescue output created.'); return 0; }
    const output = pathAnswer(await io.ask('New separate output folder:'));
    if (output === undefined) { write('Cancelled; no rescue output created.'); return 0; }
    await requireNewOutput(source, output);
    write('Analyzing source without creating output...');
    const inventory = await inspectHtmlDirectory(source);
    showAnalysis(inventory, write);
    write(`Source: ${source}`);
    write(`Destination: ${output}`);
    write('Planned writes: a new capture/ (original evidence, Snapshot, normalized content), site/ (baseline-style HTML), report/ and, when static checks pass, rescue-manifest.json. Sources will not be overwritten. Stop source writers before continuing.');
    const choice = await io.ask('Type IMPORT to create this rescue bundle, or press Enter to cancel:');
    if (choice?.trim().toUpperCase() !== 'IMPORT') { write('Cancelled; no rescue output created.'); return 0; }
    // Confirmation applies to this analysis; do not silently import a changed source or destination.
    await requireNewOutput(source, output);
    if (JSON.stringify(await inspectHtmlDirectory(source)) !== JSON.stringify(inventory)) {
      throw new Error('Source changed since analysis. No output created; run wizard again and review the new analysis.');
    }
    const result = await runImportSource(source, { outputDirectory: output, writeLine: write });
    write(`Normalized pages: ${result.site.pages.length}. Conversion warnings: ${result.site.warnings.length}; review the report.`);
    write(`Static reference checks: ${result.verification.valid ? 'valid' : 'invalid'}; ${result.verification.checkedReferenceCount} checked; ${result.verification.issueCount} issues.`);
    write(`Website: ${join(result.outputDirectory, 'site')}`);
    write(`Report: ${join(result.outputDirectory, 'report', 'migration-report.md')}`);
    write('Original-site completeness: unknown. Manual review: required. Static checks and hashes do not establish complete migration or visual/functional parity.');
    if (!result.verification.valid || result.manifest === undefined) {
      write('Bundle verification: not run; no valid manifest. Generated evidence retained. Repair static issues before preview.');
      return 2;
    }
    const bundle = await runVerifyBundle(result.outputDirectory, { writeLine: () => undefined });
    write(`Bundle verification: ${bundle.valid ? 'valid' : 'invalid'}; ${bundle.fileCount} files checked; ${bundle.issueCount} issues.`);
    if (!bundle.valid) {
      for (const issue of bundle.issues.slice(0, 10)) write(`  [${issue.code}] ${issue.path}: ${issue.message}`);
      return 2;
    }
    const siteDirectory = join(result.outputDirectory, 'site');
    write(`Preview later: site-rescue preview ${shellPath(siteDirectory)}`);
    if (/^(?:y|yes)$/iu.test((await io.ask('Start loopback-only preview now? [y/N]:'))?.trim() ?? '')) {
      await (options.preview ?? runPreview)(siteDirectory, { writeLine: write });
    }
    return 0;
  } catch (error) {
    (io.writeError ?? write)(terminalText(`Error: ${error instanceof Error ? error.message : String(error)}`));
    return 1;
  } finally {
    io.close?.();
  }
}
