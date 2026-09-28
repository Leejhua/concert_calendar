import type { Concert } from '@/lib/damai-crawler';
import { normalizeCityName, normalizeVenueName } from '@/lib/location-normalization';

export type EventType = 'solo' | 'multi_artist' | 'tribute' | 'fan_meeting' | 'festival' | 'other' | 'unknown';
export type ArtistSource = 'official_tag' | 'rule' | 'llm' | 'manual' | 'legacy' | 'unknown';

const GENERIC_ARTIST_VALUES = new Set(['', 'unknown', '群星', '待定', '歌手', '音乐会', 'unknown artist']);
const MULTI_ARTIST_MARKERS = ['群星', '拼盘', '联合', '嘉宾', '阵容', '音乐盛典', '群星演唱会'];
const TRIBUTE_MARKERS = ['致敬', '纪念', '追忆', '重现', '模仿', '烛光', '作品音乐会'];
const FAN_MEETING_MARKERS = ['粉丝见面会', '见面会', 'fan meeting'];
const FESTIVAL_MARKERS = ['音乐节', 'festival', '嘉年华'];
const ARTIST_NAME_SUFFIX_PATTERNS = [
  /\s+(?:\d+|[０-９]+)\s*(?:周年|週年).*$/,
  /\s+(?:\d+|[０-９]+)\s*th\s+anniversary\b.*$/i,
  /\s+第[一二三四五六七八九十百千万\d]+次(?:世界|全球|亚洲|巡演|巡回|演唱会).*$/,
];
const PROTECTED_CONNECTOR_TOKEN = '__ARTIST_CONNECTOR_TOKEN__';

type IdentityPatch = Partial<Pick<Concert, 'rawTitle' | 'rawArtistTag' | 'artistPrimary' | 'artistAll' | 'eventType' | 'artistConfidence' | 'artistSource'>>;

export function isGenericArtistName(value?: string | null) {
  if (!value) return true;
  return GENERIC_ARTIST_VALUES.has(value.trim().toLowerCase());
}

export function splitArtistNames(value?: string | null) {
  if (!value) return [] as string[];

  const normalized = value
    .replace(/\b(\p{Lu}+)\s+X\s+(?=\p{Lu}+\b)/gu, `$1 ${PROTECTED_CONNECTOR_TOKEN} `)
    .replace(/[|｜]/g, '/')
    .replace(/\b(and|feat\.?|ft\.?|with)\b/gi, '/')
    .replace(/(?<=\s)x(?=\s)/gi, '/')
    .replace(/[&＋+、，,]/g, '/')
    .replaceAll(PROTECTED_CONNECTOR_TOKEN, 'X');

  return uniqueStrings(
    normalized
      .split('/')
      .map((item) => sanitizeArtistName(item))
      .filter((item): item is string => Boolean(item && !isGenericArtistName(item)))
  );
}

export function getConcertDisplayArtist(concert: Pick<Concert, 'artist' | 'artistPrimary' | 'artistAll'>) {
  const primary = sanitizeArtistName(concert.artistPrimary);
  if (primary && !isGenericArtistName(primary)) return primary;

  const legacy = sanitizeArtistName(concert.artist);
  if (legacy && !isGenericArtistName(legacy)) return legacy;

  for (const artist of concert.artistAll || []) {
    const normalized = sanitizeArtistName(artist);
    if (normalized && !isGenericArtistName(normalized)) return normalized;
  }

  return '';
}

export function getConcertSearchArtists(concert: Pick<Concert, 'artist' | 'artistPrimary' | 'artistAll'>) {
  return uniqueStrings([
    ...splitArtistNames(concert.artistPrimary),
    ...splitArtistNames(concert.artist),
    ...((concert.artistAll || []).flatMap((artist) => splitArtistNames(artist))),
  ]);
}

export function getConcertDisplayTitle(concert: Pick<Concert, 'title' | 'rawTitle' | 'artist' | 'artistPrimary' | 'artistAll'>) {
  const baseTitle = concert.rawTitle || concert.title;
  const artist = getConcertDisplayArtist(concert);
  return stripLeadingArtistPrefix(baseTitle, [artist, ...(concert.artistAll || []), concert.artist || '']);
}

export function stripLeadingArtistPrefix(title: string, artistCandidates: Array<string | null | undefined>) {
  let nextTitle = title;

  for (const candidate of artistCandidates) {
    const artist = sanitizeArtistName(candidate);
    if (!artist || isGenericArtistName(artist)) continue;

    const prefix = `【${artist}】`;
    if (nextTitle.startsWith(prefix)) {
      nextTitle = nextTitle.slice(prefix.length);
    }
  }

  return nextTitle;
}

