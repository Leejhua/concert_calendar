/**
 * Proxy Node Pool — manages Clash proxy nodes for crawler resilience.
 *
 * Core responsibilities:
 *   1. Health-check all nodes in the configured proxy group via the Clash REST API.
 *   2. Build a healthy pool sorted by latency, with optional region preference.
 *   3. Switch between nodes (rotate) on failure or when a node enters cooldown.
 *   4. Track per-node cooldown state so rate-limited nodes are not reused too soon.
 *
 * All Clash API calls use the Node.js built-in `http` module (Clash listens on
 * plain HTTP, not HTTPS).  Authorization is `Bearer {CLASH_API_SECRET}`.
 *
 * Module-level singleton — state is shared across all importers, matching the
 * existing `proxy-agent.ts` convention.
 */

import http from 'node:http';
import { HttpsProxyAgent } from 'https-proxy-agent';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single proxy node with its last measured latency. */
export interface ProxyNode {
  /** Node name as reported by Clash (e.g. "HK-01", "JP-02"). */
  name: string;
  /** Latency in milliseconds, or `null` when the node is unreachable. */
  latency: number | null;
}

/** Entry in the cooldown table. */
export interface CooldownEntry {
  /** Node name. */
  name: string;
  /** Timestamp (ms since epoch) when the cooldown expires. */
  until: number;
}

/** Read-only snapshot of the pool's current state. */
export interface PoolStatus {
  /** Names of nodes currently in the healthy pool. */
  healthyNodes: string[];
  /** Nodes currently in cooldown with their expiry timestamps. */
  cooldownNodes: CooldownEntry[];
  /** The node the Clash GLOBAL group is currently set to, or null. */
  currentNode: string | null;
  /** Whether the pool has been successfully prepared. */
  poolPrepared: boolean;
}

/** Options that control pool building behaviour. */
export interface PoolOptions {
  /**
   * URL used for latency probing.
   * @default 'https://www.gstatic.com/generate_204'
   */
  testUrl?: string;
  /**
   * Timeout (ms) for each node's health-check request.
   * @default 5000
   */
  testTimeout?: number;
  /**
   * Maximum number of nodes to keep in the healthy pool.
   * @default 10
   */
  maxPoolSize?: number;
  /**
   * Ordered list of preferred region codes.  Nodes whose name matches a
   * preferred region are ranked higher (given a latency discount).
   * Example: `['HK', 'TW', 'SG', 'JP']`
   */
  regionPreference?: string[];
}

// ---------------------------------------------------------------------------
// Constants (from environment, with sensible defaults)
// ---------------------------------------------------------------------------

const CLASH_API_URL: string = process.env.CLASH_API_URL || 'http://127.0.0.1:9097';
const CLASH_API_SECRET: string = process.env.CLASH_API_SECRET || '';
const CLASH_PROXY_GROUP: string = process.env.CLASH_PROXY_GROUP || 'GLOBAL';

/** The Clash mixed-port URL — all proxied traffic flows through this port. */
const PROXY_URL: string = process.env.PROXY_URL || 'http://127.0.0.1:7890';

const DEFAULT_TEST_URL = 'https://www.gstatic.com/generate_204';
const DEFAULT_TEST_TIMEOUT = 5000;
const DEFAULT_MAX_POOL_SIZE = 10;

/** Hard timeout for every Clash API call (prevents hanging). */
const CLASH_API_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Region detection
// ---------------------------------------------------------------------------

/** Mapping from region code → regex patterns that match node names. */
const REGION_PATTERNS: Readonly<Record<string, RegExp[]>> = {
  HK: [/HK/i, /香港/i],
  TW: [/TW/i, /台湾/i, /台北/i],
  SG: [/SG/i, /新加坡/i],
  JP: [/JP/i, /日本/i, /东京/i],
};

/**
 * Extract a region code from a Clash node name.
 * Returns `'OTHER'` when no known region pattern matches.
 */
function extractRegion(nodeName: string): string {
  for (const [region, patterns] of Object.entries(REGION_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(nodeName)) {
        return region;
      }
    }
  }
  return 'OTHER';
}

// ---------------------------------------------------------------------------
// Module-level state (singleton)
// ---------------------------------------------------------------------------

/** Ordered list of healthy node names (best first). */
let healthyPool: string[] = [];

/** The node currently active in the Clash GLOBAL group (best-effort tracking). */
let currentNode: string | null = null;

/** nodeName → expiry timestamp (Date.now() + duration). */
const cooldownMap = new Map<string, number>();

