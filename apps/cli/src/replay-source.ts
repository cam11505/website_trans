import { join } from 'node:path';
import { assertSeparateSourceOutput } from '@site-rescue/output-safety';
import { readSourceSnapshot } from '@site-rescue/source-snapshot';
import { runImportSource, type ImportSourceOptions } from './import-source.js';

export async function runReplaySource(directory: string, options: Omit<ImportSourceOptions, 'expectedSnapshot'>) {
  await assertSeparateSourceOutput(directory, options.outputDirectory);
  const snapshot = await readSourceSnapshot(directory);
  const result = await runImportSource(join(directory, 'files'), { ...options, expectedSnapshot: snapshot });
  (options.writeLine ?? console.log)('Verified source snapshot replayed with the current generic HTML adapter — review required');
  return result;
}
