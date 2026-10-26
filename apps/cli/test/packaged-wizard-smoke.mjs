import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { execPath, stdout } from 'node:process';
import { setTimeout, clearTimeout } from 'node:timers';
import { fileURLToPath } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const prefix = 'site-rescue-packaged-wizard-';
const workspace = await mkdtemp(join(tmpdir(), prefix));
const source = join(workspace, '中文 HTML folder');
const cliFile = join(repository, 'release/package/bin/site-rescue.js');
// Test-only pipe transport: claim TTY so the actual packaged terminal/readline adapter is exercised.
// Product wizard still rejects ordinary pipes. Deny every outbound socket and non-loopback listener.
function execute(args, answers = [], interactive = true, preview = false) {
  const guard = 'data:text/javascript,' + encodeURIComponent(`
    import net from 'node:net';
    const deny = () => { throw new Error('Wizard attempted outbound network access'); };
    globalThis.fetch = deny;
    net.Socket.prototype.connect = deny;
    const listen = net.Server.prototype.listen;
    net.Server.prototype.listen = function(...args) {
      if (args[1] !== '127.0.0.1') throw new Error('Preview listener escaped loopback');
      return listen.apply(this, args);
    };
    if (${interactive}) {
      Object.defineProperty(process.stdin, 'isTTY', { value: true });
      Object.defineProperty(process.stdout, 'isTTY', { value: true });
    }
    if (${preview}) {
      const write = process.stdout.write.bind(process.stdout);
      process.stdout.write = (chunk, ...args) => {
        if (String(chunk).includes('Site Rescue preview ready')) setTimeout(() => process.emit('SIGINT'), 50);
        return write(chunk, ...args);
      };
    }
  `);
  return new Promise((resolveRun, reject) => {
    const child = spawn(execPath, ['--import', guard, cliFile, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    let error = '';
    let sent = 0;
    const timeout = setTimeout(() => { child.kill(); reject(new Error(`Wizard timed out: ${output}\n${error}`)); }, 30000);
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const prompts = (output.match(/\n> /gu) ?? []).length;
      while (sent < prompts && !child.stdin.writableEnded) {
        const answer = answers[sent++];
        if (answer === undefined) child.stdin.end();
        else child.stdin.write(`${answer}\n`);
      }
    });
    child.stderr.on('data', (chunk) => { error += chunk; });
    child.stdin.on('error', (failure) => { if (failure.code !== 'EPIPE') reject(failure); });
    child.on('error', (failure) => { clearTimeout(timeout); reject(failure); });
    child.on('close', (code) => { clearTimeout(timeout); resolveRun({ code, output, error }); });
    if (!interactive) child.stdin.end();
  });
}

try {
  await cp(join(repository, 'fixtures/shared/offline-import'), source, { recursive: true });
  const before = await readFile(join(source, 'index.html'));
  const nonTTY = await execute(['wizard'], [], false);
  assert.equal(nonTTY.code, 1);
  assert.match(nonTTY.error, /interactive terminal.*import-source/iu);
  const cancelled = join(workspace, 'cancelled parent', 'no output');
  const cancel = await execute(['wizard'], [source, cancelled, '']);
  assert.equal(cancel.code, 0, cancel.output + cancel.error);
  assert.match(cancel.output, /Analysis is in memory only/u);
  assert.match(cancel.output, /Cancelled/u);
  assert.deepEqual(await readdir(workspace), ['中文 HTML folder']);
  const eof = await execute(['wizard'], [source, cancelled]);
  assert.equal(eof.code, 0, eof.output + eof.error);
  assert.deepEqual(await readdir(workspace), ['中文 HTML folder']);
  const output = join(workspace, '救援 output');
  const success = await execute(['wizard'], [`"${source}"`, `"${output}"`, 'IMPORT', 'n']);
  assert.equal(success.code, 0, success.output + success.error);
  assert.match(success.output, /Bundle verification: valid;/u);
  assert.match(success.output, /Manual review: required/u);
  assert.match(success.output, /Preview later: site-rescue preview/u);
  assert.equal(success.output.includes('Site Rescue preview ready'), false);
  const report = JSON.parse(await readFile(join(output, 'report/migration-report.json'), 'utf8'));
  assert.equal(report.readiness, 'review-required');
  const existing = await execute(['wizard'], [source, output]);
  assert.equal(existing.code, 1);
  assert.match(existing.error, /already exists/u);
  const overlap = await execute(['wizard'], [source, join(source, 'inside')]);
  assert.equal(overlap.code, 1);
  assert.match(overlap.error, /separate/u);
  const previewOutput = join(workspace, 'preview output');
  const preview = await execute(['wizard'], [source, previewOutput, 'IMPORT', 'yes'], true, true);
  assert.equal(preview.code, 0, preview.output + preview.error);
  assert.match(preview.output, /URL: http:\/\/127\.0\.0\.1:\d+\//u);
  assert.match(preview.output, /Site Rescue preview ready/u);
  await writeFile(join(source, 'index.html'), '<p><a href="guide/#absent">Broken</a></p>');
  const brokenOutput = join(workspace, 'broken output');
  const broken = await execute(['wizard'], [source, brokenOutput, 'IMPORT']);
  assert.equal(broken.code, 2, broken.output + broken.error);
  assert.match(broken.output, /Bundle verification: not run/u);
  assert.equal(broken.output.includes('Start loopback-only preview'), false);
  await assert.rejects(readFile(join(brokenOutput, 'rescue-manifest.json')));
  // Restore only this test-owned synthetic working source, then compare its original bytes.
  await writeFile(join(source, 'index.html'), before);
  assert.deepEqual(await readFile(join(source, 'index.html')), before);
  stdout.write('Bundled wizard smoke passed: real terminal adapter via test TTY shim, Chinese/spaced paths, read-only analysis/cancel/EOF, explicit import, actual bundle verification, existing/overlap rejection, static exit2 and opt-in loopback preview with graceful stop; outbound network guarded.\n');
} finally {
  assert.equal(dirname(workspace), resolve(tmpdir()));
  assert.equal(basename(workspace).startsWith(prefix), true);
  await rm(workspace, { recursive: true, force: true });
}
