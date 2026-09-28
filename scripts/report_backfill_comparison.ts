#!/usr/bin/env npx tsx

/**
 * Backfill before/after comparison report (read-only).
 *
 * Compares the known pre-backfill state of the 715 legacy concert records
 * (all `eventType=unknown`, `artistSource=unknown`, `artistConfidence=0`,
 * artist fields mostly missing, rawTitle uncleaned) against the current DB
 * state after the identity backfill + rededup run.
 *
 * This script is strictly read-only: it opens a raw `pg` Pool and only issues
 * SELECT queries. It does NOT import `lib/db` (which would trigger
 * `ensureTable()` -> `backfillConcertMetadata()` and write to the DB).
 */

import '../lib/cli-env';
import { Pool } from 'pg';

const LOW_CONFIDENCE_THRESHOLD = 0.55;

// Pre-backfill known state, extracted from historical pipeline records.
// Before the identity backfill, all 715 legacy records shared these traits.
const PRE_BACKFILL_TOTAL = 715;
const PRE_BACKFILL = {
  total: PRE_BACKFILL_TOTAL,
  eventType: { unknown: PRE_BACKFILL_TOTAL } as Record<string, number>,
  artistSource: { unknown: PRE_BACKFILL_TOTAL } as Record<string, number>,
  artistConfidence: { zero: PRE_BACKFILL_TOTAL } as Record<string, number>,
  artistPrimaryCoverage: { has: 0, missing: PRE_BACKFILL_TOTAL, rate: 0 },
  artistAllCoverage: { has: 0, missing: PRE_BACKFILL_TOTAL, rate: 0 },
  rawTitleCleaned: false,
  lowConfidenceCount: PRE_BACKFILL_TOTAL,
};

type SampleConcert = {
  id: string;
  rawTitle: string;
  title: string;
  artist: string;
  artistPrimary: string;
  artistAll: string[];
  eventType: string;
  artistConfidence: number;
  artistSource: string;
  city: string;
  venue: string;
  eventDate: string | null;
  opportunityScore: number;
  sourceUrl: string;
};

type ComparisonReport = {
  dryRun: boolean;
  readOnly: boolean;
  generatedAt: string;
  source: 'db';
  databaseUrlHost: string | null;
  preBackfill: typeof PRE_BACKFILL;
  postBackfill: {
    total: number;
    eventType: Record<string, number>;
    artistSource: Record<string, number>;
    artistConfidence: Record<string, number>;
    artistPrimaryCoverage: { has: number; missing: number; rate: number };
    artistAllCoverage: { has: number; missing: number; rate: number };
    rawTitleCleaned: boolean;
    lowConfidenceCount: number;
    confidenceStats: { min: number; max: number; avg: number };
  };
  delta: {
    total: number;
    eventTypeUnknown: { before: number; after: number };
    artistSourceUnknown: { before: number; after: number };
    artistConfidenceZero: { before: number; after: number };
    artistPrimaryCoverageRate: { before: number; after: number };
    artistAllCoverageRate: { before: number; after: number };
    lowConfidenceCount: { before: number; after: number };
  };
  samples: {
    successCases: SampleConcert[];
    unknownCases: SampleConcert[];
  };
  metadata: {
    note: string;
    preBackfillSource: string;
    lowConfidenceThreshold: number;
  };
};

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set. Make sure .env.local is loaded.');
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 4,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 5000,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  try {
    const host = safeParseHost(databaseUrl);

    const total = await queryTotal(pool);
    const eventTypeCounts = await queryEventTypeCounts(pool);
    const artistSourceCounts = await queryArtistSourceCounts(pool);
    const artistConfidenceBuckets = await queryArtistConfidenceBuckets(pool);
    const coverage = await queryCoverage(pool);
    const confidenceStats = await queryConfidenceStats(pool);
    const rawTitleCleaned = await queryRawTitleCleaned(pool);
    const lowConfidenceCount = await queryLowConfidenceCount(pool);
    const successCases = await querySuccessCases(pool, 5);
    const unknownCases = await queryUnknownCases(pool, 5);

    const postBackfill = {
      total,
      eventType: eventTypeCounts,
      artistSource: artistSourceCounts,
      artistConfidence: artistConfidenceBuckets,
      artistPrimaryCoverage: coverage.artistPrimary,
      artistAllCoverage: coverage.artistAll,
      rawTitleCleaned,
      lowConfidenceCount,
      confidenceStats,
    };

    const delta = {
      total: postBackfill.total - PRE_BACKFILL.total,
      eventTypeUnknown: {
        before: PRE_BACKFILL.eventType.unknown || 0,
        after: postBackfill.eventType.unknown || 0,
      },
      artistSourceUnknown: {
        before: PRE_BACKFILL.artistSource.unknown || 0,
        after: postBackfill.artistSource.unknown || 0,
      },
      artistConfidenceZero: {
        before: PRE_BACKFILL.artistConfidence.zero || 0,
        after: postBackfill.artistConfidence.zero || 0,
      },
      artistPrimaryCoverageRate: {
        before: PRE_BACKFILL.artistPrimaryCoverage.rate,
        after: postBackfill.artistPrimaryCoverage.rate,
      },
      artistAllCoverageRate: {
        before: PRE_BACKFILL.artistAllCoverage.rate,
        after: postBackfill.artistAllCoverage.rate,
      },
      lowConfidenceCount: {
        before: PRE_BACKFILL.lowConfidenceCount,
        after: postBackfill.lowConfidenceCount,
      },
    };

    const report: ComparisonReport = {
      dryRun: true,
      readOnly: true,
      generatedAt: new Date().toISOString(),
      source: 'db',
      databaseUrlHost: host,
      preBackfill: PRE_BACKFILL,
      postBackfill,
      delta,
      samples: {
        successCases,
        unknownCases,
      },
      metadata: {
        note:
          'Pre-backfill state is reconstructed from historical pipeline records (all 715 legacy records had eventType=unknown, artistSource=unknown, artistConfidence=0, and artist fields mostly missing). Post-backfill state is read live from the DB via SELECT-only queries.',
        preBackfillSource: 'historical pipeline records (pre-identity-backfill snapshot)',
        lowConfidenceThreshold: LOW_CONFIDENCE_THRESHOLD,
      },
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await pool.end();
  }
}

