#!/usr/bin/env npx tsx

import '../lib/cli-env';
import { Pool } from 'pg';
import { Concert } from '../lib/damai-crawler';
import {
  DUPLICATE_MERGE_THRESHOLD,
  getDuplicateScoreDetail,
  getDuplicateConflictReasons,
  hasDuplicateArtistConflict,
  hasStrongDuplicateAnchor,
} from '../lib/deduplication';
import { getConcertDisplayArtist, getConcertDisplayTitle, normalizeConcertRecord } from '../lib/concert-identity';

const args = process.argv.slice(2);
const minScore = readNumberArg('--min-score', 45);
const maxScore = readNumberArg('--max-score', 100);
const limit = readNumberArg('--limit', 100);

async function main() {
  const concerts = (await readConcerts()).map((concert) => normalizeConcertRecord(concert));
  const candidates = [] as DedupCandidateReport[];

  for (let i = 0; i < concerts.length; i += 1) {
    for (let j = i + 1; j < concerts.length; j += 1) {
      const left = concerts[i];
      const right = concerts[j];
      const detail = getDuplicateScoreDetail(left, right);

      if (detail.score < minScore || detail.score > maxScore) continue;

      const strongAnchor = hasStrongDuplicateAnchor(detail);
      const artistConflict = hasDuplicateArtistConflict(left, right, detail);
      const conflictReasons = getDuplicateConflictReasons(left, right, detail);
      candidates.push({
        left: summarizeConcert(left),
        right: summarizeConcert(right),
        score: Number(detail.score.toFixed(2)),
        titleSimilarity: Number(detail.titleSimilarity.toFixed(3)),
        venueSimilarity: Number(detail.venueSimilarity.toFixed(3)),
        artistOverlap: Number(detail.artistOverlap.toFixed(3)),
        cityMatched: detail.cityMatched,
        dateExact: detail.dateExact,
        dateNear: detail.dateNear,
        strongAnchor,
        artistConflict,
        productVariantConflict: detail.productVariantConflict,
        dateRangeConflict: detail.dateRangeConflict,
        conflictReasons,
        recommendedAction: detail.score >= DUPLICATE_MERGE_THRESHOLD && strongAnchor && conflictReasons.length === 0 ? 'merge_candidate' : 'review',
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.left.id.localeCompare(b.left.id) || a.right.id.localeCompare(b.right.id));

  console.log(JSON.stringify({
    dryRun: true,
    totalConcerts: concerts.length,
    totalCandidates: candidates.length,
    options: { minScore, maxScore, limit },
    threshold: DUPLICATE_MERGE_THRESHOLD,
    candidates: candidates.slice(0, limit),
  }, null, 2));
}

type ConcertSummary = {
  id: string;
  title: string;
  artist: string;
  city: string;
  date: string;
  venue: string;
  projectId: string | null;
};

type DedupCandidateReport = {
  left: ConcertSummary;
  right: ConcertSummary;
  score: number;
  titleSimilarity: number;
  venueSimilarity: number;
  artistOverlap: number;
  cityMatched: boolean;
  dateExact: boolean;
  dateNear: boolean;
  strongAnchor: boolean;
  artistConflict: boolean;
  productVariantConflict: boolean;
  dateRangeConflict: boolean;
  conflictReasons: string[];
  recommendedAction: 'merge_candidate' | 'review';
};

type ConcertReportRow = {
  id: string;
  title: string;
  image: string | null;
  date: string;
  city: string | null;
  venue: string | null;
  price: string | null;
  status: string | null;
  category: string | null;
  artist: string | null;
  raw_title: string | null;
  raw_artist_tag: string | null;
  artist_primary: string | null;
  artist_all: unknown;
  event_type: Concert['eventType'] | null;
  artist_confidence: number | string | null;
  artist_source: Concert['artistSource'] | null;
  is_tribute: boolean | null;
  is_famous: boolean | null;
  updated_at: number | string | null;
  source: Concert['source'] | null;
  source_url: string | null;
  event_date: string | Date | null;
  event_time: string | null;
  sort_at: string | Date | null;
  opportunity_status: Concert['opportunityStatus'] | null;
  opportunity_score: number | string | null;
  opportunity_score_breakdown: unknown;
  last_seen_at: number | string | null;
  project_id: string | null;
  notes: string | null;
};

async function readConcerts() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  try {
    const result = await pool.query<ConcertReportRow>('SELECT * FROM concerts ORDER BY sort_at ASC NULLS LAST, date ASC');
    return result.rows.map(rowToConcert);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read concerts for dedup report. 已加载 .env.local；请检查 DATABASE_URL 是否含字符串密码、DATABASE_SSL/sslmode 是否匹配。Original error: ${message}`);
  } finally {
    await pool.end();
  }
}

function rowToConcert(row: ConcertReportRow): Concert {
  return {
    id: row.id,
    title: row.title,
    image: row.image || '',
    date: row.date,
    city: row.city || '',
    venue: row.venue || '',
    price: row.price || '',
    status: row.status || 'Unknown',
    category: row.category || 'Concert',
    artist: row.artist || '',
    rawTitle: row.raw_title || row.title,
    rawArtistTag: row.raw_artist_tag || '',
    artistPrimary: row.artist_primary || '',
    artistAll: parseStringArray(row.artist_all),
    eventType: row.event_type || 'unknown',
    artistConfidence: row.artist_confidence != null ? Number(row.artist_confidence) : 0,
    artistSource: row.artist_source || 'unknown',
    is_tribute: row.is_tribute ?? false,
    is_famous: row.is_famous ?? true,
    updatedAt: Number(row.updated_at) || 0,
    source: row.source || 'damai',
    sourceUrl: row.source_url || '',
    eventDate: formatDateValue(row.event_date),
    eventTime: row.event_time || null,
    sortAt: row.sort_at ? new Date(row.sort_at).toISOString() : null,
    opportunityStatus: row.opportunity_status || 'new',
    opportunityScore: Number(row.opportunity_score) || 0,
    opportunityScoreBreakdown: parseOpportunityScoreBreakdown(row.opportunity_score_breakdown),
    lastSeenAt: Number(row.last_seen_at) || 0,
    projectId: row.project_id || null,
    notes: row.notes || '',
  };
}

function summarizeConcert(concert: Concert): ConcertSummary {
  return {
    id: concert.id,
    title: getConcertDisplayTitle(concert),
    artist: getConcertDisplayArtist(concert),
    city: concert.city,
    date: concert.date,
    venue: concert.venue,
    projectId: concert.projectId || null,
  };
}

function parseStringArray(value: unknown) {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }

  return [] as string[];
}

function parseOpportunityScoreBreakdown(value: unknown): Concert['opportunityScoreBreakdown'] {
  if (Array.isArray(value)) {
    return value.filter((item): item is { key: string; label: string; delta: number; matched: boolean } => (
      typeof item === 'object' &&
      item !== null &&
      typeof (item as { key?: unknown }).key === 'string' &&
      typeof (item as { label?: unknown }).label === 'string' &&
      typeof (item as { delta?: unknown }).delta === 'number' &&
      typeof (item as { matched?: unknown }).matched === 'boolean'
    ));
  }

  if (typeof value === 'string') {
    try {
      return parseOpportunityScoreBreakdown(JSON.parse(value));
    } catch {
      return [];
    }
  }

  return [];
}

function formatDateValue(value: string | Date | null) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function readNumberArg(name: string, fallback: number) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;

  const value = Number(args[index + 1]);
  return Number.isFinite(value) ? value : fallback;
}

main().catch((error) => {
  console.error('Dedup candidate report failed:', error);
  process.exit(1);
});
