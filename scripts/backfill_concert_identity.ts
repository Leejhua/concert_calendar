#!/usr/bin/env npx tsx

import '../lib/cli-env';
import { extractArtistsWithDeepSeek, Concert } from '../lib/damai-crawler';
import { getAllConcertsFromStorage, replaceConcertsInStorage, saveConcertsToStorage } from '../lib/db';
import { mergeConcertLists } from '../lib/deduplication';
import {
  getConcertDisplayArtist,
  getConcertDisplayTitle,
  normalizeConcertRecord,
  splitArtistNames,
  stripLeadingArtistPrefix,
} from '../lib/concert-identity';

const args = new Set(process.argv.slice(2));
const useLlm = args.has('--with-llm');
const dryRun = args.has('--dry-run');
const rededup = args.has('--rededup');
const forceReinferIdentity = args.has('--force-reinfer-identity');

async function main() {
  console.log('='.repeat(60));
  console.log('Concert Identity Backfill');
  console.log('='.repeat(60));

  const concerts = await getAllConcertsFromStorage();
  console.log(`Loaded ${concerts.length} concerts from storage.`);

  if (concerts.length === 0) {
    console.log('No concerts found.');
    return;
  }

  const normalized = concerts.map((concert) => normalizeStoredConcert(concert));
  const lowConfidenceConcerts = normalized.filter(isLowConfidenceConcert);

  console.log(`Normalized ${normalized.length} concerts.`);
  console.log(`Low-confidence concerts: ${lowConfidenceConcerts.length}`);
  console.log(`Event types after normalization: ${JSON.stringify(countBy(normalized, (concert) => concert.eventType || 'unknown'))}`);
  console.log(`Artist sources after normalization: ${JSON.stringify(countBy(normalized, (concert) => concert.artistSource || 'unknown'))}`);
  console.log(rededup ? 'Automatic historical deduplication: enabled.' : 'Automatic historical deduplication: disabled (preserving existing rows).');
  console.log(forceReinferIdentity ? 'Force identity reinference: enabled.' : 'Force identity reinference: disabled (preserving trusted structured identity fields).');

  if (useLlm) {
    const apiKey = process.env.DEEPSEEK_API_KEY || '';
    if (!apiKey) {
      throw new Error('DEEPSEEK_API_KEY is required when using --with-llm');
    }

    if (lowConfidenceConcerts.length > 0) {
      console.log('Running DeepSeek on low-confidence concerts...');
      await extractArtistsWithDeepSeek(lowConfidenceConcerts, apiKey);
    }
  }

  const finalConcerts = rededup ? mergeConcertLists([], normalized).sort(compareConcerts) : normalized.sort(compareConcerts);
  const summary = summarizeChanges(concerts, finalConcerts);

  console.log(`Concert rows: ${concerts.length} -> ${finalConcerts.length}`);
  console.log(`Recovered artists: ${summary.recoveredArtists}`);
  console.log(`Cleaned titles: ${summary.cleanedTitles}`);
  console.log(`Structured event types: ${summary.typedEvents}`);
  console.log(`Confidence upgrades: ${summary.confidenceUpgrades}`);
  console.log(`Force reinfer candidates: ${summary.forceReinferCandidates}`);
  console.log(`Identity changes: ${summary.identityChanges}`);

  if (!rededup && concerts.length !== finalConcerts.length) {
    throw new Error('Unexpected row count change without --rededup');
  }

  if (dryRun) {
    console.log('Dry run enabled. No data was written.');
    return;
  }

  if (rededup) {
    console.log('Rededup enabled. Replacing concerts table with merged results...');
    await replaceConcertsInStorage(finalConcerts);
  } else {
    await saveConcertsToStorage(finalConcerts);
  }
  console.log('Backfill saved successfully.');
}

function normalizeStoredConcert(concert: Concert) {
  const shouldRefreshIdentity = shouldForceReinferIdentity(concert);
  const titleSeed = normalizeConcertRecord({
    ...concert,
    artistPrimary: shouldRefreshIdentity ? undefined : concert.artistPrimary,
    artistAll: shouldRefreshIdentity ? undefined : concert.artistAll,
    eventType: shouldRefreshIdentity || shouldInferEventType(concert.eventType) ? undefined : concert.eventType,
    artistConfidence: shouldRefreshIdentity || shouldInferArtistConfidence(concert.artistConfidence) ? undefined : concert.artistConfidence,
    artistSource: shouldRefreshIdentity || shouldInferArtistSource(concert.artistSource) ? undefined : concert.artistSource,
  });
  const cleanedTitle = stripLeadingArtistPrefix(
    getConcertDisplayTitle(titleSeed),
    [titleSeed.artistPrimary, titleSeed.artist, ...(titleSeed.artistAll || [])]
  );

  const artistAll = titleSeed.artistAll && titleSeed.artistAll.length > 0
    ? titleSeed.artistAll
    : splitArtistNames(titleSeed.artistPrimary || titleSeed.artist || '');

  return normalizeConcertRecord(titleSeed, {
    rawTitle: cleanedTitle,
    artistPrimary: titleSeed.artistPrimary || getConcertDisplayArtist(titleSeed),
    artistAll,
  });
}

