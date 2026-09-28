/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Checkpoint persistence for crawl progress.
 *
 * Provides read/write/clear operations on a JSON file that tracks which cities
 * have been completed per source, enabling incremental / resumable crawls.
 *
 * File location: data/crawl-progress.json
 */

import fs from 'fs';
import path from 'path';

// --- Type Definitions ---

export interface SourceProgress {
  completedCities: string[];
  lastCity: string;
  totalFetched: number;
}

export interface CrawlProgress {
  damai?: SourceProgress;
  moretickets?: SourceProgress;
  moreticketsGlobal?: SourceProgress;
  timestamp: number;
}

// --- Internal Helpers ---

const DATA_DIR = path.join(process.cwd(), 'data');
const PROGRESS_FILE = path.join(DATA_DIR, 'crawl-progress.json');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// --- Public API ---

/**
 * Read the current crawl progress from disk.
 * Returns null if the file does not exist (first run / cleared).
 */
export async function readProgress(): Promise<CrawlProgress | null> {
  try {
    const raw = await fs.promises.readFile(PROGRESS_FILE, 'utf-8');
    return JSON.parse(raw) as CrawlProgress;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

/**
 * Write (overwrite) the crawl progress to disk.
 * Creates the data directory if it does not exist.
 */
export async function writeProgress(progress: CrawlProgress): Promise<void> {
  ensureDataDir();
  const json = JSON.stringify(progress, null, 2);
  await fs.promises.writeFile(PROGRESS_FILE, json, 'utf-8');
}

/**
 * Delete the crawl progress file, effectively resetting all checkpoint state.
 * Succeeds silently if the file does not exist.
 */
export async function clearProgress(): Promise<void> {
  try {
    await fs.promises.unlink(PROGRESS_FILE);
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}

/**
 * Convenience: return the list of completed cities for a given source.
 * Returns an empty array if no progress exists for that source.
 */
export async function getCompletedCities(
  source: 'damai' | 'moretickets' | 'moreticketsGlobal',
): Promise<string[]> {
  const progress = await readProgress();
  if (!progress) return [];
  const sourceProgress = progress[source];
  if (!sourceProgress) return [];
  return sourceProgress.completedCities;
}

/**
 * Incrementally update progress for a single source.
 *
 * Reads the current progress, appends `cityName` to the completed list,
 * updates `lastCity` and `totalFetched`, then writes back.
 *
 * If no progress file exists yet, a new one is created with the given source
 * as the only entry.
 */
export async function updateSourceProgress(
  source: 'damai' | 'moretickets' | 'moreticketsGlobal',
  cityName: string,
  fetchedCount: number,
): Promise<void> {
  let progress = await readProgress();

  if (!progress) {
    progress = { timestamp: Date.now() };
  }

  const existing = progress[source];
  if (existing) {
    // Avoid duplicate city entries
    if (!existing.completedCities.includes(cityName)) {
      existing.completedCities.push(cityName);
    }
    existing.lastCity = cityName;
    existing.totalFetched += fetchedCount;
  } else {
    progress[source] = {
      completedCities: [cityName],
      lastCity: cityName,
      totalFetched: fetchedCount,
    };
  }

  progress.timestamp = Date.now();
  await writeProgress(progress);
}
