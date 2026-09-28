/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Proxy-aware retry logic for network requests.
 *
 * Detects proxy-related errors (connection reset, refused, timeout) and
 * retries the operation with configurable backoff. Non-proxy errors are
 * re-thrown immediately without retry.
 *
 * P1: `handleProxyFailure` now delegates to `handleNodeFailure` in
 * `proxy-pool.ts`, which switches to a healthy node and applies cooldown
 * to the failing one.
 */

import { handleNodeFailure } from './proxy-pool';

// --- Constants ---

/** Error codes that indicate a proxy / network-layer failure worth retrying. */
export const PROXY_ERROR_CODES = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT'] as const;

// --- Type Definitions ---

export interface ProxyRetryOptions {
  /** Maximum number of retry attempts (default 3). */
  maxRetries?: number;
  /** Delay in ms before each retry attempt (default [2000, 5000, 10000]). */
  retryDelays?: number[];
}

// --- Error Classification ---

/**
 * Determine whether an error is a proxy / network-layer failure.
 * Only errors whose `.code` matches one of PROXY_ERROR_CODES are considered
 * proxy errors.
 */
export function isProxyError(err: Error & { code?: string }): boolean {
  if (!err.code) return false;
  return (PROXY_ERROR_CODES as readonly string[]).includes(err.code);
}

// --- Proxy Failure Handler (P1: delegates to proxy-pool) ---

/**
 * Handle a detected proxy failure by delegating to the proxy pool.
 *
 * `handleNodeFailure` inspects the error code / message and decides whether
 * to switch nodes and how long to cool down the current one.
 *
 * If the pool is not prepared or the rotation fails, the error is logged
 * and execution continues with the current node (degraded mode).
 */
export async function handleProxyFailure(err: Error): Promise<void> {
  const code = (err as Error & { code?: string }).code ?? 'UNKNOWN';
  console.warn(`[proxy] Proxy failure: ${err.message} (code: ${code})`);
  try {
    await handleNodeFailure(err);
  } catch (e) {
    console.warn(
      `[proxy] Node failure handling failed: ${(e as Error).message} — continuing with current node`,
    );
  }
}

// --- Retry Wrapper ---

/**
 * Execute an async function with proxy-aware retry logic.
 *
 * Behaviour:
 * - If `fn()` throws an error classified as a proxy error, the handler is
 *   invoked, a delay is applied, and the function is retried up to `maxRetries`
 *   times.
 * - If `fn()` throws a non-proxy error, it is re-thrown immediately (no retry).
 * - If all retries are exhausted, the last error is thrown.
 *
 * @param fn      The async operation to wrap.
 * @param options Optional retry configuration.
 * @returns The resolved value of `fn()` on success.
 */
export async function withProxyRetry<T>(
  fn: () => Promise<T>,
  options?: ProxyRetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const delays = options?.retryDelays ?? [2000, 5000, 10000];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      if (!isProxyError(err) || attempt >= maxRetries) {
        throw err;
      }
      await handleProxyFailure(err);
      const delay = delays[attempt] ?? delays[delays.length - 1];
      console.warn(
        `[proxy] Retry ${attempt + 1}/${maxRetries} after ${delay}ms...`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  // Should be unreachable — the loop either returns or throws.
  throw new Error('Unreachable: withProxyRetry loop exhausted without result');
}
