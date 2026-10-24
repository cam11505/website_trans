import { mkdir, realpath, rm } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/** Reject overlapping source/output paths, including aliases in existing parents. */
export async function assertSeparateSourceOutput(sourceDirectory: string, outputDirectory: string): Promise<void> {
  const source = await realpath(resolve(sourceDirectory));
  const output = resolve(outputDirectory);
  const inside = (parent: string, child: string): boolean => {
    const path = relative(parent, child);
    return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
  };
  const suffix: string[] = [];
  let parent = output;
  let canonicalOutput: string;
  while (true) {
    try { canonicalOutput = join(await realpath(parent), ...suffix); break; } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const next = dirname(parent);
      if (next === parent) throw error;
      suffix.unshift(basename(parent));
      parent = next;
    }
  }
  if ([output, canonicalOutput].some((candidate) => inside(source, candidate) || inside(candidate, source))) {
    throw new Error('Output must be separate from the source directory, including aliases and ancestors.');
  }
}

export async function withFreshOutputDirectory<T>(
  directory: string,
  operation: (directory: string) => Promise<T>,
): Promise<T> {
  const target = resolve(directory);
  await mkdir(dirname(target), { recursive: true });
  try {
    await mkdir(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(
        `Output directory already exists; choose a new directory: ${target}`,
        { cause: error },
      );
    }
    throw error;
  }

  try {
    return await operation(target);
  } catch (operationError) {
    try {
      await rm(target, { recursive: true });
    } catch (cleanupError) {
      throw new AggregateError(
        [operationError, cleanupError],
        `Output failed and the new directory could not be removed: ${target}`,
      );
    }
    throw operationError;
  }
}