async function queryTotal(pool: Pool): Promise<number> {
  const result = await pool.query('SELECT COUNT(*)::int AS total FROM concerts');
  return result.rows[0].total;
}

async function queryEventTypeCounts(pool: Pool): Promise<Record<string, number>> {
  const result = await pool.query(
    `SELECT COALESCE(event_type, 'unknown') AS event_type, COUNT(*)::int AS count
     FROM concerts
     GROUP BY event_type
     ORDER BY event_type`,
  );
  return toCountMap(result.rows, 'event_type', 'count');
}

async function queryArtistSourceCounts(pool: Pool): Promise<Record<string, number>> {
  const result = await pool.query(
    `SELECT COALESCE(artist_source, 'unknown') AS artist_source, COUNT(*)::int AS count
     FROM concerts
     GROUP BY artist_source
     ORDER BY artist_source`,
  );
  return toCountMap(result.rows, 'artist_source', 'count');
}

async function queryArtistConfidenceBuckets(pool: Pool): Promise<Record<string, number>> {
  const result = await pool.query(
    `SELECT
       CASE
         WHEN artist_confidence = 0 THEN 'zero'
         WHEN artist_confidence < ${LOW_CONFIDENCE_THRESHOLD} THEN 'low_below_threshold'
         WHEN artist_confidence < 0.8 THEN 'mid'
         ELSE 'high_gte_0_8'
       END AS bucket,
       COUNT(*)::int AS count
     FROM concerts
     GROUP BY bucket
     ORDER BY bucket`,
  );
  return toCountMap(result.rows, 'bucket', 'count');
}

async function queryCoverage(pool: Pool) {
  const result = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE artist_primary <> '')::int AS has_artist_primary,
       COUNT(*) FILTER (WHERE artist_primary = '')::int AS no_artist_primary,
       COUNT(*) FILTER (WHERE artist_all::text <> '[]' AND artist_all::text <> 'null')::int AS has_artist_all,
       COUNT(*) FILTER (WHERE artist_all IS NULL OR artist_all::text = '[]' OR artist_all::text = 'null')::int AS no_artist_all,
       COUNT(*)::int AS total
     FROM concerts`,
  );
  const row = result.rows[0];
  const total = row.total || 0;
  return {
    artistPrimary: {
      has: row.has_artist_primary,
      missing: row.no_artist_primary,
      rate: total > 0 ? round4(row.has_artist_primary / total) : 0,
    },
    artistAll: {
      has: row.has_artist_all,
      missing: row.no_artist_all,
      rate: total > 0 ? round4(row.has_artist_all / total) : 0,
    },
  };
}

async function queryConfidenceStats(pool: Pool) {
  const result = await pool.query(
    `SELECT MIN(artist_confidence)::float AS min,
            MAX(artist_confidence)::float AS max,
            AVG(artist_confidence)::float AS avg
     FROM concerts`,
  );
  const row = result.rows[0];
  return {
    min: round4(Number(row.min) || 0),
    max: round4(Number(row.max) || 0),
    avg: round4(Number(row.avg) || 0),
  };
}

async function queryRawTitleCleaned(pool: Pool): Promise<boolean> {
  // rawTitle is considered cleaned if at least one record has a raw_title that
  // differs from title in a meaningful way (i.e. the pipeline populated it).
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM concerts
     WHERE raw_title IS NOT NULL AND raw_title <> '' AND raw_title <> title`,
  );
  return (result.rows[0].count || 0) > 0;
}

