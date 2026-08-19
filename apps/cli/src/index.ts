#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { runCapture } from './capture.js';
import { runDiagnose } from './diagnose.js';
import { runExport } from './export.js';
import { runRescue } from './rescue.js';

const USAGE = `Usage:
  site-rescue diagnose <url> [--max-pages <number>]
  site-rescue capture <url> [--output <directory>] [--max-pages <number>] [--skip-assets]
  site-rescue export <site.json> [--output <directory>]
  site-rescue rescue <url> [--output <directory>] [--max-pages <number>] [--skip-assets]

Commands:
  diagnose  Detect the source platform and discover same-origin HTML pages
  capture   Normalize a Weebly site, download assets, and write a validated site.json file
  export    Render a validated site.json capture as a static HTML website
  rescue    Capture and export a source website in one local operation`;

function parseStringOption(args: string[], name: string): string | undefined {
  const optionIndex = args.indexOf(name);
  if (optionIndex === -1) {
    return undefined;
  }
  const value = args[optionIndex + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function parseMaxPages(args: string[]): number | undefined {
  const optionIndex = args.indexOf('--max-pages');
  if (optionIndex === -1) {
    return undefined;
  }
  const rawValue = parseStringOption(args, '--max-pages');
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('--max-pages must be a positive integer.');
  }
  return value;
}

export async function main(args: string[]): Promise<number> {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(USAGE);
    return 0;
  }

  const [command, input] = args;
  if (
    (command !== 'diagnose' &&
      command !== 'capture' &&
      command !== 'export' &&
      command !== 'rescue') ||
    input === undefined
  ) {
    console.error(USAGE);
    return 1;
  }

  try {
    if (command === 'diagnose') {
      await runDiagnose(input, { maxPages: parseMaxPages(args) });
    } else if (command === 'capture') {
      await runCapture(input, {
        maxPages: parseMaxPages(args),
        downloadAssets: !args.includes('--skip-assets'),
        outputDirectory: parseStringOption(args, '--output') ?? 'site-rescue-output',
      });
    } else if (command === 'export') {
      await runExport(input, {
        outputDirectory: parseStringOption(args, '--output') ?? 'site-rescue-site',
      });
    } else {
      await runRescue(input, {
        maxPages: parseMaxPages(args),
        downloadAssets: !args.includes('--skip-assets'),
        outputDirectory: parseStringOption(args, '--output') ?? 'site-rescue-output',
      });
    }
    return 0;
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

const isEntryPoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  process.exitCode = await main(process.argv.slice(2));
}

export { runDiagnose } from './diagnose.js';
export { runCapture } from './capture.js';
export { runExport } from './export.js';
export { runRescue } from './rescue.js';

