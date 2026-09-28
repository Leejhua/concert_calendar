import type { Concert } from '@/lib/damai-crawler';
import { createAiClient, loadAiConfig } from '@/lib/ai-client';
import { isGenericArtistName, normalizeConcertRecord, splitArtistNames } from '@/lib/concert-identity';

interface AiSelectionOptions {
  source?: Concert['source'];
  syncMode?: string;
  apiKey?: string;
}

interface AiRuntimeOptions extends AiSelectionOptions {
  env?: Record<string, string | undefined>;
}

interface AiLimits {
  batchSize: number;
  maxItemsPerSync: number;
  maxItemsPerSource: number;
  onlyMissingArtist: boolean;
  skipSources: Set<string>;
}

interface ConcertCandidate {
  concert: Concert;
  index: number;
  priority: number;
}

type IdentityPatchPayload = {
  id?: unknown;
  title?: unknown;
  artistPrimary?: unknown;
  artistAll?: unknown;
  eventType?: unknown;
  confidence?: unknown;
  artistConfidence?: unknown;
};

const DEFAULT_AI_MAX_ITEMS_PER_SYNC = 500;
const DEFAULT_AI_MAX_ITEMS_PER_SOURCE = 200;
const DEFAULT_AI_BATCH_SIZE = 50;
const LOW_CONFIDENCE_THRESHOLD = 0.7;
const GENERIC_ARTIST_ALIASES = new Set(['unknown', '群星', '待定', 'unknown artist']);

/**
 * Selects records that benefit most from AI identity extraction.
 *
 * Missing or generic artists are preferred over already-filled but low-confidence
 * records, then global and per-source caps are applied.
 */
export function selectAiCandidates(concerts: Concert[], options: AiRuntimeOptions = {}): Concert[] {
  const limits = loadAiLimits(options.env ?? process.env);
  const source = normalizeSource(options.source);

  if (limits.onlyMissingArtist) {
    return selectByQuality(concerts, source, limits);
  }

  return concerts.slice(0, Math.min(limits.maxItemsPerSource, limits.maxItemsPerSync));
}

/**
 * Enhances selected concert identity fields with a configured AI model.
 *
 * The function is intentionally fail-open: AI failures are logged and the
 * original concert list is returned so crawler synchronization can continue.
 */
export async function extractConcertIdentityWithAI(
  concerts: Concert[],
  options: AiSelectionOptions = {}
): Promise<Concert[]> {
  if (concerts.length === 0) return concerts;

  const source = normalizeSource(options.source);
  const sourceOption = toConcertSource(source);
  const config = loadAiConfig(process.env);
  const hasExplicitAiEnabled = Boolean(process.env.AI_ENABLED?.trim());
  if (options.apiKey?.trim()) {
    config.apiKey = options.apiKey.trim();
    if (!hasExplicitAiEnabled) {
      config.enabled = true;
    }
  }

  const limits = loadAiLimits(process.env);
  if (!config.enabled) {
    console.log(`🤖 AI identity skipped${source ? ` for ${source}` : ''}: AI is disabled.`);
    return concerts;
  }

  if (source && limits.skipSources.has(source)) {
    console.log(`🤖 AI identity skipped for ${source}: source is listed in AI_SKIP_FOR_SOURCES.`);
    return concerts;
  }

  const candidates = selectAiCandidates(concerts, { ...options, source: sourceOption });
  if (candidates.length === 0) {
    console.log(`✨ AI identity skipped${source ? ` for ${source}` : ''}: no missing or low-confidence records.`);
    return concerts;
  }

  console.log(
    `🤖 AI identity: processing ${candidates.length}/${concerts.length} ${source || 'unknown-source'} records ` +
    `(batchSize=${limits.batchSize}, maxPerSource=${limits.maxItemsPerSource}, maxPerSync=${limits.maxItemsPerSync}).`
  );

  const client = createAiClient(config);
  const batches = chunk(candidates, limits.batchSize);

  try {
    for (const [batchIndex, batch] of batches.entries()) {
      console.log(`   🤖 AI identity batch ${batchIndex + 1}/${batches.length} (${batch.length} items)...`);
      const prompt = buildIdentityPrompt(batch, source, options.syncMode);
      const response = await client.generateJson(prompt, {
        system: 'You are a music data expert. Return only valid JSON for concert identity extraction.',
        schemaHint: '{ "items": [{ "id": "string", "artistPrimary": "string", "artistAll": ["string"], "eventType": "solo|multi_artist|tribute|fan_meeting|festival|other|unknown", "confidence": 0.8 }] }',
      });
      const patches = normalizeAiResponse(response);
      applyPatches(batch, patches);
    }
  } catch (error: unknown) {
    console.warn(`AI identity extraction failed; returning original data: ${getErrorMessage(error)}`);
    return concerts;
  }

  return concerts;
}

