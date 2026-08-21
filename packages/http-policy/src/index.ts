export const DEFAULT_MAX_RETRIES = 2;
export const DEFAULT_RETRY_DELAY_MS = 250;
export const DEFAULT_MAX_RETRY_DELAY_MS = 2_000;

export type HttpFetcher = (input: string, init?: RequestInit) => Promise<Response>;

export interface FetchWithRetryOptions {
  fetcher?: HttpFetcher;
  timeoutMs: number;
  maxRetries?: number;
  retryDelayMs?: number;
  maxRetryDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface ReadResponseBytesOptions {
  maxBytes: number;
  label: string;
}

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return value;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function errorMessage(error: unknown): string {
  if (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  ) {
    return 'request timed out';
  }
  return error instanceof Error ? error.message : String(error);
}

async function cancelResponse(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The response is being discarded before a retry; cancellation is best effort.
  }
}

export async function fetchWithRetry(
  input: string,
  init: RequestInit,
  options: FetchWithRetryOptions,
): Promise<Response> {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = positiveInteger(options.timeoutMs, 'timeoutMs');
  const maxRetries = nonNegativeInteger(
    options.maxRetries ?? DEFAULT_MAX_RETRIES,
    'maxRetries',
  );
  const retryDelayMs = nonNegativeInteger(
    options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
    'retryDelayMs',
  );
  const maxRetryDelayMs = nonNegativeInteger(
    options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS,
    'maxRetryDelayMs',
  );
  const sleep = options.sleep ?? delay;
  const attempts = maxRetries + 1;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const signal =
        init.signal === undefined || init.signal === null
          ? timeoutSignal
          : AbortSignal.any([init.signal, timeoutSignal]);
      const response = await fetcher(input, { ...init, signal });
      if (!RETRYABLE_STATUS_CODES.has(response.status) || attempt === maxRetries) {
        return response;
      }
      await cancelResponse(response);
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (init.signal?.aborted === true) {
        throw error;
      }
      lastError = error;
      if (attempt === maxRetries) {
        break;
      }
    }

    const retryDelay = Math.min(retryDelayMs * 2 ** attempt, maxRetryDelayMs);
    if (retryDelay > 0) {
      await sleep(retryDelay);
    }
  }

  throw new Error(
    `Request failed after ${attempts} attempt(s): ${errorMessage(lastError)}`,
    { cause: lastError },
  );
}

export async function readResponseBytes(
  response: Response,
  options: ReadResponseBytesOptions,
): Promise<Uint8Array> {
  const maxBytes = positiveInteger(options.maxBytes, 'maxBytes');
  const declaredLengthHeader = response.headers.get('content-length');
  if (declaredLengthHeader !== null) {
    const declaredLength = Number(declaredLengthHeader);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new Error(`${options.label} exceeds the ${maxBytes}-byte limit`);
    }
  }
  if (response.body === null) {
    return new Uint8Array();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel();
        throw new Error(`${options.label} exceeds the ${maxBytes}-byte limit`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readResponseText(
  response: Response,
  options: ReadResponseBytesOptions,
): Promise<string> {
  return new TextDecoder().decode(await readResponseBytes(response, options));
}
