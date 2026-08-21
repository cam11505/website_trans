import { describe, expect, it, vi } from 'vitest';
import { fetchWithRetry, readResponseBytes, readResponseText } from '../src/index.js';

describe('HTTP policy', () => {
  it('retries transient HTTP responses with deterministic bounded backoff', async () => {
    const responses = [503, 429, 200];
    const fetcher = vi.fn(async () => {
      const status = responses.shift()!;
      return new Response(status === 200 ? 'ok' : 'retry', { status });
    });
    const sleep = vi.fn(async () => undefined);

    const response = await fetchWithRetry('https://example.test/', {}, {
      fetcher,
      maxRetries: 2,
      retryDelayMs: 10,
      maxRetryDelayMs: 15,
      sleep,
      timeoutMs: 1_000,
    });

    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[10], [15]]);
  });

  it('does not retry permanent HTTP responses', async () => {
    const fetcher = vi.fn(async () => new Response('missing', { status: 404 }));

    const response = await fetchWithRetry('https://example.test/missing', {}, {
      fetcher,
      maxRetries: 2,
      retryDelayMs: 0,
      timeoutMs: 1_000,
    });

    expect(response.status).toBe(404);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('retries network failures and reports exhausted attempts', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('connection reset');
    });

    await expect(
      fetchWithRetry('https://example.test/', {}, {
        fetcher,
        maxRetries: 1,
        retryDelayMs: 0,
        timeoutMs: 1_000,
      }),
    ).rejects.toThrow('Request failed after 2 attempt(s): connection reset');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('aborts a stalled attempt at the configured timeout', async () => {
    const fetcher = vi.fn(
      async (_input: string, init?: RequestInit): Promise<Response> =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), {
            once: true,
          });
        }),
    );

    await expect(
      fetchWithRetry('https://example.test/', {}, {
        fetcher,
        maxRetries: 0,
        timeoutMs: 1,
      }),
    ).rejects.toThrow('Request failed after 1 attempt(s): request timed out');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('enforces declared and streamed body limits before returning bytes', async () => {
    await expect(
      readResponseBytes(
        new Response('small', { headers: { 'content-length': '100' } }),
        { label: 'asset', maxBytes: 5 },
      ),
    ).rejects.toThrow('asset exceeds the 5-byte limit');

    await expect(
      readResponseText(new Response('123456'), { label: 'HTML document', maxBytes: 5 }),
    ).rejects.toThrow('HTML document exceeds the 5-byte limit');
    await expect(
      readResponseText(new Response('hello'), { label: 'HTML document', maxBytes: 5 }),
    ).resolves.toBe('hello');
  });
});
