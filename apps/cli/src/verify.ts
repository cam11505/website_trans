import { verifyStaticSite, type VerifyStaticSiteResult } from '@site-rescue/static-verifier';

export interface VerifyOptions {
  writeLine?: (line: string) => void;
}

export async function runVerify(
  directory: string,
  options: VerifyOptions = {},
): Promise<VerifyStaticSiteResult> {
  const writeLine = options.writeLine ?? console.log;
  const result = await verifyStaticSite(directory);

  writeLine('Site Rescue static verification complete');
  writeLine(`Status: ${result.valid ? 'valid' : 'invalid'}`);
  writeLine(`HTML files: ${result.htmlFileCount}`);
  writeLine(`References checked: ${result.checkedReferenceCount}`);
  writeLine(`Internal references: ${result.internalReferenceCount}`);
  writeLine(`External references skipped: ${result.externalReferenceCount}`);
  writeLine(`Issues: ${result.issueCount}`);
  for (const issue of result.issues) {
    writeLine(
      `  - [${issue.code}] ${issue.sourceFile}: ${issue.reference}${
        issue.targetFile === undefined ? '' : ` -> ${issue.targetFile}`
      }`,
    );
  }
  return result;
}
