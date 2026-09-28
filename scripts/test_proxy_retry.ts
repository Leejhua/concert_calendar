/**
 * Unit tests for lib/proxy-retry.ts
 *
 * Tests: isProxyError classification, withProxyRetry retry behavior,
 * non-proxy error passthrough, retry exhaustion, and custom options.
 */

import { isProxyError, withProxyRetry, PROXY_ERROR_CODES, ProxyRetryOptions } from '../lib/proxy-retry';

// --- Test Helpers ---

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `FAIL: ${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`,
    );
  }
}

let passed = 0;
let failed = 0;

function runTest(name: string, fn: () => Promise<void> | void): void {
  try {
    const result = fn();
    if (result instanceof Promise) {
      result
        .then(() => {
          passed++;
          console.log(`  ✅ ${name}`);
        })
        .catch((err) => {
          failed++;
          console.error(`  ❌ ${name}: ${err.message}`);
        });
    } else {
      passed++;
      console.log(`  ✅ ${name}`);
    }
  } catch (err: unknown) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ❌ ${name}: ${msg}`);
  }
}

// --- Helper: create an error with a specific code ---
function makeError(message: string, code?: string): Error & { code?: string } {
  const err = new Error(message) as Error & { code?: string };
  if (code) err.code = code;
  return err;
}

// --- Test Cases: isProxyError ---

function testIsProxyErrorECONNRESET(): void {
  const err = makeError('socket hang up', 'ECONNRESET');
  assert(isProxyError(err), 'ECONNRESET should be classified as proxy error');
}

function testIsProxyErrorECONNREFUSED(): void {
  const err = makeError('connection refused', 'ECONNREFUSED');
  assert(isProxyError(err), 'ECONNREFUSED should be classified as proxy error');
}

function testIsProxyErrorETIMEDOUT(): void {
  const err = makeError('connect ETIMEDOUT', 'ETIMEDOUT');
  assert(isProxyError(err), 'ETIMEDOUT should be classified as proxy error');
}

function testIsProxyErrorNoCode(): void {
  const err = makeError('some random error');
  assert(!isProxyError(err), 'error without code should not be proxy error');
}

function testIsProxyErrorUnknownCode(): void {
  const err = makeError('DNS lookup failed', 'ENOTFOUND');
  assert(!isProxyError(err), 'ENOTFOUND should not be classified as proxy error');
}

function testIsProxyErrorHTTPError(): void {
  const err = makeError('HTTP 500');
  assert(!isProxyError(err), 'error without code should not be proxy error');
}

function testIsProxyErrorENOENT(): void {
  const err = makeError('file not found', 'ENOENT');
  assert(!isProxyError(err), 'ENOENT should not be proxy error');
}

// --- Test Cases: withProxyRetry ---

async function testWithProxyRetrySuccessFirstAttempt(): Promise<void> {
  let callCount = 0;
  const result = await withProxyRetry(async () => {
    callCount++;
    return 'success';
  });
  assertEqual(result, 'success', 'should return the function result');
  assertEqual(callCount, 1, 'should only call fn once on success');
}

async function testWithProxyRetryRetriesOnProxyError(): Promise<void> {
  let callCount = 0;
  const result = await withProxyRetry(
    async () => {
      callCount++;
      if (callCount < 3) {
        throw makeError('socket hang up', 'ECONNRESET');
      }
      return 'recovered';
    },
    { maxRetries: 3, retryDelays: [10, 20, 30] }, // Short delays for tests
  );
  assertEqual(result, 'recovered', 'should eventually succeed after retries');
  assertEqual(callCount, 3, 'should retry exactly 2 times then succeed on 3rd');
}

async function testWithProxyRetryThrowsNonProxyImmediately(): Promise<void> {
  let callCount = 0;
  try {
    await withProxyRetry(
      async () => {
        callCount++;
        throw new Error('business logic error');
      },
      { maxRetries: 3, retryDelays: [10, 20, 30] },
    );
    assert(false, 'should have thrown');
  } catch (err: unknown) {
    const e = err as Error;
    assertEqual(e.message, 'business logic error', 'should throw original error');
    assertEqual(callCount, 1, 'should NOT retry non-proxy errors');
  }
}

async function testWithProxyRetryThrowsAfterExhaustion(): Promise<void> {
  let callCount = 0;
  try {
    await withProxyRetry(
      async () => {
        callCount++;
        throw makeError('connect ETIMEDOUT', 'ETIMEDOUT');
      },
      { maxRetries: 2, retryDelays: [10, 20] },
    );
    assert(false, 'should have thrown after exhaustion');
  } catch (err: unknown) {
    const e = err as Error & { code?: string };
    assertEqual(e.code, 'ETIMEDOUT', 'should preserve error code');
    assertEqual(callCount, 3, 'should call fn maxRetries+1 times (initial + 2 retries)');
  }
}

async function testWithProxyRetryDefaultMaxRetries(): Promise<void> {
  let callCount = 0;
  try {
    await withProxyRetry(async () => {
      callCount++;
      throw makeError('connect ETIMEDOUT', 'ETIMEDOUT');
    }, { retryDelays: [5, 5, 5, 5] }); // 4 delays for 3 retries
    assert(false, 'should have thrown');
  } catch {
    // Default maxRetries is 3, so total calls = 4 (initial + 3 retries)
    assertEqual(callCount, 4, 'default maxRetries=3 means 4 total calls');
  }
}

async function testWithProxyRetryCustomDelays(): Promise<void> {
  // Verify that custom options (maxRetries, retryDelays) are accepted
  // and the function retries accordingly.
  const options: ProxyRetryOptions = { maxRetries: 1, retryDelays: [42] };
  let callCount = 0;
  try {
    await withProxyRetry(
      async () => {
        callCount++;
        throw makeError('socket hang up', 'ECONNRESET');
      },
      options,
    );
  } catch {
    // Expected to exhaust
  }
  assertEqual(callCount, 2, 'custom maxRetries=1 means 2 total calls');
}

async function testWithProxyRetryMixedErrors(): Promise<void> {
  // First error is proxy (retry), second is non-proxy (throw immediately)
  let callCount = 0;
  try {
    await withProxyRetry(
      async () => {
        callCount++;
        if (callCount === 1) {
          throw makeError('socket hang up', 'ECONNRESET');
        }
        throw new Error('business error');
      },
      { maxRetries: 3, retryDelays: [10, 20, 30] },
    );
    assert(false, 'should have thrown');
  } catch (err: unknown) {
    const e = err as Error;
    assertEqual(e.message, 'business error', 'should throw the non-proxy error');
    assertEqual(callCount, 2, 'should retry once then throw on non-proxy');
  }
}

async function testWithProxyRetryPreservesReturnType(): Promise<void> {
  const result = await withProxyRetry(async () => 42);
  assertEqual(result, 42, 'should preserve number return type');
  assertEqual(typeof result, 'number', 'return type should be number');
}

async function testWithProxyRetryPreservesObjectReturn(): Promise<void> {
  const obj = { key: 'value', nested: { a: 1 } };
  const result = await withProxyRetry(async () => obj);
  assertEqual(result, obj, 'should preserve object return type');
}

// --- Test Cases: PROXY_ERROR_CODES constant ---

function testProxyErrorCodesConstant(): void {
  assertEqual(PROXY_ERROR_CODES.length, 3, 'should have exactly 3 error codes');
  assert(PROXY_ERROR_CODES.includes('ECONNRESET'), 'should include ECONNRESET');
  assert(PROXY_ERROR_CODES.includes('ECONNREFUSED'), 'should include ECONNREFUSED');
  assert(PROXY_ERROR_CODES.includes('ETIMEDOUT'), 'should include ETIMEDOUT');
}

// --- Run All Tests ---

async function main(): Promise<void> {
  console.log('\n🧪 Testing lib/proxy-retry.ts\n');

  // Synchronous tests
  runTest('isProxyError: ECONNRESET → true', testIsProxyErrorECONNRESET);
  runTest('isProxyError: ECONNREFUSED → true', testIsProxyErrorECONNREFUSED);
  runTest('isProxyError: ETIMEDOUT → true', testIsProxyErrorETIMEDOUT);
  runTest('isProxyError: no code → false', testIsProxyErrorNoCode);
  runTest('isProxyError: ENOTFOUND → false', testIsProxyErrorUnknownCode);
  runTest('isProxyError: no code (HTTP error) → false', testIsProxyErrorHTTPError);
  runTest('isProxyError: ENOENT → false', testIsProxyErrorENOENT);
  runTest('PROXY_ERROR_CODES constant has 3 codes', testProxyErrorCodesConstant);

  // Async tests
  runTest('withProxyRetry: success on first attempt', testWithProxyRetrySuccessFirstAttempt);
  runTest('withProxyRetry: retries on proxy error then succeeds', testWithProxyRetryRetriesOnProxyError);
  runTest('withProxyRetry: throws non-proxy error immediately', testWithProxyRetryThrowsNonProxyImmediately);
  runTest('withProxyRetry: throws after exhausting retries', testWithProxyRetryThrowsAfterExhaustion);
  runTest('withProxyRetry: default maxRetries=3', testWithProxyRetryDefaultMaxRetries);
  runTest('withProxyRetry: custom options accepted', testWithProxyRetryCustomDelays);
  runTest('withProxyRetry: mixed proxy then non-proxy errors', testWithProxyRetryMixedErrors);
  runTest('withProxyRetry: preserves number return type', testWithProxyRetryPreservesReturnType);
  runTest('withProxyRetry: preserves object return type', testWithProxyRetryPreservesObjectReturn);

  // Wait for async tests to settle
  await new Promise((r) => setTimeout(r, 1000));

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed (${passed + failed} total)\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
