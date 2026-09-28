#!/usr/bin/env npx tsx

import '../lib/cli-env';
import fs from 'fs';
import path from 'path';
import { Concert } from '../lib/damai-crawler';
import { getConcertDisplayTitle, normalizeConcertRecord } from '../lib/concert-identity';
import { buildConcertMetadata } from '../lib/concert-utils';

const args = process.argv.slice(2);
const limit = readNumberArg('--limit', 10);
const format = readStringArg('--format', 'json');
const source = readStringArg('--source', 'file');
const dataDir = readStringArg('--data-dir', path.join('data', 'concerts'));

async function main() {
  if (format !== 'json') {
    throw new Error(`Unsupported --format "${format}". Only "json" is supported.`);
  }

  const concerts = (await readConcerts()).map(prepareConcert).sort(compareConcerts);
  const categories: Record<string, SampleConcert[]> = {
    eventType_multi_artist: sample(concerts, (concert) => concert.eventType === 'multi_artist'),
    eventType_tribute: sample(concerts, (concert) => concert.eventType === 'tribute'),
    eventType_fan_meeting: sample(concerts, (concert) => concert.eventType === 'fan_meeting'),
    artistPrimary_empty: sample(concerts, (concert) => !concert.artistPrimary),
    legacy_artist_unknown: sample(concerts, (concert) => getOriginalLegacyArtist(concert).trim().toLowerCase() === 'unknown'),
    artistAll_length_gte_2: sample(concerts, (concert) => (concert.artistAll || []).length >= 2),
    opportunityScore_gte_80: sample(concerts, (concert) => getScore(concert) >= 80),
    opportunityScore_lte_40: sample(concerts, (concert) => getScore(concert) <= 40),
    english_japanese_korean_name_or_title: sample(concerts, hasEnglishJapaneseOrKoreanSignal),
    dedup_or_merged_clues: sample(concerts, hasDedupOrMergedClue),
  };

  console.log(JSON.stringify({
    dryRun: true,
    readOnly: true,
    source,
    dataDir: source === 'file' ? dataDir : null,
    totalConcerts: concerts.length,
    options: { limit, format },
    metadata: {
      scoreNote: 'opportunityScore uses stored value when present; otherwise it is computed in memory from existing scoring rules.',
      dedupNote: categories.dedup_or_merged_clues.length > 0
        ? 'dedup_or_merged_clues matched fields such as mergedFrom/duplicateIds/projectId/notes/sourceUrl.'
        : 'TODO: no explicit dedup/merged fields were found in sampled records; use report:dedup-candidates for pairwise dedup review.',
    },
    categories,
  }, null, 2));
}

type SampleConcert = {
  id: string;
  source: Concert['source'] | null;
  rawTitle: string;
  title: string;
  displayTitle: string;
  artist: string;
  legacyArtist: string;
  artistPrimary: string;
  artistAll: string[];
  eventType: Concert['eventType'] | null;
  opportunityScore: number;
  venue: string;
  city: string;
  date: string;
  eventDate: string | null;
  sourceUrl: string;
  artistConfidence: number | null;
  artistSource: Concert['artistSource'] | null;
  projectId: string | null;
  dedupOrMergedMetadata: Record<string, unknown> | null;
};

type JsonConcert = Concert & Record<string, unknown>;

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

function prepareConcert(concert: Concert): JsonConcert {
  const normalized = normalizeConcertRecord(concert);
  const metadata = buildConcertMetadata(normalized);
  return {
    ...normalized,
    originalLegacyArtist: concert.artist || '',
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

function sample(concerts: JsonConcert[], predicate: (concert: JsonConcert) => boolean) {
  return concerts.filter(predicate).slice(0, limit).map(toSampleConcert);
}

function toSampleConcert(concert: JsonConcert): SampleConcert {
  return {
    id: concert.id,
    source: concert.source || null,
    rawTitle: concert.rawTitle || concert.title,
    title: concert.title,
    displayTitle: getConcertDisplayTitle(concert),
    artist: concert.artist || '',
    legacyArtist: getOriginalLegacyArtist(concert),
    artistPrimary: concert.artistPrimary || '',
    artistAll: concert.artistAll || [],
    eventType: concert.eventType || null,
    opportunityScore: getScore(concert),
    venue: concert.venue || '',
    city: concert.city || '',
    date: concert.date || '',
    eventDate: concert.eventDate || null,
    sourceUrl: concert.sourceUrl || '',
    artistConfidence: typeof concert.artistConfidence === 'number' ? concert.artistConfidence : null,
    artistSource: concert.artistSource || null,
    projectId: concert.projectId || null,
    dedupOrMergedMetadata: getDedupOrMergedMetadata(concert),
  };
}

function getOriginalLegacyArtist(concert: JsonConcert) {
  return typeof concert.originalLegacyArtist === 'string' ? concert.originalLegacyArtist : concert.artist || '';
}

function hasEnglishJapaneseOrKoreanSignal(concert: JsonConcert) {
  const value = [
    concert.rawTitle,
    concert.title,
    concert.artist,
    concert.artistPrimary,
    ...(concert.artistAll || []),
  ].filter(Boolean).join(' ');

  return /[A-Za-z]/.test(value) || /[\u3040-\u30ff\uac00-\ud7af]/.test(value);
}

function hasDedupOrMergedClue(concert: JsonConcert) {
  return getDedupOrMergedMetadata(concert) !== null;
}

function getDedupOrMergedMetadata(concert: JsonConcert) {
  const metadata: Record<string, unknown> = {};
  for (const key of ['mergedFrom', 'duplicateIds', 'dedupScore', 'duplicateScore', 'projectId']) {
    if (concert[key] !== undefined && concert[key] !== null && concert[key] !== '') metadata[key] = concert[key];
  }
  if (typeof concert.notes === 'string' && /dedup|duplicate|merge|合并|去重/i.test(concert.notes)) {
    metadata.notes = concert.notes;
  }
  if (typeof concert.sourceUrl === 'string' && /duplicate|merge|dedup/i.test(concert.sourceUrl)) {
    metadata.sourceUrl = concert.sourceUrl;
  }

  return Object.keys(metadata).length > 0 ? metadata : null;
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
  console.error('Data quality sample report failed:', error);
  process.exit(1);
});
