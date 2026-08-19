import { realpath, readFile, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';

export const PREVIEW_HOST = '127.0.0.1' as const;
export const DEFAULT_PREVIEW_PORT = 4173;

export interface PreviewServerOptions {
  port?: number;
}

export interface PreviewServer {
  directory: string;
  host: typeof PREVIEW_HOST;
  port: number;
  origin: string;
  closed: Promise<void>;
  close(): Promise<void>;
}

type RequestErrorStatus = 400 | 403 | 404;

class RequestError extends Error {
  constructor(readonly status: RequestErrorStatus) {
    super(String(status));
  }
}

const MEDIA_TYPES: Readonly<Record<string, string>> = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.htm': 'text/html; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.ogv': 'video/ogg',
  '.otf': 'font/otf',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
};

function validatePort(port: number): void {
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error('Preview port must be an integer between 0 and 65535.');
  }
}

function isWithinRoot(root: string, target: string): boolean {
  const pathFromRoot = relative(root, target);
  return pathFromRoot === '' || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== '..' && !isAbsolute(pathFromRoot));
}

function requestSegments(requestUrl: string): string[] {
  let pathname: string;
  try {
    pathname = new URL(requestUrl, `http://${PREVIEW_HOST}`).pathname;
  } catch {
    throw new RequestError(400);
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    throw new RequestError(400);
  }
  if (decoded.includes('\\') || decoded.includes('\0')) {
    throw new RequestError(400);
  }
  const segments = decoded.split('/').filter((segment) => segment !== '');
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new RequestError(403);
  }
  return segments;
}

async function resolveRequestFile(
  root: string,
  realRoot: string,
  requestUrl: string,
): Promise<string> {
  const segments = requestSegments(requestUrl);
  let candidate = resolve(root, ...segments);
  let candidateInformation: Awaited<ReturnType<typeof stat>>;

  try {
    candidateInformation = await stat(candidate);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new RequestError(404);
    }
    throw error;
  }
  if (candidateInformation.isDirectory()) {
    candidate = resolve(candidate, 'index.html');
  }

  let realCandidate: string;
  try {
    realCandidate = await realpath(candidate);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new RequestError(404);
    }
    throw error;
  }
  if (!isWithinRoot(realRoot, realCandidate)) {
    throw new RequestError(403);
  }
  const information = await stat(realCandidate);
  if (!information.isFile()) {
    throw new RequestError(404);
  }
  return realCandidate;
}

function baseHeaders(contentType: string): Record<string, string> {
  return {
    'cache-control': 'no-store',
    'content-type': contentType,
    'x-content-type-options': 'nosniff',
  };
}

function sendText(response: ServerResponse, status: number, text: string): void {
  const body = Buffer.from(`${text}\n`, 'utf8');
  response.writeHead(status, {
    ...baseHeaders('text/plain; charset=utf-8'),
    'content-length': String(body.byteLength),
  });
  response.end(body);
}

async function handleRequest(
  root: string,
  realRoot: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('allow', 'GET, HEAD');
    sendText(response, 405, 'Method not allowed');
    return;
  }

  try {
    const file = await resolveRequestFile(root, realRoot, request.url ?? '/');
    const bytes = await readFile(file);
    const contentType = MEDIA_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
    response.writeHead(200, {
      ...baseHeaders(contentType),
      'content-length': String(bytes.byteLength),
    });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch (error) {
    if (error instanceof RequestError) {
      const messages: Record<RequestErrorStatus, string> = {
        400: 'Bad request',
        403: 'Forbidden',
        404: 'Not found',
      };
      sendText(response, error.status, messages[error.status]);
      return;
    }
    sendText(response, 500, 'Internal server error');
  }
}

function listenErrorMessage(port: number, error: unknown): string {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'EADDRINUSE') {
    return `Preview port ${port} is already in use.`;
  }
  return `Could not start preview server: ${error instanceof Error ? error.message : String(error)}`;
}

export async function startPreviewServer(
  directory: string,
  options: PreviewServerOptions = {},
): Promise<PreviewServer> {
  const port = options.port ?? DEFAULT_PREVIEW_PORT;
  validatePort(port);
  const root = resolve(directory);
  const rootInformation = await stat(root);
  if (!rootInformation.isDirectory()) {
    throw new Error(`Preview directory is not a directory: ${root}`);
  }
  const realRoot = await realpath(root);
  const server = createServer((request, response) => {
    void handleRequest(root, realRoot, request, response);
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    const onError = (error: Error): void => {
      rejectListen(new Error(listenErrorMessage(port, error)));
    };
    server.once('error', onError);
    server.listen(port, PREVIEW_HOST, () => {
      server.off('error', onError);
      resolveListen();
    });
  });

  const address = server.address() as AddressInfo;
  const closed = new Promise<void>((resolveClosed) => {
    server.once('close', resolveClosed);
  });
  let closePromise: Promise<void> | undefined;
  const close = (): Promise<void> => {
    closePromise ??= new Promise<void>((resolveClose, rejectClose) => {
      if (!server.listening) {
        resolveClose();
        return;
      }
      server.close((error) => {
        if (error === undefined) {
          resolveClose();
        } else {
          rejectClose(error);
        }
      });
    });
    return closePromise;
  };

  return {
    directory: root,
    host: PREVIEW_HOST,
    port: address.port,
    origin: `http://${PREVIEW_HOST}:${address.port}`,
    closed,
    close,
  };
}
