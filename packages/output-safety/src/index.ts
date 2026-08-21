import { mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

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
