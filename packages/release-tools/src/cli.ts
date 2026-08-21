import { fileURLToPath } from 'node:url';
import { buildReleasePackage, verifyReleasePackage } from './index.js';

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));
const command = process.argv[2] ?? 'verify';

try {
  if (command === 'prepare') {
    const result = await buildReleasePackage(repositoryRoot);
    console.log(`Release package prepared: ${result.outputDirectory}`);
    console.log(`Version: ${result.version}`);
    console.log(`Checksummed files: ${result.fileCount}`);
  } else if (command === 'verify') {
    await buildReleasePackage(repositoryRoot);
    const result = await verifyReleasePackage(repositoryRoot);
    console.log('Release package verified');
    console.log(`Version: ${result.version}`);
    console.log(`Checksummed files: ${result.fileCount}`);
    console.log('CLI --version: passed');
    console.log('CLI --help: passed');
    console.log('CLI report fixture: passed');
  } else {
    throw new Error('Usage: release-tools <prepare|verify>');
  }
} catch (error) {
  console.error(`Release check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