function selectByQuality(concerts: Concert[], source: string | undefined, limits: AiLimits): Concert[] {
  const candidates: ConcertCandidate[] = [];

  concerts.forEach((concert, index) => {
    const normalized = normalizeConcertRecord(concert);
    Object.assign(concert, normalized);

    const missingArtist = isMissingArtist(concert);
    const lowConfidence = typeof concert.artistConfidence === 'number'
      ? concert.artistConfidence < LOW_CONFIDENCE_THRESHOLD
      : true;

    if (!missingArtist && !lowConfidence) return;

    candidates.push({
      concert,
      index,
      priority: missingArtist ? 0 : 1,
    });
  });

  const cap = Math.min(limits.maxItemsPerSource, limits.maxItemsPerSync);
  const selected = candidates
    .sort((a, b) => a.priority - b.priority || a.index - b.index)
    .slice(0, cap)
    .map((candidate) => candidate.concert);

  const skippedCount = candidates.length - selected.length;
  if (skippedCount > 0) {
    console.log(`🤖 AI identity${source ? ` for ${source}` : ''}: capped ${candidates.length} candidates to ${selected.length}; skipped ${skippedCount}.`);
  }

  return selected;
}

function isMissingArtist(concert: Concert): boolean {
  const artistCandidates = [
    concert.artistPrimary,
    concert.artist,
    ...(concert.artistAll || []),
  ];

  if (artistCandidates.length === 0) return true;
  return artistCandidates.every((value) => {
    const normalized = String(value || '').trim().toLowerCase();
    return !normalized || isGenericArtistName(normalized) || GENERIC_ARTIST_ALIASES.has(normalized);
  });
}

function buildIdentityPrompt(concerts: Concert[], source?: string, syncMode?: string): string {
  const items = concerts.map((concert) => ({
    id: concert.id,
    title: concert.rawTitle || concert.title,
    city: concert.city || '',
    date: concert.eventDate || concert.date || '',
    venue: concert.venue || '',
    source: concert.source || source || '',
  }));

  return `You are a music data expert. Extract structured artist and event identity from the following concerts.
Return ONLY a valid JSON object. Prefer this shape: {"items": [{"id":"same id","artistPrimary":"string","artistAll":["string"],"eventType":"solo|multi_artist|tribute|fan_meeting|festival|other|unknown","confidence":0.0}]}.
Use the input id exactly so results can be merged. Do not erase artist names just because the event is tribute, fan meeting, gala, festival, or multi-artist. If the title clearly references one or more artists, preserve those names.

Context:
source=${source || 'unknown'}
syncMode=${syncMode || 'default'}

Concerts:
${JSON.stringify(items, null, 2)}`;
}

function normalizeAiResponse(response: unknown): IdentityPatchPayload[] {
  if (Array.isArray(response)) {
    return response.filter(isRecord);
  }

  if (!isRecord(response)) return [];

  if (Array.isArray(response.items)) {
    return response.items.filter(isRecord);
  }
  if (Array.isArray(response.results)) {
    return response.results.filter(isRecord);
  }
  if (Array.isArray(response.data)) {
    return response.data.filter(isRecord);
  }

  return Object.entries(response).map(([key, value]) => {
    if (isRecord(value)) {
      return { id: key, ...value };
    }
    if (typeof value === 'string') {
      return { id: key, artistPrimary: value, artistAll: splitArtistNames(value), confidence: 0.8 };
    }
    return { id: key };
  });
}