function summarizeChanges(before: Concert[], after: Concert[]) {
  const beforeById = new Map(before.map((concert) => [concert.id, concert]));

  let recoveredArtists = 0;
  let cleanedTitles = 0;
  let typedEvents = 0;
  let confidenceUpgrades = 0;
  let forceReinferCandidates = 0;
  let identityChanges = 0;

  for (const concert of after) {
    const previous = beforeById.get(concert.id);
    if (!previous) continue;

    if (shouldForceReinferIdentity(previous)) {
      forceReinferCandidates += 1;
    }

    if (hasIdentityChanged(previous, concert)) {
      identityChanges += 1;
    }

    const previousArtist = previous.artist || previous.artistPrimary || '';
    const nextArtist = getConcertDisplayArtist(concert);
    if (isMissingArtist(previousArtist) && nextArtist) recoveredArtists += 1;

    const previousRawTitle = previous.rawTitle || previous.title;
    if (previousRawTitle !== (concert.rawTitle || concert.title)) {
      cleanedTitles += 1;
    }

    if (isMissingEventType(previous.eventType) && !isMissingEventType(concert.eventType)) {
      typedEvents += 1;
    }

    if ((previous.artistConfidence || 0) < 0.75 && (concert.artistConfidence || 0) >= 0.75) {
      confidenceUpgrades += 1;
    }
  }

  return { recoveredArtists, cleanedTitles, typedEvents, confidenceUpgrades, forceReinferCandidates, identityChanges };
}

function hasIdentityChanged(before: Concert, after: Concert) {
  return before.artistPrimary !== after.artistPrimary
    || !areStringArraysEqual(before.artistAll || [], after.artistAll || [])
    || before.eventType !== after.eventType
    || before.artistConfidence !== after.artistConfidence
    || before.artistSource !== after.artistSource;
}

function areStringArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function isLowConfidenceConcert(concert: Concert) {
  const artistConfidence = concert.artistConfidence || 0;
  return !getConcertDisplayArtist(concert) || concert.artistSource === 'unknown' || artistConfidence < 0.55;
}

function shouldForceReinferIdentity(concert: Concert) {
  if (!forceReinferIdentity) return false;
  return concert.artistSource === 'rule' || concert.artistSource === 'legacy' || concert.artistSource === 'unknown' || !concert.artistSource;
}

function shouldInferEventType(eventType: Concert['eventType'] | null | undefined) {
  return !eventType || eventType === 'unknown';
}

function shouldInferArtistConfidence(artistConfidence: number | null | undefined) {
  return typeof artistConfidence !== 'number' || artistConfidence <= 0;
}

function shouldInferArtistSource(artistSource: Concert['artistSource'] | null | undefined) {
  return !artistSource || artistSource === 'unknown';
}

function isMissingArtist(artist: string) {
  const normalized = artist.trim().toLowerCase();
  return !normalized || normalized === 'unknown' || normalized === '群星';
}

function isMissingEventType(eventType: Concert['eventType'] | null | undefined) {
  return !eventType || eventType === 'unknown';
}

function countBy(concerts: Concert[], getKey: (concert: Concert) => string) {
  return concerts.reduce<Record<string, number>>((counts, concert) => {
    const key = getKey(concert);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function compareConcerts(a: Concert, b: Concert) {
  const left = a.sortAt ? new Date(a.sortAt).getTime() : Number.MAX_SAFE_INTEGER;
  const right = b.sortAt ? new Date(b.sortAt).getTime() : Number.MAX_SAFE_INTEGER;
  if (left !== right) return left - right;
  return a.id.localeCompare(b.id);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Backfill failed: 已加载 .env.local；请检查 DATABASE_URL 是否含字符串密码、DATABASE_SSL/sslmode 是否匹配。Original error:', message);
  process.exit(1);
});
