import {
  DEFAULT_PREVIEW_PORT,
  startPreviewServer,
  type PreviewServer,
} from '@site-rescue/preview-server';
import { verifyStaticSite } from '@site-rescue/static-verifier';

export interface PreviewOptions {
  port?: number;
  signal?: AbortSignal;
  writeLine?: (line: string) => void;
}

export interface PreviewResult {
  directory: string;
  origin: string;
  port: number;
}

async function waitForStop(server: PreviewServer, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    await server.close();
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const stop = (): void => {
      void server.close().then(resolve, reject);
    };
    signal.addEventListener('abort', stop, { once: true });
    void server.closed.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', stop);
    });
  });
}

export async function runPreview(
  directory: string,
  options: PreviewOptions = {},
): Promise<PreviewResult> {
  const verification = await verifyStaticSite(directory);
  if (!verification.valid) {
    throw new Error(
      `Static site verification failed with ${verification.issueCount} issue(s). Run site-rescue verify <site-directory> for details.`,
    );
  }

  const server = await startPreviewServer(directory, {
    port: options.port ?? DEFAULT_PREVIEW_PORT,
  });
  const writeLine = options.writeLine ?? console.log;
  const internalController = options.signal === undefined ? new AbortController() : undefined;
  const signal = options.signal ?? internalController!.signal;
  const stop = (): void => internalController?.abort();

  if (internalController !== undefined) {
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  }

  try {
    writeLine('Site Rescue preview ready');
    writeLine(`Directory: ${server.directory}`);
    writeLine(`URL: ${server.origin}/`);
    writeLine('Press Ctrl+C to stop.');
    await waitForStop(server, signal);
    return {
      directory: server.directory,
      origin: server.origin,
      port: server.port,
    };
  } finally {
    if (internalController !== undefined) {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
    }
    await server.close();
  }
}
