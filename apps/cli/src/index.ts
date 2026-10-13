#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { runCapture } from './capture.js';
import { runDiagnose } from './diagnose.js';
import { runExport } from './export.js';
import { runInspectSource } from './inspect-source.js';
import { runManifest } from './manifest.js';
import { runPreview } from './preview.js';
import { runReport } from './report.js';
import { runRescue } from './rescue.js';
import { runVerify } from './verify.js';
import { runVerifyBundle } from './verify-bundle.js';
import { SITE_RESCUE_VERSION } from './version.js';
import type { StaticHtmlStyleMode } from '@site-rescue/exporter-static-html';

const USAGE = `Usage:
  site-rescue diagnose <url> [--max-pages <number>] [--max-retries <0-5>] [--request-timeout-ms <number>] [--max-html-bytes <number>]
  site-rescue capture <url> [--output <directory>] [--max-pages <number>] [--max-retries <0-5>] [--request-timeout-ms <number>] [--max-html-bytes <number>] [--skip-assets]
  site-rescue export <site.json> [--output <directory>] [--style-mode <baseline|source>]
  site-rescue report <site.json> [--output <directory>]
  site-rescue verify <site-directory>
  site-rescue inspect-source <html-directory> [--output <directory>] [--max-entries <number>] [--max-depth <number>] [--max-file-bytes <number>] [--max-total-bytes <number>] [--max-text-bytes <number>] [--max-references <number>]
  site-rescue manifest <rescue-directory>
  site-rescue verify-bundle <rescue-directory>
  site-rescue preview <site-directory> [--port <number>]
  site-rescue rescue <url> [--output <directory>] [--max-pages <number>] [--max-retries <0-5>] [--request-timeout-ms <number>] [--max-html-bytes <number>] [--skip-assets] [--style-mode <baseline|source>]

Commands:
  diagnose  Detect the source platform and discover same-origin HTML pages
  capture   Normalize a detected supported site and write a validated local capture
  export    Render a validated site.json capture as a static HTML website
  report    Create JSON and Markdown migration reports from a validated capture
  verify    Check generated HTML links and local assets without network access
  inspect-source  Inventory a local HTML directory offline (review required; no import or ZIP support)
  manifest  Write a deterministic SHA-256 manifest for a complete rescue bundle
  verify-bundle  Verify a rescue bundle manifest and all recorded files offline
  preview   Verify and serve a generated site on 127.0.0.1 for local review
  rescue    Capture, export, report, verify, and manifest a source website locally

Global options:
  --version, -V  Print the Site Rescue version`;

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

function parsePositiveIntegerOption(args: string[], name: string): number | undefined {
  if (!args.includes(name)) {
    return undefined;
  }
  const value = Number(parseStringOption(args, name));
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function parseMaxRetries(args: string[]): number | undefined {
  if (!args.includes('--max-retries')) {
    return undefined;
  }
  const value = Number(parseStringOption(args, '--max-retries'));
  if (!Number.isSafeInteger(value) || value < 0 || value > 5) {
    throw new Error('--max-retries must be an integer between 0 and 5.');
  }
  return value;
}

function parseHttpOptions(args: string[]): {
  maxHtmlBytes: number | undefined;
  maxRetries: number | undefined;
  requestTimeoutMs: number | undefined;
} {
  return {
    maxHtmlBytes: parsePositiveIntegerOption(args, '--max-html-bytes'),
    maxRetries: parseMaxRetries(args),
    requestTimeoutMs: parsePositiveIntegerOption(args, '--request-timeout-ms'),
  };
}

function parsePort(args: string[]): number | undefined {
  if (!args.includes('--port')) {
    return undefined;
  }
  const value = Number(parseStringOption(args, '--port'));
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error('--port must be an integer between 1 and 65535.');
  }
  return value;
}

