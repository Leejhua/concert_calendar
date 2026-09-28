#!/usr/bin/env npx tsx

import '../lib/cli-env';
import fs from 'fs';
import path from 'path';
import { Concert } from '../lib/damai-crawler';
import { getConcertDisplayTitle, normalizeConcertRecord } from '../lib/concert-identity';
import { buildConcertMetadata } from '../lib/concert-utils';

const args = process.argv.slice(2);
const limit = readNumberArg('--limit', 10);
const source = readStringArg('--source', 'file');
const dataDir = readStringArg('--data-dir', path.join('data', 'concerts'));

async function main() {
  const concerts = (await readConcerts()).map(prepareConcert).sort(compareConcerts);
  const sortedByScoreDesc = [...concerts].sort((a, b) => getScore(b) - getScore(a) || a.id.localeCompare(b.id));
  const sortedByScoreAsc = [...concerts].sort((a, b) => getScore(a) - getScore(b) || a.id.localeCompare(b.id));

  console.log(JSON.stringify({
    dryRun: true,
    readOnly: true,
    source,
    dataDir: source === 'file' ? dataDir : null,
    options: { limit },
    total: concerts.length,
    scoreBuckets: buildScoreBuckets(concerts),
    eventTypeCounts: buildEventTypeCounts(concerts),
    topSamples: sortedByScoreDesc.slice(0, limit).map(toSampleConcert),
    highSamples: sortedByScoreDesc.filter((concert) => getScore(concert) >= 80).slice(0, limit).map(toSampleConcert),
    lowSamples: sortedByScoreAsc.filter((concert) => getScore(concert) <= 40).slice(0, limit).map(toSampleConcert),
    missingArtistPrimaryCount: concerts.filter((concert) => !concert.artistPrimary).length,
    artistAllGte2Count: concerts.filter((concert) => (concert.artistAll || []).length >= 2).length,
    metadata: {
      scoreNote: 'opportunityScore uses stored value when present; otherwise it is computed in memory from existing scoring rules.',
    },
  }, null, 2));
}

type SampleConcert = {
  id: string;
  source: Concert['source'] | null;
  rawTitle: string;
  title: string;
  displayTitle: string;
  artist: string;
  artistPrimary: string;
  artistAll: string[];
  eventType: Concert['eventType'] | null;
  opportunityScore: number;
  venue: string;
  city: string;
  date: string;
};

async function readConcerts(): Promise<Concert[]> {
  if (source === 'file') return readConcertsFromFiles(dataDir);
  if (source === 'db') return readConcertsFromDb();
  throw new Error(`Unsupported --source "${source}". Use "file" or "db".`);
}

function readConcertsFromFiles(rawDataDir: string) {
  const absoluteDataDir = path.isAbsolute(rawDataDir) ? rawDataDir : path.join(process.cwd(), rawDataDir);
  if (!fs.existsSync(absoluteDataDir)) {
    throw new Error(`Unable to read local concert snapshots. Directory not found: ${absoluteDataDir}`);
  }

  const concerts: Concert[] = [];
  const files = fs.readdirSync(absoluteDataDir)
    .filter((file) => file.endsWith('.json'))
    .sort((left, right) => left.localeCompare(right));

  for (const file of files) {
    const filePath = path.join(absoluteDataDir, file);
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (Array.isArray(parsed)) concerts.push(...parsed);
  }

  return concerts;
}

async function readConcertsFromDb() {
  try {
    const { getAllConcertsFromStorage } = await import('../lib/db');
    return await getAllConcertsFromStorage();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read concerts from DB. 已加载 .env.local；请检查 DATABASE_URL 是否含字符串密码、DATABASE_SSL/sslmode 是否匹配，或使用 --source file --data-dir data/concerts。Original error: ${message}`);
  }
}

function prepareConcert(concert: Concert): Concert {
  const normalized = normalizeConcertRecord(concert);
  const metadata = buildConcertMetadata(normalized);
  return {
    ...normalized,
    eventDate: normalized.eventDate || metadata.eventDate,
    eventTime: normalized.eventTime || metadata.eventTime,
    sortAt: normalized.sortAt || metadata.sortAt,
    source: normalized.source || metadata.source,
    sourceUrl: normalized.sourceUrl || metadata.sourceUrl,
    opportunityStatus: normalized.opportunityStatus || metadata.opportunityStatus,
    opportunityScore: typeof normalized.opportunityScore === 'number' ? normalized.opportunityScore : metadata.opportunityScore,
    opportunityScoreBreakdown: normalized.opportunityScoreBreakdown || metadata.opportunityScoreBreakdown,
    lastSeenAt: normalized.lastSeenAt || metadata.lastSeenAt,
  };
}

function buildScoreBuckets(concerts: Concert[]) {
  const buckets = {
    '0-20': 0,
    '21-40': 0,
    '41-60': 0,
    '61-80': 0,
    '81-100': 0,
  };

  for (const concert of concerts) {
    const score = getScore(concert);
    if (score <= 20) buckets['0-20'] += 1;
    else if (score <= 40) buckets['21-40'] += 1;
    else if (score <= 60) buckets['41-60'] += 1;
    else if (score <= 80) buckets['61-80'] += 1;
    else buckets['81-100'] += 1;
  }

  return buckets;
}

function buildEventTypeCounts(concerts: Concert[]) {
  return concerts.reduce<Record<string, number>>((counts, concert) => {
    const key = concert.eventType || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function toSampleConcert(concert: Concert): SampleConcert {
  return {
    id: concert.id,
    source: concert.source || null,
    rawTitle: concert.rawTitle || concert.title,
    title: concert.title,
    displayTitle: getConcertDisplayTitle(concert),
    artist: concert.artist || '',
    artistPrimary: concert.artistPrimary || '',
    artistAll: concert.artistAll || [],
    eventType: concert.eventType || null,
    opportunityScore: getScore(concert),
    venue: concert.venue || '',
    city: concert.city || '',
    date: concert.date || '',
  };
}

function getScore(concert: Pick<Concert, 'opportunityScore'>) {
  return typeof concert.opportunityScore === 'number' && Number.isFinite(concert.opportunityScore) ? concert.opportunityScore : 0;
}

function compareConcerts(a: Concert, b: Concert) {
  const left = a.sortAt ? new Date(a.sortAt).getTime() : Number.MAX_SAFE_INTEGER;
  const right = b.sortAt ? new Date(b.sortAt).getTime() : Number.MAX_SAFE_INTEGER;
  if (left !== right) return left - right;
  return a.id.localeCompare(b.id);
}

function readNumberArg(name: string, fallback: number) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(args[index + 1]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function readStringArg(name: string, fallback: string) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
}

main().catch((error) => {
  console.error('Opportunity score distribution report failed:', error);
  process.exit(1);
});
