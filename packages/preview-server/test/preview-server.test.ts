import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PREVIEW_HOST,
  startPreviewServer,
  type PreviewServer,
} from '../src/index.js';

interface Fixture {
  parent: string;
  root: string;
}

async function createFixture(): Promise<Fixture> {
  const parent = await mkdtemp(join(tmpdir(), 'site-rescue-preview-'));
  const root = join(parent, 'site');
  await mkdir(join(root, 'docs'), { recursive: true });
  await mkdir(join(root, 'assets'), { recursive: true });
  await mkdir(join(root, 'empty'), { recursive: true });
  await writeFile(join(root, 'index.html'), '<h1>Preview home</h1>', 'utf8');
  await writeFile(join(root, 'docs', 'index.html'), '<h1>Documentation</h1>', 'utf8');
  await writeFile(join(root, 'assets', 'site.css'), 'body { color: navy; }', 'utf8');
  await writeFile(join(root, 'assets', 'data.bin'), new Uint8Array([1, 2, 3]));
  return { parent, root };
}

async function rawRequest(
  server: PreviewServer,
  path: string,
  method = 'GET',
): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: Buffer }> {
  return new Promise((resolveRequest, rejectRequest) => {
    const outgoing = request(
      { host: server.host, method, path, port: server.port },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          resolveRequest({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    outgoing.on('error', rejectRequest);
    outgoing.end();
  });
}

describe('preview server', () => {
  it('serves root, nested index, and assets with safe response headers', async () => {
    const fixture = await createFixture();
    const server = await startPreviewServer(fixture.root, { port: 0 });
    try {
      expect(server.host).toBe(PREVIEW_HOST);
      expect(server.origin).toBe(`http://${PREVIEW_HOST}:${server.port}`);

      const home = await fetch(`${server.origin}/`);
      expect(home.status).toBe(200);
      expect(home.headers.get('content-type')).toBe('text/html; charset=utf-8');
      expect(home.headers.get('cache-control')).toBe('no-store');
      expect(home.headers.get('x-content-type-options')).toBe('nosniff');
      expect(await home.text()).toContain('Preview home');

      const nested = await fetch(`${server.origin}/docs/?from=test`);
      expect(nested.status).toBe(200);
      expect(await nested.text()).toContain('Documentation');

      const stylesheet = await fetch(`${server.origin}/assets/site.css`);
      expect(stylesheet.headers.get('content-type')).toBe('text/css; charset=utf-8');
      expect(await stylesheet.text()).toContain('color: navy');

      const binary = await fetch(`${server.origin}/assets/data.bin`);
      expect(binary.headers.get('content-type')).toBe('application/octet-stream');
      expect(new Uint8Array(await binary.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    } finally {
      await server.close();
      await server.close();
      await rm(fixture.parent, { force: true, recursive: true });
    }
  });

  it('supports HEAD and rejects unsupported methods', async () => {
    const fixture = await createFixture();
    const server = await startPreviewServer(fixture.root, { port: 0 });
    try {
      const head = await rawRequest(server, '/', 'HEAD');
      expect(head.status).toBe(200);
      expect(head.body).toHaveLength(0);
      expect(Number(head.headers['content-length'])).toBeGreaterThan(0);

      const post = await rawRequest(server, '/', 'POST');
      expect(post.status).toBe(405);
      expect(post.headers.allow).toBe('GET, HEAD');
    } finally {
      await server.close();
      await rm(fixture.parent, { force: true, recursive: true });
    }
  });

  it('returns controlled errors for missing and unsafe paths', async () => {
    const fixture = await createFixture();
    const server = await startPreviewServer(fixture.root, { port: 0 });
    try {
      expect((await rawRequest(server, '/missing.html')).status).toBe(404);
      expect((await rawRequest(server, '/empty/')).status).toBe(404);
      expect((await rawRequest(server, '/%ZZ')).status).toBe(400);
      expect((await rawRequest(server, '/%5c..%5coutside')).status).toBe(400);
      expect((await rawRequest(server, '/%2e%2e%2foutside%2fsecret.txt')).status).toBe(403);
    } finally {
      await server.close();
      await rm(fixture.parent, { force: true, recursive: true });
    }
  });

  it('does not follow a linked directory outside the preview root', async () => {
    const fixture = await createFixture();
    const outside = join(fixture.parent, 'outside');
    await mkdir(outside);
    await writeFile(join(outside, 'secret.txt'), 'not public', 'utf8');
    try {
      await symlink(
        outside,
        join(fixture.root, 'escape'),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') {
        await rm(fixture.parent, { force: true, recursive: true });
        return;
      }
      throw error;
    }

    const server = await startPreviewServer(fixture.root, { port: 0 });
    try {
      expect((await rawRequest(server, '/escape/secret.txt')).status).toBe(403);
    } finally {
      await server.close();
      await rm(fixture.parent, { force: true, recursive: true });
    }
  });

  it('reports invalid and occupied ports clearly', async () => {
    const fixture = await createFixture();
    await expect(startPreviewServer(fixture.root, { port: -1 })).rejects.toThrow(
      'Preview port must be an integer between 0 and 65535.',
    );

    const server = await startPreviewServer(fixture.root, { port: 0 });
    try {
      await expect(startPreviewServer(fixture.root, { port: server.port })).rejects.toThrow(
        `Preview port ${server.port} is already in use.`,
      );
    } finally {
      await server.close();
      await rm(fixture.parent, { force: true, recursive: true });
    }
  });
});