function parseStyleMode(args: string[]): StaticHtmlStyleMode | undefined {
  if (!args.includes('--style-mode')) {
    return undefined;
  }
  const value = parseStringOption(args, '--style-mode');
  if (value !== 'baseline' && value !== 'source') {
    throw new Error('--style-mode must be either baseline or source.');
  }
  return value;
}

export async function main(args: string[]): Promise<number> {
  if (args.includes('--version') || args.includes('-V')) {
    console.log(SITE_RESCUE_VERSION);
    return 0;
  }
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(USAGE);
    return 0;
  }

  const [command, input] = args;
  if (
    (command !== 'diagnose' &&
      command !== 'capture' &&
      command !== 'export' &&
      command !== 'report' &&
      command !== 'verify' &&
      command !== 'inspect-source' &&
      command !== 'manifest' &&
      command !== 'verify-bundle' &&
      command !== 'preview' &&
      command !== 'rescue') ||
    input === undefined
  ) {
    console.error(USAGE);
    return 1;
  }

  try {
    if (command === 'diagnose') {
      await runDiagnose(input, { maxPages: parseMaxPages(args), ...parseHttpOptions(args) });
    } else if (command === 'capture') {
      await runCapture(input, {
        maxPages: parseMaxPages(args),
        ...parseHttpOptions(args),
        downloadAssets: !args.includes('--skip-assets'),
        outputDirectory: parseStringOption(args, '--output') ?? 'site-rescue-output',
      });
    } else if (command === 'export') {
      await runExport(input, {
        outputDirectory: parseStringOption(args, '--output') ?? 'site-rescue-site',
        styleMode: parseStyleMode(args),
      });
    } else if (command === 'report') {
      await runReport(input, {
        outputDirectory: parseStringOption(args, '--output') ?? 'site-rescue-report',
      });
    } else if (command === 'inspect-source') {
      const optionNames = ['--output', '--max-entries', '--max-depth', '--max-file-bytes', '--max-total-bytes', '--max-text-bytes', '--max-references'];
      for (let index = 2; index < args.length; index += 2) {
        const option = args[index]!;
        if (!optionNames.includes(option) || args.indexOf(option) !== index) throw new Error(`Unknown or duplicate inventory option: ${option}.`);
        parseStringOption(args, option);
      }
      const limits = Object.fromEntries([
        ['maxEntries', parsePositiveIntegerOption(args, '--max-entries')],
        ['maxDepth', parsePositiveIntegerOption(args, '--max-depth')],
        ['maxFileBytes', parsePositiveIntegerOption(args, '--max-file-bytes')],
        ['maxTotalBytes', parsePositiveIntegerOption(args, '--max-total-bytes')],
        ['maxTextBytes', parsePositiveIntegerOption(args, '--max-text-bytes')],
        ['maxReferences', parsePositiveIntegerOption(args, '--max-references')],
      ].filter((entry) => entry[1] !== undefined));
      await runInspectSource(input, { outputDirectory: parseStringOption(args, '--output') ?? 'site-rescue-inventory', limits });
    } else if (command === 'verify') {
      const result = await runVerify(input);
      return result.valid ? 0 : 2;
    } else if (command === 'manifest') {
      await runManifest(input);
    } else if (command === 'verify-bundle') {
      const result = await runVerifyBundle(input);
      return result.valid ? 0 : 2;
    } else if (command === 'preview') {
      await runPreview(input, { port: parsePort(args) });
    } else {
      const result = await runRescue(input, {
        maxPages: parseMaxPages(args),
        ...parseHttpOptions(args),
        downloadAssets: !args.includes('--skip-assets'),
        outputDirectory: parseStringOption(args, '--output') ?? 'site-rescue-output',
        styleMode: parseStyleMode(args),
      });
      return result.verification.valid ? 0 : 2;
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
export { runInspectSource } from './inspect-source.js';
export { runManifest } from './manifest.js';
export { runPreview } from './preview.js';
export { runReport } from './report.js';
export { runRescue } from './rescue.js';
export { runVerify } from './verify.js';
export { runVerifyBundle } from './verify-bundle.js';

