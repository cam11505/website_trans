import {
  writeRescueManifest,
  type WriteRescueManifestResult,
} from '@site-rescue/rescue-manifest';

export interface ManifestOptions {
  writeLine?: (line: string) => void;
}

export async function runManifest(
  directory: string,
  options: ManifestOptions = {},
): Promise<WriteRescueManifestResult> {
  const writeLine = options.writeLine ?? console.log;
  const result = await writeRescueManifest(directory);

  writeLine('Site Rescue bundle manifest complete');
  writeLine(`Files: ${result.fileCount}`);
  writeLine(`Bytes: ${result.totalBytes}`);
  writeLine(`Manifest: ${result.manifestFile}`);
  return result;
}