/** `true` after a successful `prepareProxyPool()` call. */
let poolPrepared = false;

// ---------------------------------------------------------------------------
// Internal: Clash API helper
// ---------------------------------------------------------------------------

/**
 * Make a request to the Clash REST API.
 *
 * @param path   URL path relative to `CLASH_API_URL` (e.g. `/proxies/GLOBAL`).
 * @param method HTTP method (default `'GET'`).
 * @param body   Optional JSON body for `PUT` requests.
 * @returns Parsed JSON response, or `undefined` for 204 No Content.
 */
function clashRequest(
  path: string,
  method: 'GET' | 'PUT' = 'GET',
  body?: object,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, CLASH_API_URL);
    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || 9097,
      path: url.pathname + url.search,
      method,
      headers: {
        Authorization: `Bearer ${CLASH_API_SECRET}`,
        'Content-Type': 'application/json',
      },
      timeout: CLASH_API_TIMEOUT_MS,
    };

    const req = http.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        if (res.statusCode === 204) {
          resolve(undefined);
          return;
        }
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(raw ? JSON.parse(raw) : undefined);
          } catch {
            resolve(raw);
          }
        } else {
          reject(
            new Error(
              `Clash API ${method} ${path} returned ${res.statusCode}: ${raw.slice(0, 200)}`,
            ),
          );
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Clash API ${method} ${path} timed out after ${CLASH_API_TIMEOUT_MS}ms`));
    });

    if (body !== undefined) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Internal: Node scoring
// ---------------------------------------------------------------------------

/**
 * Compute a sortable score for a node.
 *
 * Lower score = better.  Primary factor is latency; preferred regions receive
 * a discount so they rank ahead of equally-fast non-preferred nodes.
 */
function scoreNode(
  nodeName: string,
  latency: number,
  regionPreference: readonly string[],
): number {
  const region = extractRegion(nodeName);
  const prefIndex = regionPreference.indexOf(region);
  // Each tier of preference gives a 100 ms effective discount.
  const regionBonus = prefIndex >= 0 ? (regionPreference.length - prefIndex) * 100 : 0;
  return latency - regionBonus;
}

// ---------------------------------------------------------------------------
// Internal: Health check
// ---------------------------------------------------------------------------

/**
 * Probe a single node's latency via the Clash delay endpoint.
 *
 * @returns Latency in ms, or `null` if the node is unreachable / times out.
 */
async function checkNodeHealth(
  nodeName: string,
  testUrl: string,
  timeout: number,
): Promise<number | null> {
  try {
    const result = (await clashRequest(
      `/proxies/${encodeURIComponent(nodeName)}/delay?url=${encodeURIComponent(testUrl)}&timeout=${timeout}`,
    )) as { delay: number } | undefined;
    if (result && typeof result.delay === 'number') {
      return result.delay;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Internal: Build the healthy pool
// ---------------------------------------------------------------------------

/**
 * Fetch all nodes from the proxy group, health-check each one, filter dead
 * nodes, sort by score, and return the top N.
 */
async function buildHealthyPool(options: PoolOptions): Promise<string[]> {
  const testUrl: string = options.testUrl ?? DEFAULT_TEST_URL;
  const timeout: number = options.testTimeout ?? DEFAULT_TEST_TIMEOUT;
  const maxPoolSize: number = options.maxPoolSize ?? DEFAULT_MAX_POOL_SIZE;
  const regionPreference: readonly string[] = options.regionPreference ?? [];

  // 1. Fetch the full node list from Clash.
  let allNodes: string[];
  try {
    const groupInfo = (await clashRequest(
      `/proxies/${encodeURIComponent(CLASH_PROXY_GROUP)}`,
    )) as { type: string; all: string[]; now: string };
    allNodes = groupInfo.all ?? [];
  } catch (err) {
    console.warn(
      `[proxy-pool] Failed to fetch proxy group info: ${(err as Error).message}`,
    );
    return [];
  }

  if (allNodes.length === 0) {
    console.warn('[proxy-pool] No nodes found in proxy group');
    return [];
  }

  console.log(`[proxy-pool] Health-checking ${allNodes.length} nodes …`);

  // 2. Probe every node (sequential — avoids overwhelming the Clash API).
  const results: ProxyNode[] = [];
  for (const nodeName of allNodes) {
    if (!isNodeAvailable(nodeName)) {
      continue; // still in cooldown
    }
    const latency = await checkNodeHealth(nodeName, testUrl, timeout);
    results.push({ name: nodeName, latency });
  }

  // 3. Filter out dead nodes.
  const alive = results.filter((n) => n.latency !== null);
  const deadCount = results.length - alive.length;
  if (deadCount > 0) {
    console.log(`[proxy-pool] ${deadCount} node(s) unreachable — filtered out`);
  }

  if (alive.length === 0) {
    console.warn('[proxy-pool] All nodes are dead or in cooldown');
    return [];
  }

  // 4. Sort by score (latency with region-preference discount).
  alive.sort((a, b) => {
    const scoreA = scoreNode(a.name, a.latency as number, regionPreference);
    const scoreB = scoreNode(b.name, b.latency as number, regionPreference);
    return scoreA - scoreB;
  });

  // 5. Take the top N.
  const topNodes = alive.slice(0, maxPoolSize).map((n) => n.name);
  const best = alive[0];
  console.log(
    `[proxy-pool] Healthy pool: ${topNodes.length} node(s) ` +
      `(best: ${best.name} @ ${best.latency}ms, region: ${extractRegion(best.name)})`,
  );

  return topNodes;
}

// ---------------------------------------------------------------------------
// Internal: Node switching
// ---------------------------------------------------------------------------

/**
 * Tell Clash to switch the proxy group to a specific node.
 */
async function switchNode(nodeName: string): Promise<void> {
  await clashRequest(
    `/proxies/${encodeURIComponent(CLASH_PROXY_GROUP)}`,
    'PUT',
    { name: nodeName },
  );
  currentNode = nodeName;
  console.log(`[proxy-pool] Switched to node: ${nodeName}`);
}

/**
 * Rotate to the next available node in the healthy pool.
 *
 * Skips nodes that are currently in cooldown.  Wraps around when the current
 * node is at the end of the list.
 *
 * @returns The name of the node switched to.
 * @throws When no available node exists in the pool.
 */
async function rotateToNextNode(): Promise<string> {
  if (healthyPool.length === 0) {
    throw new Error('No healthy nodes available in pool');
  }

  const currentIdx = currentNode ? healthyPool.indexOf(currentNode) : -1;

  // Try every node after the current one, wrapping around.
  for (let offset = 1; offset <= healthyPool.length; offset++) {
    const idx = (currentIdx + offset) % healthyPool.length;
    const candidate = healthyPool[idx];
    if (isNodeAvailable(candidate)) {
      await switchNode(candidate);
      return candidate;
    }
  }

  throw new Error('All nodes in pool are in cooldown');
}

// ---------------------------------------------------------------------------
// Internal: Cooldown management
// ---------------------------------------------------------------------------

/**
 * Put a node into cooldown for `durationMs` milliseconds.
 */
export function markNodeCooldown(nodeName: string, durationMs: number): void {
  const until = Date.now() + durationMs;
  cooldownMap.set(nodeName, until);
  console.log(
    `[proxy-pool] Node "${nodeName}" in cooldown until ${new Date(until).toISOString()}`,
  );
}

/**
 * Check whether a node is currently available (not in cooldown).
 *
 * Expired cooldown entries are automatically cleaned up on access.
 */
function isNodeAvailable(nodeName: string): boolean {
  const until = cooldownMap.get(nodeName);
  if (until === undefined) return true;
  if (Date.now() >= until) {
    cooldownMap.delete(nodeName);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Prepare the proxy pool for use.
 *
 * Health-checks all nodes in the configured proxy group, builds a sorted
 * healthy pool, and switches to the best node.
 *
 * **Degradation**: if the Clash API is unreachable or all nodes are dead,
 * `poolPrepared` is set to `false` and callers fall back to the single-node
 * `PROXY_URL` path (P0 behaviour).
 *
 * @param options Optional overrides for test URL, timeout, pool size, and
 *                region preference.
 */
export async function prepareProxyPool(options?: PoolOptions): Promise<void> {
  console.log('[proxy-pool] Preparing proxy pool …');

  if (!CLASH_API_SECRET) {
    console.warn('[proxy-pool] CLASH_API_SECRET not set — pool not prepared');
    poolPrepared = false;
    return;
  }

  try {
    healthyPool = await buildHealthyPool(options ?? {});
    if (healthyPool.length > 0) {
      await switchNode(healthyPool[0]);
      poolPrepared = true;
      console.log(
        `[proxy-pool] Pool ready: ${healthyPool.length} node(s), current = ${currentNode}`,
      );
    } else {
      poolPrepared = false;
      console.warn('[proxy-pool] No healthy nodes — pool not prepared');
    }
  } catch (err) {
    poolPrepared = false;
    console.warn(`[proxy-pool] Pool preparation failed: ${(err as Error).message}`);
  }
}

/**
 * Return an `HttpsProxyAgent` that routes through the current pool node.
 *
 * The agent always points to the Clash mixed port (`PROXY_URL`).  Node
 * switching is handled transparently at the Clash API level — all traffic
 * through this port automatically uses whichever node the GLOBAL group is
 * currently set to.
 *
 * @returns An agent instance, or `null` when the pool is not prepared.
 */
export function getCurrentProxyAgent(): HttpsProxyAgent<string> | null {
  if (!poolPrepared || !currentNode) {
    return null;
  }
  return new HttpsProxyAgent(PROXY_URL);
}

/**
 * Query Clash for the name of the currently-active node in the proxy group.
 *
 * Falls back to the last-known `currentNode` when the API is unreachable.
 */
export async function getCurrentNode(): Promise<string> {
  try {
    const groupInfo = (await clashRequest(
      `/proxies/${encodeURIComponent(CLASH_PROXY_GROUP)}`,
    )) as { now: string };
    const now = groupInfo.now ?? '';
    if (now) {
      currentNode = now;
    }
    return now || currentNode || '';
  } catch {
    return currentNode ?? '';
  }
}

/**
 * Return a read-only snapshot of the pool's current state.
 */
export function getPoolStatus(): PoolStatus {
  const now = Date.now();
  const cooldownNodes: CooldownEntry[] = [];
  for (const [name, until] of cooldownMap.entries()) {
    if (now < until) {
      cooldownNodes.push({ name, until });
    }
  }
  return {
    healthyNodes: [...healthyPool],
    cooldownNodes,
    currentNode,
    poolPrepared,
  };
}

/**
 * Unified entry point for handling a node failure.
 *
 * Called by both the crawler (on rate-limit / access-denied responses) and
 * `proxy-retry.ts` (on network-layer errors).  Inspects the error to decide
 * whether to switch nodes and how long to cool down the current node.
 *
 * | Trigger              | Action                          |
 * |----------------------|---------------------------------|
 * | `RGV587`             | Switch + 15 min cooldown        |
 * | `ILLEGAL_ACCESS`     | Switch + 30 min cooldown        |
 * | `TRAFFIC_LIMIT`      | Keep node, caller slows down    |
 * | `ECONNRESET` / etc.  | Switch + 5 min cooldown         |
 * | Unknown              | Switch (no cooldown)            |
 */
export async function handleNodeFailure(
  error: Error & { code?: string; retMsg?: string },
): Promise<void> {
  const code: string = error.code ?? '';
  const retMsg: string = error.retMsg ?? error.message ?? '';

  let cooldownMs = 0;
  let shouldSwitch = false;

  if (retMsg.includes('RGV587')) {
    cooldownMs = 15 * 60 * 1000;
    shouldSwitch = true;
    console.warn('[proxy-pool] RGV587 → switching node + 15 min cooldown');
  } else if (retMsg.includes('ILLEGAL_ACCESS')) {
    cooldownMs = 30 * 60 * 1000;
    shouldSwitch = true;
    console.warn('[proxy-pool] ILLEGAL_ACCESS → switching node + 30 min cooldown');
  } else if (retMsg.includes('TRAFFIC_LIMIT')) {
    // Keep the current node; the caller is responsible for adding a delay.
    console.warn('[proxy-pool] TRAFFIC_LIMIT → keeping node, caller should slow down');
    return;
  } else if (['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT'].includes(code)) {
    cooldownMs = 5 * 60 * 1000;
    shouldSwitch = true;
    console.warn(`[proxy-pool] Network error ${code} → switching node + 5 min cooldown`);
  } else {
    shouldSwitch = true;
    console.warn(
      `[proxy-pool] Unknown failure "${retMsg}" (code: ${code}) → attempting node switch`,
    );
  }

  // Apply cooldown to the current node before switching away from it.
  if (cooldownMs > 0 && currentNode) {
    markNodeCooldown(currentNode, cooldownMs);
  }

  if (shouldSwitch) {
    try {
      await rotateToNextNode();
    } catch (err) {
      console.warn(`[proxy-pool] Node rotation failed: ${(err as Error).message}`);
      // If every node is exhausted, mark the pool as degraded.
      if (healthyPool.length === 0 || healthyPool.every((n) => !isNodeAvailable(n))) {
        poolPrepared = false;
        console.warn('[proxy-pool] All nodes exhausted — pool degraded');
      }
    }
  }
}