function applyPatches(concerts: Concert[], patches: IdentityPatchPayload[]): void {
  const byId = new Map<string, IdentityPatchPayload>();
  const byTitle = new Map<string, IdentityPatchPayload>();

  for (const patch of patches) {
    const id = asString(patch.id);
    if (id) byId.set(id, patch);
    const title = asString(patch.title);
    if (title) byTitle.set(title, patch);
  }

  for (const concert of concerts) {
    const patch = byId.get(concert.id) || byTitle.get(concert.rawTitle || concert.title);
    if (!patch) continue;

    const artistPrimary = asString(patch.artistPrimary);
    const artistAll = normalizeArtistAll(patch.artistAll, artistPrimary);
    const confidence = asConfidence(patch.confidence ?? patch.artistConfidence);
    const eventType = asEventType(patch.eventType);

    Object.assign(concert, normalizeConcertRecord(concert, {
      artistPrimary,
      artistAll,
      eventType,
      artistConfidence: confidence,
      artistSource: 'llm',
    }));
  }
}

function normalizeArtistAll(value: unknown, artistPrimary: string): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => asString(item)).filter(Boolean);
  }
  if (typeof value === 'string') {
    return splitArtistNames(value);
  }
  return splitArtistNames(artistPrimary);
}

function asEventType(value: unknown): Concert['eventType'] | undefined {
  const normalized = asString(value);
  const allowed: NonNullable<Concert['eventType']>[] = ['solo', 'multi_artist', 'tribute', 'fan_meeting', 'festival', 'other', 'unknown'];
  return allowed.includes(normalized as NonNullable<Concert['eventType']>)
    ? normalized as NonNullable<Concert['eventType']>
    : undefined;
}

function asConfidence(value: unknown): number {
  const numberValue = typeof value === 'number' ? value : Number.parseFloat(asString(value));
  if (!Number.isFinite(numberValue)) return 0.8;
  return Math.max(0, Math.min(1, numberValue));
}

function loadAiLimits(env: Record<string, string | undefined>): AiLimits {
  return {
    batchSize: readPositiveInteger(env.AI_BATCH_SIZE, DEFAULT_AI_BATCH_SIZE),
    maxItemsPerSync: readPositiveInteger(env.AI_MAX_ITEMS_PER_SYNC, DEFAULT_AI_MAX_ITEMS_PER_SYNC),
    maxItemsPerSource: readPositiveInteger(env.AI_MAX_ITEMS_PER_SOURCE, DEFAULT_AI_MAX_ITEMS_PER_SOURCE),
    onlyMissingArtist: readBoolean(env.AI_ONLY_MISSING_ARTIST, true),
    skipSources: new Set(readList(env.AI_SKIP_FOR_SOURCES).map(normalizeSource).filter(Boolean) as string[]),
  };
}

function readPositiveInteger(value: string | undefined, defaultValue: number): number {
  const parsed = Number.parseInt(value?.trim() || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function readBoolean(value: string | undefined, defaultValue: boolean): boolean {
  const normalized = value?.trim().toLowerCase() || '';
  if (!normalized) return defaultValue;
  return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
}

function readList(value: string | undefined): string[] {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeSource(source: string | undefined): string | undefined {
  if (!source) return undefined;
  const normalized = source.trim().toLowerCase();
  if (normalized === 'moretickets-mobile') return 'moretickets';
  return normalized;
}

function toConcertSource(source: string | undefined): Concert['source'] | undefined {
  if (source === 'damai' || source === 'moretickets' || source === 'moretickets-global') {
    return source;
  }
  return undefined;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