async function queryLowConfidenceCount(pool: Pool): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM concerts
     WHERE artist_confidence < ${LOW_CONFIDENCE_THRESHOLD}`,
  );
  return result.rows[0].count;
}

async function querySuccessCases(pool: Pool, limit: number): Promise<SampleConcert[]> {
  const result = await pool.query(
    `SELECT id, COALESCE(raw_title, title) AS raw_title, title, COALESCE(artist, '') AS artist,
            COALESCE(artist_primary, '') AS artist_primary,
            COALESCE(artist_all::text, '[]') AS artist_all,
            COALESCE(event_type, 'unknown') AS event_type,
            COALESCE(artist_confidence, 0)::float AS artist_confidence,
            COALESCE(artist_source, 'unknown') AS artist_source,
            COALESCE(city, '') AS city,
            COALESCE(venue, '') AS venue,
            TO_CHAR(event_date, 'YYYY-MM-DD') AS event_date,
            COALESCE(opportunity_score, 0)::int AS opportunity_score,
            COALESCE(source_url, '') AS source_url
     FROM concerts
     WHERE artist_primary <> '' AND artist_confidence >= ${LOW_CONFIDENCE_THRESHOLD}
     ORDER BY artist_confidence DESC, raw_title
     LIMIT $1`,
    [limit],
  );
  return result.rows.map(rowToSampleConcert);
}

async function queryUnknownCases(pool: Pool, limit: number): Promise<SampleConcert[]> {
  const result = await pool.query(
    `SELECT id, COALESCE(raw_title, title) AS raw_title, title, COALESCE(artist, '') AS artist,
            COALESCE(artist_primary, '') AS artist_primary,
            COALESCE(artist_all::text, '[]') AS artist_all,
            COALESCE(event_type, 'unknown') AS event_type,
            COALESCE(artist_confidence, 0)::float AS artist_confidence,
            COALESCE(artist_source, 'unknown') AS artist_source,
            COALESCE(city, '') AS city,
            COALESCE(venue, '') AS venue,
            TO_CHAR(event_date, 'YYYY-MM-DD') AS event_date,
            COALESCE(opportunity_score, 0)::int AS opportunity_score,
            COALESCE(source_url, '') AS source_url
     FROM concerts
     WHERE artist_primary = '' AND artist_confidence = 0
     ORDER BY raw_title
     LIMIT $1`,
    [limit],
  );
  return result.rows.map(rowToSampleConcert);
}

type RawRow = Record<string, unknown>;

function rowToSampleConcert(row: RawRow): SampleConcert {
  return {
    id: String(row.id || ''),
    rawTitle: String(row.raw_title || ''),
    title: String(row.title || ''),
    artist: String(row.artist || ''),
    artistPrimary: String(row.artist_primary || ''),
    artistAll: parseArtistAll(row.artist_all),
    eventType: String(row.event_type || 'unknown'),
    artistConfidence: Number(row.artist_confidence) || 0,
    artistSource: String(row.artist_source || 'unknown'),
    city: String(row.city || ''),
    venue: String(row.venue || ''),
    eventDate: row.event_date ? String(row.event_date) : null,
    opportunityScore: Number(row.opportunity_score) || 0,
    sourceUrl: String(row.source_url || ''),
  };
}

function parseArtistAll(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toCountMap(rows: RawRow[], keyField: string, valueField: string): Record<string, number> {
  const map: Record<string, number> = {};
  for (const row of rows) {
    const key = String(row[keyField] ?? 'unknown');
    map[key] = Number(row[valueField]) || 0;
  }
  return map;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function safeParseHost(databaseUrl: string): string | null {
  try {
    return new URL(databaseUrl).host;
  } catch {
    return null;
  }
}

main().catch((error) => {
  console.error('Backfill comparison report failed:', error);
  process.exit(1);
});