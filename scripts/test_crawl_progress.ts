/**
 * Unit tests for lib/crawl-progress.ts
 *
 * Tests: readProgress, writeProgress, clearProgress, getCompletedCities,
 * updateSourceProgress — covering happy path, edge cases, and error handling.
 *
 * All tests run SEQUENTIALLY to avoid file-system race conditions on the
 * shared crawl-progress.json file.
 */

import fs from 'fs';
import path from 'path';
import {
  readProgress,
  writeProgress,
  clearProgress,
  getCompletedCities,
  updateSourceProgress,
  CrawlProgress,
} from '../lib/crawl-progress';

// --- Test Helpers ---

const DATA_DIR = path.join(process.cwd(), 'data');
const PROGRESS_FILE = path.join(DATA_DIR, 'crawl-progress.json');

function ensureCleanState(): void {
  if (fs.existsSync(PROGRESS_FILE)) {
    fs.unlinkSync(PROGRESS_FILE);
  }
}

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

// --- Sequential Test Runner ---

interface TestCase {
  name: string;
  fn: () => Promise<void>;
}

async function runAllTests(tests: TestCase[]): Promise<{ passed: number; failed: number }> {
  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test.fn();
      passed++;
      console.log(`  ✅ ${test.name}`);
    } catch (err: unknown) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ ${test.name}: ${msg}`);
    }
  }

  return { passed, failed };
}

// --- Test Cases ---

const tests: TestCase[] = [
  {
    name: 'readProgress returns null when no file',
    fn: async () => {
      ensureCleanState();
      const result = await readProgress();
      assert(result === null, 'readProgress should return null when no file exists');
    },
  },
  {
    name: 'writeProgress + readProgress round-trip',
    fn: async () => {
      ensureCleanState();
      const progress: CrawlProgress = {
        damai: { completedCities: ['北京', '上海'], lastCity: '上海', totalFetched: 42 },
        timestamp: 1234567890,
      };
      await writeProgress(progress);
      const result = await readProgress();
      assert(result !== null, 'readProgress should return data after write');
      assertEqual(result!.damai?.completedCities, ['北京', '上海'], 'completedCities should match');
      assertEqual(result!.damai?.lastCity, '上海', 'lastCity should match');
      assertEqual(result!.damai?.totalFetched, 42, 'totalFetched should match');
      assertEqual(result!.timestamp, 1234567890, 'timestamp should match');
    },
  },
  {
    name: 'writeProgress creates data directory',
    fn: async () => {
      // Remove data dir if it exists
      if (fs.existsSync(DATA_DIR)) {
        fs.rmSync(DATA_DIR, { recursive: true, force: true });
      }
      const progress: CrawlProgress = { timestamp: Date.now() };
      await writeProgress(progress);
      assert(fs.existsSync(DATA_DIR), 'writeProgress should create data directory');
      assert(fs.existsSync(PROGRESS_FILE), 'writeProgress should create progress file');
    },
  },
  {
    name: 'clearProgress removes file',
    fn: async () => {
      ensureCleanState();
      const progress: CrawlProgress = { timestamp: Date.now() };
      await writeProgress(progress);
      assert(fs.existsSync(PROGRESS_FILE), 'file should exist before clear');
      await clearProgress();
      assert(!fs.existsSync(PROGRESS_FILE), 'clearProgress should remove the file');
    },
  },
  {
    name: 'clearProgress succeeds when no file',
    fn: async () => {
      ensureCleanState();
      await clearProgress();
      assert(true, 'clearProgress should succeed silently when no file exists');
    },
  },
  {
    name: 'getCompletedCities returns [] when no file',
    fn: async () => {
      ensureCleanState();
      const cities = await getCompletedCities('damai');
      assertEqual(cities, [], 'should return empty array when no progress file');
    },
  },
  {
    name: 'getCompletedCities returns [] when source missing',
    fn: async () => {
      ensureCleanState();
      const progress: CrawlProgress = {
        moretickets: { completedCities: ['深圳'], lastCity: '深圳', totalFetched: 10 },
        timestamp: Date.now(),
      };
      await writeProgress(progress);
      const cities = await getCompletedCities('damai');
      assertEqual(cities, [], 'should return empty array when source not in progress');
    },
  },
  {
    name: 'getCompletedCities returns correct cities',
    fn: async () => {
      ensureCleanState();
      const progress: CrawlProgress = {
        damai: { completedCities: ['北京', '上海', '广州'], lastCity: '广州', totalFetched: 100 },
        timestamp: Date.now(),
      };
      await writeProgress(progress);
      const cities = await getCompletedCities('damai');
      assertEqual(cities, ['北京', '上海', '广州'], 'should return completed cities for damai');
    },
  },
  {
    name: 'updateSourceProgress creates new file',
    fn: async () => {
      ensureCleanState();
      await updateSourceProgress('damai', '北京', 20);
      const progress = await readProgress();
      assert(progress !== null, 'progress should be created');
      assertEqual(progress!.damai?.completedCities, ['北京'], 'should have one city');
      assertEqual(progress!.damai?.lastCity, '北京', 'lastCity should be set');
      assertEqual(progress!.damai?.totalFetched, 20, 'totalFetched should be 20');
    },
  },
  {
    name: 'updateSourceProgress appends city',
    fn: async () => {
      ensureCleanState();
      await updateSourceProgress('damai', '北京', 20);
      await updateSourceProgress('damai', '上海', 15);
      const progress = await readProgress();
      assertEqual(progress!.damai?.completedCities, ['北京', '上海'], 'should have two cities');
      assertEqual(progress!.damai?.lastCity, '上海', 'lastCity should be updated');
      assertEqual(progress!.damai?.totalFetched, 35, 'totalFetched should accumulate');
    },
  },
  {
    name: 'updateSourceProgress avoids duplicates',
    fn: async () => {
      ensureCleanState();
      await updateSourceProgress('damai', '北京', 20);
      await updateSourceProgress('damai', '北京', 10);
      const progress = await readProgress();
      assertEqual(progress!.damai?.completedCities, ['北京'], 'should not duplicate city');
      assertEqual(progress!.damai?.totalFetched, 30, 'totalFetched should still accumulate');
    },
  },
  {
    name: 'updateSourceProgress handles multiple sources',
    fn: async () => {
      ensureCleanState();
      await updateSourceProgress('damai', '北京', 20);
      await updateSourceProgress('moretickets', '深圳', 10);
      await updateSourceProgress('moreticketsGlobal', '香港', 5);
      const progress = await readProgress();
      assert(progress!.damai !== undefined, 'damai should exist');
      assert(progress!.moretickets !== undefined, 'moretickets should exist');
      assert(progress!.moreticketsGlobal !== undefined, 'moreticketsGlobal should exist');
      assertEqual(progress!.damai?.completedCities, ['北京'], 'damai cities');
      assertEqual(progress!.moretickets?.completedCities, ['深圳'], 'moretickets cities');
      assertEqual(progress!.moreticketsGlobal?.completedCities, ['香港'], 'moreticketsGlobal cities');
    },
  },
  {
    name: 'updateSourceProgress updates timestamp',
    fn: async () => {
      ensureCleanState();
      await updateSourceProgress('damai', '北京', 20);
      const first = await readProgress();
      const firstTs = first!.timestamp;

      // Small delay to ensure timestamp difference
      await new Promise((r) => setTimeout(r, 10));

      await updateSourceProgress('damai', '上海', 15);
      const second = await readProgress();
      assert(second!.timestamp > firstTs, 'timestamp should be updated on each write');
    },
  },
  {
    name: 'readProgress throws on corrupted JSON',
    fn: async () => {
      ensureCleanState();
      // Write invalid JSON
      fs.writeFileSync(PROGRESS_FILE, 'not valid json{{{', 'utf-8');
      try {
        await readProgress();
        assert(false, 'should have thrown on corrupted JSON');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        assert(
          err instanceof SyntaxError ||
            msg.includes('JSON') ||
            msg.includes('Unexpected'),
          `should throw parse error, got: ${msg}`,
        );
      }
    },
  },
];

// --- Main ---

async function main(): Promise<void> {
  console.log('\n🧪 Testing lib/crawl-progress.ts\n');

  const { passed, failed } = await runAllTests(tests);

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed (${passed + failed} total)\n`);

  // Clean up
  ensureCleanState();

  if (failed > 0) {
    process.exit(1);
  }
}

main();
