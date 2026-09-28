import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { Concert } from './damai-crawler';
import { getConcertSearchArtists, isGenericArtistName, normalizeConcertRecord } from './concert-identity';
import { isNormalizedCityMatch, normalizeVenueName } from './location-normalization';

export const DUPLICATE_MERGE_THRESHOLD = 55;

const MAX_CANDIDATES_PER_ITEM = 300;
const MAX_BUCKET_SIZE = 500;
const CANONICAL_LOG_SAMPLE_LIMIT = 20;
const CANONICAL_LOG_SAMPLE_INTERVAL = 1000;
const ENABLE_VERBOSE_CANONICAL_LOG = process.env.DEDUP_VERBOSE_CANONICAL === '1' || process.env.DEDUP_VERBOSE_CANONICAL === 'true';
let canonicalSelectionLogCount = 0;

export interface DuplicateScoreDetail {
  score: number;
  cityMatched: boolean;
  dateCandidate: boolean;
  dateExact: boolean;
  dateNear: boolean;
  titleSimilarity: number;
  venueSimilarity: number;
  artistOverlap: number;
  productVariantConflict: boolean;
  dateRangeConflict: boolean;
  conflictReasons: string[];
}

interface CanonicalSelectionDetail {
  score: number;
  reasons: string[];
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/【.*?】/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[\s·.,，。!！:：'"“”‘’`~\-_/\\<>《》]/g, '')
    .replace(/\d{4}/g, '')
    .replace(/演唱会|巡回|巡演|世界|live|tour|concert|fanmeeting|festival|音乐节|见面会|专场|站/g, '');
}

function getStartDate(dateStr: string, eventDate?: string | null) {
  if (eventDate) {
    const parsed = parseISO(eventDate);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const match = dateStr.match(/(\d{4})[.-](\d{1,2})[.-](\d{1,2})/);
  if (!match) return null;
  const parsed = parseISO(`${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getDateSignature(dateStr: string, eventDate?: string | null) {
  const startDate = getStartDate(dateStr, eventDate);
  if (startDate) return format(startDate, 'yyyy-MM-dd');

  const compactDate = normalizeDateText(dateStr);
  if (compactDate) return compactDate;
  return eventDate ? normalizeDateText(eventDate) : '';
}

function normalizeDateText(value: string) {
  return value
    .toLowerCase()
    .replace(/[年月/]/g, '.')
    .replace(/日/g, '')
    .replace(/[\s()（）【】\[\]{}]+/g, '')
    .replace(/-/g, '-')
    .replace(/\b(\d{4})[.-](\d{1,2})[.-](\d{1,2})\b/g, (_, year: string, month: string, day: string) => `${year}.${month.padStart(2, '0')}.${day.padStart(2, '0')}`)
    .replace(/\b(\d{1,2})[.-](\d{1,2})\b/g, (_, month: string, day: string) => `${month.padStart(2, '0')}.${day.padStart(2, '0')}`)
    .replace(/[，,、]/g, ',');
}

function hasDateRange(value: string) {
  const normalized = normalizeDateText(value);
  return /\d{1,4}[.-]\d{1,2}(?:[.-]\d{1,2})?\s*[-~至到—–]\s*\d{1,4}[.-]?\d{0,2}(?:[.-]\d{1,2})?/.test(normalized);
}

function isCityMatch(city1: string, city2: string) {
  return isNormalizedCityMatch(city1, city2);
}

function compareDates(c1: Concert, c2: Concert) {
  const d1 = getStartDate(c1.date, c1.eventDate);
  const d2 = getStartDate(c2.date, c2.eventDate);
  if (!d1 || !d2) return { isCandidate: false, exact: false, near: false };

  const diff = Math.abs(differenceInCalendarDays(d1, d2));
  return {
    isCandidate: diff <= 1,
    exact: diff === 0,
    near: diff === 1,
  };
}

function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.88;

  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  let overlap = 0;
  for (let i = 0; i < shorter.length; i += 1) {
    if (longer.includes(shorter[i])) overlap += 1;
  }
  return overlap / longer.length;
}

const PRODUCT_VARIANT_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
  { key: 'single_day_ticket', pattern: /单日票|單日票|1日票|一日票|oneday|single[-\s]?day/i },
  { key: 'two_day_pass', pattern: /两日通票|兩日通票|两日票|兩日票|2日票|二日票|twoday|two[-\s]?day/i },
  { key: 'multi_day_pass', pattern: /多日通票|全日通票|通票|套票|联票|聯票|\b(?:day\s*)?pass\b|\bpackage\b/i },
  { key: 'vip', pattern: /\bvip\b|贵宾|貴賓|尊享|meet\s*&?\s*greet|soundcheck/i },
  { key: 'presale', pattern: /预售|預售|早鸟|早鳥|presale|early\s*bird/i },
  { key: 'additional_show', pattern: /加场|加場|追加|安可场|安可場|encore|additional\s*show/i },
];

function getProductVariantTags(concert: Concert) {
  const normalized = normalizeConcertRecord(concert);
  const text = [normalized.title, normalized.rawTitle || '', normalized.artist || '', normalized.rawArtistTag || '', normalized.date, normalized.notes || '']
    .join(' ')
    .toLowerCase();
  return PRODUCT_VARIANT_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ key }) => key);
}

function hasProductVariantConflict(left: Concert, right: Concert) {
  const leftTags = new Set(getProductVariantTags(left));
  const rightTags = new Set(getProductVariantTags(right));
  if (leftTags.size === 0 && rightTags.size === 0) return false;

  if (leftTags.has('single_day_ticket') && (rightTags.has('two_day_pass') || rightTags.has('multi_day_pass'))) return true;
  if (rightTags.has('single_day_ticket') && (leftTags.has('two_day_pass') || leftTags.has('multi_day_pass'))) return true;

  const exclusiveTags = ['vip', 'presale', 'additional_show'];
  return exclusiveTags.some((tag) => leftTags.has(tag) !== rightTags.has(tag));
}

function hasDateRangeConflict(left: Concert, right: Concert) {
  const normalizedLeft = normalizeConcertRecord(left);
  const normalizedRight = normalizeConcertRecord(right);
  const leftRange = hasDateRange(normalizedLeft.date);
  const rightRange = hasDateRange(normalizedRight.date);
  if (leftRange === rightRange) return false;

  const leftSignature = getDateSignature(normalizedLeft.date, normalizedLeft.eventDate);
  const rightSignature = getDateSignature(normalizedRight.date, normalizedRight.eventDate);
  const dateTextDiffers = leftSignature !== rightSignature;
  const variantMentioned = getProductVariantTags(normalizedLeft).length > 0 || getProductVariantTags(normalizedRight).length > 0;
  const sharedSourceRecord = normalizedLeft.id === normalizedRight.id || normalizedLeft.id.replace(/^mtglobal_/, '').replace(/^mt_/, '') === normalizedRight.id.replace(/^mtglobal_/, '').replace(/^mt_/, '');

  return dateTextDiffers && (variantMentioned || !sharedSourceRecord);
}

export function getDuplicateConflictReasons(left: Concert, right: Concert, detail?: DuplicateScoreDetail) {
  const reasons: string[] = [];
  const scoreDetail = detail || getDuplicateScoreDetail(left, right);

  if (hasProductVariantConflict(left, right)) reasons.push('product_variant_conflict');
  if (hasDateRangeConflict(left, right)) reasons.push('date_range_conflict');
  if (hasDuplicateArtistConflict(left, right, scoreDetail)) reasons.push('artist_conflict');
  if (hasDuplicateArtistMissing(left, right)) reasons.push('artist_missing');

  return reasons;
}

function artistOverlap(c1: Concert, c2: Concert) {
  const left = new Set(getConcertSearchArtists(normalizeConcertRecord(c1)));
  const right = new Set(getConcertSearchArtists(normalizeConcertRecord(c2)));
  if (left.size === 0 || right.size === 0) return 0;

  let overlap = 0;
  for (const artist of left) {
    if (right.has(artist)) overlap += 1;
  }
  return overlap / Math.max(left.size, right.size);
}

export function getDuplicateScoreDetail(rawC1: Concert, rawC2: Concert): DuplicateScoreDetail {
  const c1 = normalizeConcertRecord(rawC1);
  const c2 = normalizeConcertRecord(rawC2);
  const cityMatched = isCityMatch(c1.city, c2.city);
  if (!cityMatched) {
    return {
      score: 0,
      cityMatched: false,
      dateCandidate: false,
      dateExact: false,
      dateNear: false,
      titleSimilarity: 0,
      venueSimilarity: 0,
      artistOverlap: 0,
      productVariantConflict: false,
      dateRangeConflict: false,
      conflictReasons: [],
    };
  }

  const dateMatch = compareDates(c1, c2);
  if (!dateMatch.isCandidate) {
    return {
      score: 0,
      cityMatched,
      dateCandidate: false,
      dateExact: dateMatch.exact,
      dateNear: dateMatch.near,
      titleSimilarity: 0,
      venueSimilarity: 0,
      artistOverlap: 0,
      productVariantConflict: false,
      dateRangeConflict: false,
      conflictReasons: [],
    };
  }

  const titleSimilarity = similarity(normalizeText(c1.title), normalizeText(c2.title));
  const venueSimilarity = similarity(normalizeVenueName(c1.venue || ''), normalizeVenueName(c2.venue || ''));
  const artistsSimilarity = artistOverlap(c1, c2);
  const productVariantConflict = hasProductVariantConflict(c1, c2);
  const dateRangeConflict = hasDateRangeConflict(c1, c2);
  const conflictReasons = [
    ...(productVariantConflict ? ['product_variant_conflict'] : []),
    ...(dateRangeConflict ? ['date_range_conflict'] : []),
  ];

  let score = 0;
  score += 35;
  score += dateMatch.exact ? 25 : 15;
  score += titleSimilarity * 25;
  score += venueSimilarity * 10;
  score += artistsSimilarity * 15;

  return {
    score,
    cityMatched,
    dateCandidate: dateMatch.isCandidate,
    dateExact: dateMatch.exact,
    dateNear: dateMatch.near,
    titleSimilarity,
    venueSimilarity,
    artistOverlap: artistsSimilarity,
    productVariantConflict,
    dateRangeConflict,
    conflictReasons,
  };
}

export function isDuplicate(c1: Concert, c2: Concert): boolean {
  const detail = getDuplicateScoreDetail(c1, c2);
  return detail.score >= DUPLICATE_MERGE_THRESHOLD && hasStrongDuplicateAnchor(detail) && getDuplicateConflictReasons(c1, c2, detail).length === 0;
}

function shouldReplaceArtist(existing: Concert, incoming: Concert) {
  const existingArtist = normalizeConcertRecord(existing).artist;
  const incomingArtist = normalizeConcertRecord(incoming).artist;
  return isGenericArtistName(existingArtist) && !isGenericArtistName(incomingArtist);
}

function shouldLogCanonicalSelection() {
  canonicalSelectionLogCount += 1;
  return (
    ENABLE_VERBOSE_CANONICAL_LOG ||
    canonicalSelectionLogCount <= CANONICAL_LOG_SAMPLE_LIMIT ||
    canonicalSelectionLogCount % CANONICAL_LOG_SAMPLE_INTERVAL === 0
  );
}

function getTitleCore(concert: Concert) {
  const normalized = normalizeConcertRecord(concert);
  const rawTitle = normalized.rawTitle || normalized.title || '';
  return normalizeText(rawTitle);
}

function getSourceExactKey(concert: Concert) {
  const normalized = normalizeConcertRecord(concert);
  const source = normalized.source || 'unknown';
  const id = normalized.id || '';
  const projectId = normalized.projectId || '';
  const sourceUrl = normalized.sourceUrl || '';

  if (source && id) return `${source}:${id}`;
  if (projectId) return `project:${projectId}`;
  if (sourceUrl) return `url:${sourceUrl}`;
  if (id) return `id:${id}`;
  return '';
}

function getNearDateSignatures(concert: Concert) {
  const normalized = normalizeConcertRecord(concert);
  const startDate = getStartDate(normalized.date, normalized.eventDate);
  if (!startDate) return [getDateSignature(normalized.date, normalized.eventDate)].filter(Boolean);

  return [-1, 0, 1].map((offsetDays) => format(addDays(startDate, offsetDays), 'yyyy-MM-dd'));
}

function getPrimaryArtistKey(concert: Concert) {
  const normalized = normalizeConcertRecord(concert);
  const artists = getConcertSearchArtists(normalized);
  return artists[0] ? normalizeText(artists[0]) : '';
}

function getBlockingKeys(concert: Concert) {
  const normalized = normalizeConcertRecord(concert);
  const city = normalized.normalizedCity || normalized.city || '';
  const date = getDateSignature(normalized.date, normalized.eventDate);
  const primaryArtist = getPrimaryArtistKey(normalized);
  const titleCore = getTitleCore(normalized);
  const normalizedVenue = normalizeVenueName(normalized.venue || '');
  const sourceExactKey = getSourceExactKey(normalized);
  const keys: string[] = [];

  if (city && date && primaryArtist) keys.push(`city-date-artist:${city}:${date}:${primaryArtist}`);
  if (city && date && titleCore) keys.push(`city-date-title:${city}:${date}:${titleCore}`);
  if (city && normalizedVenue) {
    for (const nearDate of getNearDateSignatures(normalized)) {
      if (nearDate) keys.push(`city-near-date-venue:${city}:${nearDate}:${normalizedVenue}`);
    }
  }
  if (sourceExactKey) keys.push(`source-exact:${sourceExactKey}`);

  return Array.from(new Set(keys));
}

function addToBlockingIndex(index: Map<string, number[]>, item: Concert, itemIndex: number) {
  for (const key of getBlockingKeys(item)) {
    const bucket = index.get(key);
    if (bucket) {
      bucket.push(itemIndex);
    } else {
      index.set(key, [itemIndex]);
    }
  }
}

function buildBlockingIndex(items: Concert[]) {
  const index = new Map<string, number[]>();
  items.forEach((item, itemIndex) => addToBlockingIndex(index, item, itemIndex));
  return index;
}

function mergeDuplicate(existing: Concert, incoming: Concert) {
  const current = normalizeConcertRecord(existing);
  const next = normalizeConcertRecord(incoming);
  const selected = selectCanonicalConcert(current, next);
  const canonical = selected.canonical;
  const secondary = selected.secondary;

  const mergedArtistAll = Array.from(new Set([...(current.artistAll || []), ...(next.artistAll || [])]));

  if (shouldLogCanonicalSelection()) {
    console.log(`[Deduplication] Canonical selected ${canonical.id} over ${secondary.id}: ${selected.canonicalDetail.reasons.join(', ') || 'fallback'}`);
  }

  return normalizeConcertRecord(
    {
      ...canonical,
      image: choosePreferredValue(canonical.image, secondary.image) || '',
      venue: choosePreferredValue(canonical.venue, secondary.venue) || '',
      price: choosePreferredValue(canonical.price, secondary.price) || '',
      status: choosePreferredValue(canonical.status, secondary.status) || 'Unknown',
      category: choosePreferredValue(canonical.category, secondary.category) || 'Concert',
      sourceUrl: choosePreferredValue(canonical.sourceUrl, secondary.sourceUrl) || '',
      eventDate: choosePreferredValue(canonical.eventDate, secondary.eventDate) || null,
      eventTime: choosePreferredValue(canonical.eventTime, secondary.eventTime) || null,
      lastSeenAt: Math.max(current.lastSeenAt || 0, next.lastSeenAt || 0),
      updatedAt: Math.max(current.updatedAt || 0, next.updatedAt || 0),
      projectId: current.projectId || next.projectId || null,
      opportunityStatus: pickOpportunityStatus(current, next, canonical) || 'new',
      notes: choosePreferredValue(current.notes, next.notes) || '',
      artist: shouldReplaceArtist(canonical, secondary) ? secondary.artist : canonical.artist,
      rawArtistTag: choosePreferredValue(canonical.rawArtistTag, secondary.rawArtistTag) || '',
      artistPrimary: choosePreferredValue(canonical.artistPrimary, secondary.artistPrimary) || '',
      artistAll: mergedArtistAll,
      artistSource: canonical.artistSource !== 'unknown' ? canonical.artistSource : secondary.artistSource,
      artistConfidence: Math.max(current.artistConfidence || 0, next.artistConfidence || 0),
      rawTitle: choosePreferredValue(canonical.rawTitle, secondary.rawTitle) || canonical.title,
      eventType: (canonical.eventType !== 'unknown' ? canonical.eventType : secondary.eventType) || 'unknown',
    },
    {
      artistAll: mergedArtistAll,
    }
  );
}

/**
 * Pre-deduplicate a list of concerts within the same source before heavy cross-source merge.
 *
 * Strategy:
 * 1. Exact match by source_record_id (same concert, different crawl batch/page).
 * 2. Hash match by city + date + normalized_title (same concert, slightly different metadata).
 *
 * Keeps the most complete record from each group (preferring those with artist, venue, price).
 * This avoids feeding 97% duplicate raw records into the O(n × bucket) comparison loop.
 */
function preDedupSecondary(items: Concert[]): { deduped: Concert[]; removedCount: number } {
  if (items.length <= 1) return { deduped: items, removedCount: 0 };

  const groups = new Map<string, Concert[]>();

  for (const item of items) {
    const normalized = normalizeConcertRecord(item);
    const source = normalized.source || 'unknown';
    const id = normalized.id || '';
    const projectId = normalized.projectId || '';

    // Exact key: same source + same record ID
    const exactKey = (source && id) ? `${source}:${id}` : (projectId ? `project:${projectId}` : '');

    // Hash key: city + date + title core (for fuzzy same-source matching)
    const city = normalized.normalizedCity || normalized.city || '';
    const date = getDateSignature(normalized.date, normalized.eventDate);
    const titleCore = getTitleCore(normalized);
    const hashKey = city && date && titleCore ? `hash:${source}:${city}:${date}:${titleCore}` : '';

    // Use exact key first, fall back to hash key
    const groupKey = exactKey || hashKey || '';

    if (groupKey) {
      const group = groups.get(groupKey);
      if (group) {
        group.push(item);
      } else {
        groups.set(groupKey, [item]);
      }
    } else {
      // Can't group — keep as singleton with a unique key
      groups.set(`singleton:${items.indexOf(item)}`, [item]);
    }
  }

  const deduped: Concert[] = [];
  let removedCount = 0;

  for (const group of groups.values()) {
    if (group.length === 1) {
      deduped.push(group[0]);
    } else {
      // Keep the most complete record (prefer those with artist, venue, price)
      group.sort((a, b) => {
        const na = normalizeConcertRecord(a);
        const nb = normalizeConcertRecord(b);
        const scoreA = (na.artist ? 3 : 0) + (na.venue ? 2 : 0) + (na.price ? 1 : 0) + (na.eventDate ? 2 : 0);
        const scoreB = (nb.artist ? 3 : 0) + (nb.venue ? 2 : 0) + (nb.price ? 1 : 0) + (nb.eventDate ? 2 : 0);
        return scoreB - scoreA;
      });
      deduped.push(group[0]);
      removedCount += group.length - 1;
    }
  }

  return { deduped, removedCount };
}

export function mergeConcertLists(primary: Concert[], secondary: Concert[]): Concert[] {
  const startedAt = Date.now();

  // Pre-dedup: eliminate same-source duplicates before heavy comparison
  const { deduped: preDedupedSecondary, removedCount: preDedupRemoved } = preDedupSecondary(secondary);
  if (preDedupRemoved > 0) {
    console.log(`MERGE_PRE_DEDUP secondary=${secondary.length} → ${preDedupedSecondary.length} (removed ${preDedupRemoved} same-source duplicates)`);
  }

  console.log(`MERGE_BATCH_START primary=${primary.length} secondary=${preDedupedSecondary.length}`);

  const merged = primary.map((item) => normalizeConcertRecord(item));
  const blockingIndex = buildBlockingIndex(merged);
  let newCount = 0;
  let mergedCount = 0;
  let comparisonCount = 0;
  let candidateTruncatedCount = 0;
  let oversizedBucketCount = 0;

  for (const rawItem of preDedupedSecondary) {
    const item = normalizeConcertRecord(rawItem);
    const candidateIndexes = new Set<number>();

    for (const key of getBlockingKeys(item)) {
      const bucket = blockingIndex.get(key);
      if (!bucket || bucket.length === 0) continue;

      if (bucket.length > MAX_BUCKET_SIZE) {
        oversizedBucketCount += 1;
      }

      const readableBucket = bucket.length > MAX_BUCKET_SIZE ? bucket.slice(0, MAX_BUCKET_SIZE) : bucket;
      for (const existingIndex of readableBucket) {
        candidateIndexes.add(existingIndex);
        if (candidateIndexes.size >= MAX_CANDIDATES_PER_ITEM) break;
      }

      if (candidateIndexes.size >= MAX_CANDIDATES_PER_ITEM) {
        candidateTruncatedCount += 1;
        break;
      }
    }

    let existingIndex = -1;
    for (const candidateIndex of candidateIndexes) {
      comparisonCount += 1;
      if (isDuplicate(merged[candidateIndex], item)) {
        existingIndex = candidateIndex;
        break;
      }
    }

    if (existingIndex !== -1) {
      merged[existingIndex] = mergeDuplicate(merged[existingIndex], item);
      addToBlockingIndex(blockingIndex, merged[existingIndex], existingIndex);
      mergedCount += 1;
    } else {
      const nextIndex = merged.length;
      merged.push(item);
      addToBlockingIndex(blockingIndex, item, nextIndex);
      newCount += 1;
    }
  }

  console.log(
    `MERGE_BATCH_DONE secondary=${preDedupedSecondary.length} added=${newCount} merged=${mergedCount} comparisons=${comparisonCount} ` +
      `candidateTruncated=${candidateTruncatedCount} oversizedBuckets=${oversizedBucketCount} preDedupRemoved=${preDedupRemoved} durationMs=${Date.now() - startedAt} result=${merged.length}`
  );
  return merged;
}

export function hasStrongDuplicateAnchor(detail: DuplicateScoreDetail) {
  return detail.titleSimilarity >= 0.75 || detail.venueSimilarity >= 0.85 || detail.artistOverlap >= 0.5;
}

export function hasDuplicateArtistConflict(left: Concert, right: Concert, detail: DuplicateScoreDetail) {
  const leftArtists = new Set(getConcertSearchArtists(normalizeConcertRecord(left)));
  const rightArtists = new Set(getConcertSearchArtists(normalizeConcertRecord(right)));

  if (leftArtists.size === 0 || rightArtists.size === 0) return false;
  if (detail.artistOverlap > 0) return false;

  return detail.titleSimilarity < 0.92;
}

/**
 * Detects when one or both concert records have no extractable artist information.
 *
 * When artist data is missing, {@link hasDuplicateArtistConflict} returns false
 * (it cannot compare what is absent), so the candidate would not receive an
 * `artist_conflict` flag. Without this guard, a candidate with a high score and
 * strong anchor but missing artist data would slip through as `merge_candidate`
 * and be auto-merged — even if the two records are actually different events.
 *
 * This function forces such candidates into review by adding `artist_missing`
 * to the conflict reasons, ensuring a human adjudicates before any merge.
 */
export function hasDuplicateArtistMissing(left: Concert, right: Concert) {
  const leftArtists = new Set(getConcertSearchArtists(normalizeConcertRecord(left)));
  const rightArtists = new Set(getConcertSearchArtists(normalizeConcertRecord(right)));
  return leftArtists.size === 0 || rightArtists.size === 0;
}

function selectCanonicalConcert(left: Concert, right: Concert) {
  const leftDetail = getCanonicalSelectionDetail(left);
  const rightDetail = getCanonicalSelectionDetail(right);

  if (leftDetail.score > rightDetail.score) {
    return { canonical: left, secondary: right, canonicalDetail: leftDetail, secondaryDetail: rightDetail };
  }

  if (rightDetail.score > leftDetail.score) {
    return { canonical: right, secondary: left, canonicalDetail: rightDetail, secondaryDetail: leftDetail };
  }

  if ((left.updatedAt || 0) !== (right.updatedAt || 0)) {
    return left.updatedAt && left.updatedAt > (right.updatedAt || 0)
      ? { canonical: left, secondary: right, canonicalDetail: leftDetail, secondaryDetail: rightDetail }
      : { canonical: right, secondary: left, canonicalDetail: rightDetail, secondaryDetail: leftDetail };
  }

  return left.id.localeCompare(right.id) <= 0
    ? { canonical: left, secondary: right, canonicalDetail: leftDetail, secondaryDetail: rightDetail }
    : { canonical: right, secondary: left, canonicalDetail: rightDetail, secondaryDetail: leftDetail };
}

function getCanonicalSelectionDetail(concert: Concert): CanonicalSelectionDetail {
  const normalized = normalizeConcertRecord(concert);
  let score = 0;
  const reasons: string[] = [];

  if (normalized.projectId) {
    score += 100;
    reasons.push('project-linked');
  }

  if (normalized.source === 'damai') {
    score += 18;
    reasons.push('preferred-source');
  } else if (normalized.source === 'moretickets') {
    score += 10;
    reasons.push('secondary-source');
  }

  if (normalized.sourceUrl) {
    score += 12;
    reasons.push('source-url');
  }

  if (normalized.venue) {
    score += 10;
    reasons.push('venue');
  }

  if (normalized.price && normalized.price !== '0' && normalized.price !== 'Pending') {
    score += 8;
    reasons.push('price');
  }

  if (normalized.artistPrimary && !isGenericArtistName(normalized.artistPrimary)) {
    score += 10;
    reasons.push('artist-primary');
  }

  if ((normalized.artistAll || []).length > 0) {
    score += 6;
    reasons.push('artist-all');
  }

  if ((normalized.artistConfidence || 0) > 0) {
    score += Math.round((normalized.artistConfidence || 0) * 20);
    reasons.push('artist-confidence');
  }

  if (normalized.eventDate) {
    score += 6;
    reasons.push('event-date');
  }

  if (normalized.eventTime) {
    score += 3;
    reasons.push('event-time');
  }

  if (normalized.notes) {
    score += 3;
    reasons.push('notes');
  }

  score += Math.min(Math.round((normalized.opportunityScore || 0) / 10), 10);

  return { score, reasons };
}

function choosePreferredValue<T>(primary: T | null | undefined, fallback: T | null | undefined) {
  if (typeof primary === 'string') {
    return primary.trim() ? primary : fallback;
  }
  return primary ?? fallback;
}

function pickOpportunityStatus(left: Concert, right: Concert, canonical: Concert) {
  if (left.projectId && left.opportunityStatus) return left.opportunityStatus;
  if (right.projectId && right.opportunityStatus) return right.opportunityStatus;
  return canonical.opportunityStatus || left.opportunityStatus || right.opportunityStatus;
}
