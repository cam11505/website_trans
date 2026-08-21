import {
  verifyRescueBundle,
  type VerifyRescueBundleResult,
} from '@site-rescue/rescue-manifest';

export interface VerifyBundleOptions {
  writeLine?: (line: string) => void;
}

export async function runVerifyBundle(
  directory: string,
  options: VerifyBundleOptions = {},
): Promise<VerifyRescueBundleResult> {
  const writeLine = options.writeLine ?? console.log;
  const result = await verifyRescueBundle(directory);

  writeLine('Site Rescue bundle verification complete');
  writeLine(`Status: ${result.valid ? 'valid' : 'invalid'}`);
  writeLine(`Files: ${result.fileCount}`);
  writeLine(`Bytes: ${result.totalBytes}`);
  writeLine(`Issues: ${result.issueCount}`);
  for (const issue of result.issues) {
    writeLine(`  - [${issue.code}] ${issue.path}: ${issue.message}`);
  }
  return result;
}