export function normalizeConcertRecord(concert: Concert, patch: IdentityPatch = {}): Concert {
  const rawTitle = firstNonEmpty(patch.rawTitle, concert.rawTitle, concert.title) || concert.title;
  const rawArtistTag = firstNonEmpty(patch.rawArtistTag, concert.rawArtistTag) || '';

  const seededArtists = uniqueStrings([
    ...(patch.artistAll || []),
    ...(concert.artistAll || []),
    ...splitArtistNames(patch.artistPrimary),
    ...splitArtistNames(concert.artistPrimary),
    ...splitArtistNames(rawArtistTag),
    ...splitArtistNames(concert.artist),
  ]);

  const ruleArtist = seededArtists[0] || extractLeadArtistFromTitle(rawTitle) || '';
  const artistPrimary = firstNonEmpty(patch.artistPrimary, concert.artistPrimary, ruleArtist) || '';
  const artistAll = uniqueStrings([
    ...seededArtists,
    ...splitArtistNames(artistPrimary),
  ]);

  const artistSource = resolveArtistSource(concert, patch, rawArtistTag, artistPrimary);
  const artistConfidence = resolveArtistConfidence(concert, patch, artistSource, artistPrimary, artistAll);
  const eventType = resolveEventType(concert, patch, rawTitle, artistAll);
  const legacyArtist = getConcertDisplayArtist({ artist: concert.artist, artistPrimary, artistAll });

  return {
    ...concert,
    rawTitle,
    rawArtistTag,
    title: rawTitle || concert.title,
    normalizedCity: normalizeCityName(concert.city),
    normalizedVenue: normalizeVenueName(concert.venue),
    artistPrimary,
    artistAll,
    eventType,
    artistConfidence,
    artistSource,
    artist: legacyArtist,
  };
}

function resolveArtistSource(concert: Concert, patch: IdentityPatch, rawArtistTag: string, artistPrimary: string): ArtistSource {
  const explicit = patch.artistSource || concert.artistSource;
  if (explicit) return explicit;
  if (artistPrimary && rawArtistTag && splitArtistNames(rawArtistTag).includes(artistPrimary)) return 'official_tag';
  if (artistPrimary && concert.artist && sanitizeArtistName(concert.artist) === artistPrimary) return 'legacy';
  if (artistPrimary) return 'rule';
  return 'unknown';
}

function resolveArtistConfidence(
  concert: Concert,
  patch: IdentityPatch,
  artistSource: ArtistSource,
  artistPrimary: string,
  artistAll: string[]
) {
  if (typeof patch.artistConfidence === 'number') return clamp(patch.artistConfidence);
  if (typeof concert.artistConfidence === 'number') return clamp(concert.artistConfidence);
  if (!artistPrimary && artistAll.length === 0) return 0;

  switch (artistSource) {
    case 'official_tag':
      return 0.95;
    case 'manual':
      return 0.95;
    case 'llm':
      return 0.8;
    case 'legacy':
      return 0.7;
    case 'rule':
      return 0.55;
    default:
      return 0.3;
  }
}

function resolveEventType(concert: Concert, patch: IdentityPatch, rawTitle: string, artistAll: string[]): EventType {
  const explicit = patch.eventType || concert.eventType;
  if (explicit) return explicit;

  const normalizedTitle = rawTitle.toLowerCase();
  if (containsAny(normalizedTitle, FAN_MEETING_MARKERS)) return 'fan_meeting';
  if (containsAny(normalizedTitle, TRIBUTE_MARKERS)) return 'tribute';
  if (containsAny(normalizedTitle, FESTIVAL_MARKERS)) return 'festival';
  if (artistAll.length > 1 || containsAny(rawTitle, MULTI_ARTIST_MARKERS)) return 'multi_artist';
  if (artistAll.length === 1) return 'solo';
  return 'unknown';
}

function extractLeadArtistFromTitle(title: string) {
  const prefixMatch = title.match(/^【([^】]+)】/);
  const prefixArtist = sanitizeArtistName(prefixMatch?.[1]);
  if (prefixArtist && !isGenericArtistName(prefixArtist)) return prefixArtist;

  const leadMatch = title.match(/^\s*([A-Za-z0-9\u4e00-\u9fa5·&\-\s]{2,40}?)(?:[「《(<\[]|\s+(?:世界巡演|世界巡回|巡演|巡回|演唱会|live|tour|fan meeting)|(?:粉丝)?见面会|演唱会|巡演|巡回)/i);
  const leadArtist = sanitizeArtistName(leadMatch?.[1]);
  if (leadArtist && !isGenericArtistName(leadArtist)) return leadArtist;

  return '';
}

function sanitizeArtistName(value?: string | null) {
  if (!value) return '';

  let sanitized = value
    .replace(/^【|】$/g, '')
    .replace(/\b(\p{Lu}+)\s+X\s+(?=\p{Lu}+\b)/gu, `$1 ${PROTECTED_CONNECTOR_TOKEN} `)
    .replace(/^[\s:：-]+|[\s:：-]+$/g, '')
    .trim();

  for (const pattern of ARTIST_NAME_SUFFIX_PATTERNS) {
    sanitized = sanitized.replace(pattern, '').trim();
  }

  return sanitized.replaceAll(PROTECTED_CONNECTOR_TOKEN, 'X').trim();
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = sanitizeArtistName(value);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function containsAny(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword));
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (value && value.trim()) return value.trim();
  }
  return '';
}

function clamp(value: number) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
