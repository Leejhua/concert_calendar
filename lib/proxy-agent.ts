/**
 * Centralized HTTP proxy support for all crawlers.
 *
 * **P1 update**: `getProxyAgent()` now prefers the proxy-pool's current node
 * when the pool has been prepared.  Falls back to the single-node `PROXY_URL`
 * when the pool is not ready — preserving P0 behaviour.
 *
 * Reads the `PROXY_URL` environment variable (default `http://127.0.0.1:7890`,
 * matching a local Clash setup). When enabled it:
 *   1. Creates an `HttpsProxyAgent` instance — used as the `agent` option for
 *      `https.request()` calls inside the crawlers.
 *   2. Installs an undici `ProxyAgent` as the global dispatcher — so the global
 *      `fetch()` calls (e.g. DeepSeek enhancement and upload step) also route
 *      through the proxy.
 *
 * When `PROXY_URL` is empty or the string `"false"`, proxying is fully disabled
 * and all existing behaviour is preserved.
 *
 * Usage:
 *   - In each crawler: import { getProxyAgent } and pass `agent: getProxyAgent() ?? undefined`
 *     into the `https.request` options.
 *   - In every entry point (route.ts / crawl_and_upload.ts / sync_data.ts) import this
 *     module once as a side-effect so the global dispatcher is configured before any
 *     network call runs.
 */

import { HttpsProxyAgent } from 'https-proxy-agent';
import { ProxyAgent as UndiciProxyAgent, setGlobalDispatcher } from 'undici';
import { getCurrentProxyAgent, getPoolStatus } from './proxy-pool';
import type https from 'node:https';

/** Default proxy URL matches a standard local Clash HTTP proxy. */
const DEFAULT_PROXY_URL = 'http://127.0.0.1:7890';

/** Raw value read from the environment, with a sensible default. */
const rawProxyUrl: string = (process.env.PROXY_URL ?? DEFAULT_PROXY_URL).trim();

/**
 * A proxy is considered enabled only when a non-empty, non-"false" URL is
 * configured. This keeps existing direct-connection behaviour untouched when
 * the variable is explicitly cleared.
 */
const isProxyEnabled: boolean = rawProxyUrl !== '' && rawProxyUrl.toLowerCase() !== 'false';

/** Cached `HttpsProxyAgent` for the single-node fallback path. */
let fallbackAgent: HttpsProxyAgent<string> | null = null;

/** Whether the global undici dispatcher has been configured for the proxy. */
let globalDispatcherConfigured = false;

/**
 * Lazily build the fallback `HttpsProxyAgent` so that the proxy connection is
 * only established when the first crawler actually needs it. Returns `null`
 * when the proxy is disabled — callers should pass `undefined` (not `null`) to
 * `https.request` to fall back to the default agent.
 */
function ensureFallbackAgent(): HttpsProxyAgent<string> | null {
  if (!isProxyEnabled) {
    return null;
  }
  if (!fallbackAgent) {
    fallbackAgent = new HttpsProxyAgent(rawProxyUrl);
  }
  return fallbackAgent;
}

/**
 * Configure the global undici dispatcher (used by the built-in `fetch`) once.
 * Safe to call repeatedly; only the first call has any effect.
 */
function ensureGlobalDispatcher(): void {
  if (!isProxyEnabled || globalDispatcherConfigured) {
    return;
  }
  setGlobalDispatcher(new UndiciProxyAgent(rawProxyUrl));
  globalDispatcherConfigured = true;
}

/**
 * Returns the proxy agent suitable for passing to `https.request`'s `agent`
 * option, or `null` when the proxy is disabled.
 *
 * **P1**: When the proxy pool is prepared (`poolPrepared === true`), the agent
 * returned routes through the pool's current node (which is the Clash mixed
 * port — node switching is transparent).  When the pool is not ready, falls
 * back to the single-node `PROXY_URL` (P0 behaviour).
 *
 * Callers should do: `agent: getProxyAgent() ?? undefined`
 */
export function getProxyAgent(): https.Agent | null {
  // Make sure the global fetch dispatcher is configured even if a crawler is
  // imported independently (defensive — entry points also import for the side effect).
  ensureGlobalDispatcher();

  // Prefer the pool's current node when available.
  const poolStatus = getPoolStatus();
  if (poolStatus.poolPrepared && poolStatus.currentNode) {
    const poolAgent = getCurrentProxyAgent();
    if (poolAgent) {
      return poolAgent;
    }
  }

  // Fallback: single-node PROXY_URL (P0 behaviour).
  return ensureFallbackAgent();
}

/** Resolved proxy configuration, exposed for logging/diagnostics. */
export const PROXY_CONFIG = {
  url: rawProxyUrl,
  enabled: isProxyEnabled,
} as const;

// Re-export pool status for diagnostics.
export { getPoolStatus };

// --- Side-effect on import: wire up the global fetch dispatcher immediately. ---
// Importing this module from any entry point is enough to enable proxying for
// every `fetch()` call that follows. The per-request `https.request` agent is
// still obtained explicitly via `getProxyAgent()`.
ensureGlobalDispatcher();

if (isProxyEnabled) {
  console.log(`[proxy] HTTP proxy enabled: ${rawProxyUrl}`);
} else {
  console.log('[proxy] HTTP proxy disabled (PROXY_URL empty or "false")');
}
