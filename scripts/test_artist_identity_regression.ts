import { Concert } from '../lib/damai-crawler';
import { getConcertDisplayTitle, normalizeConcertRecord, stripLeadingArtistPrefix } from '../lib/concert-identity';

type IdentityCase = {
  name: string;
  input: Concert;
  forceReinferIdentity?: boolean;
  expected: {
    artistPrimary: string;
    artistAll: string[];
    eventType: Concert['eventType'];
    artistSource: Concert['artistSource'];
    displayTitle?: string;
  };
};

const NOW = Date.now();

const cases: IdentityCase[] = [
  {
    name: 'official tag should win and keep solo artist',
    input: createConcert({
      title: '随机文案标题',
      rawTitle: '随机文案标题',
      rawArtistTag: '周杰伦',
      artist: '周杰伦',
    }),
    expected: {
      artistPrimary: '周杰伦',
      artistAll: ['周杰伦'],
      eventType: 'solo',
      artistSource: 'official_tag',
    },
  },
  {
    name: 'title prefix should be cleaned from display title',
    input: createConcert({
      title: '【IVE】IVE 世界巡演 SHOW WHAT I HAVE-上海站',
      rawTitle: '【IVE】IVE 世界巡演 SHOW WHAT I HAVE-上海站',
      artist: 'IVE',
    }),
    expected: {
      artistPrimary: 'IVE',
      artistAll: ['IVE'],
      eventType: 'solo',
      artistSource: 'legacy',
      displayTitle: 'IVE 世界巡演 SHOW WHAT I HAVE-上海站',
    },
  },
  {
    name: 'multi artist title should keep all named artists',
    input: createConcert({
      title: 'A-Lin / 张韶涵 群星演唱会 深圳站',
      rawTitle: 'A-Lin / 张韶涵 群星演唱会 深圳站',
      artistPrimary: 'A-Lin',
      artistAll: ['A-Lin', '张韶涵'],
    }),
    expected: {
      artistPrimary: 'A-Lin',
      artistAll: ['A-Lin', '张韶涵'],
      eventType: 'multi_artist',
      artistSource: 'rule',
    },
  },
  {
    name: 'fan meeting should remain descriptive and keep artist',
    input: createConcert({
      title: '李帝勋粉丝见面会-胡志明站',
      rawTitle: '李帝勋粉丝见面会-胡志明站',
    }),
    expected: {
      artistPrimary: '李帝勋',
      artistAll: ['李帝勋'],
      eventType: 'fan_meeting',
      artistSource: 'rule',
    },
  },
  {
    name: 'tribute should remain descriptive and keep referenced artist',
    input: createConcert({
      title: '致敬Beyond金曲演唱会 上海站',
      rawTitle: '致敬Beyond金曲演唱会 上海站',
      artistPrimary: 'Beyond',
      artistAll: ['Beyond'],
    }),
    expected: {
      artistPrimary: 'Beyond',
      artistAll: ['Beyond'],
      eventType: 'tribute',
      artistSource: 'rule',
    },
  },
  {
    name: 'festival marker should classify as festival',
    input: createConcert({
      title: '草莓音乐节 上海站',
      rawTitle: '草莓音乐节 上海站',
    }),
    expected: {
      artistPrimary: '',
      artistAll: [],
      eventType: 'festival',
      artistSource: 'unknown',
    },
  },
  {
    name: 'official multi-artist tag should split correctly',
    input: createConcert({
      title: '群星演唱会 北京站',
      rawTitle: '群星演唱会 北京站',
      rawArtistTag: 'A-Lin/张韶涵',
      artist: 'A-Lin/张韶涵',
    }),
    expected: {
      artistPrimary: 'A-Lin',
      artistAll: ['A-Lin', '张韶涵'],
      eventType: 'multi_artist',
      artistSource: 'official_tag',
    },
  },
  {
    name: 'uppercase group name should not split connector X',
    input: createConcert({
      title: 'TOMORROW X TOGETHER WORLD TOUR 上海站',
      rawTitle: 'TOMORROW X TOGETHER WORLD TOUR 上海站',
      artist: 'TOMORROW X TOGETHER',
    }),
    expected: {
      artistPrimary: 'TOMORROW X TOGETHER',
      artistAll: ['TOMORROW X TOGETHER'],
      eventType: 'solo',
      artistSource: 'legacy',
    },
  },
  {
    name: 'anniversary suffix should be stripped from legacy artist name',
    input: createConcert({
      title: 'Twins 25周年巡回演唱会 深圳站',
      rawTitle: 'Twins 25周年巡回演唱会 深圳站',
      artist: 'Twins 25周年',
    }),
    expected: {
      artistPrimary: 'Twins',
      artistAll: ['Twins'],
      eventType: 'solo',
      artistSource: 'legacy',
    },
  },
  {
    name: 'ordinal world tour suffix should be stripped from artist name',
    input: createConcert({
      title: 'NCT WISH 第一次世界巡演 澳门站',
      rawTitle: 'NCT WISH 第一次世界巡演 澳门站',
      artist: 'NCT WISH 第一次世界巡演',
    }),
    expected: {
      artistPrimary: 'NCT WISH',
      artistAll: ['NCT WISH'],
      eventType: 'solo',
      artistSource: 'legacy',
    },
  },
  {
    name: 'forced backfill should refresh stale rule identity from legacy artist',
    input: createConcert({
      title: 'TOMORROW X TOGETHER WORLD TOUR 上海站',
      rawTitle: 'TOMORROW X TOGETHER WORLD TOUR 上海站',
      artist: 'TOMORROW X TOGETHER',
      artistPrimary: 'TOMORROW',
      artistAll: ['TOMORROW', 'TOGETHER'],
      eventType: 'multi_artist',
      artistSource: 'rule',
      artistConfidence: 0.55,
    }),
    forceReinferIdentity: true,
    expected: {
      artistPrimary: 'TOMORROW X TOGETHER',
      artistAll: ['TOMORROW X TOGETHER'],
      eventType: 'solo',
      artistSource: 'legacy',
    },
  },
];

function main() {
  let failures = 0;

  for (const testCase of cases) {
    const normalized = testCase.forceReinferIdentity
      ? normalizeStoredConcertForTest(testCase.input, true)
      : normalizeConcertRecord(testCase.input);
    const displayTitle = getConcertDisplayTitle(normalized);

    failures += assertEqual(testCase.name, 'artistPrimary', normalized.artistPrimary || '', testCase.expected.artistPrimary);
    failures += assertArrayEqual(testCase.name, 'artistAll', normalized.artistAll || [], testCase.expected.artistAll);
    failures += assertEqual(testCase.name, 'eventType', normalized.eventType || 'unknown', testCase.expected.eventType || 'unknown');
    failures += assertEqual(testCase.name, 'artistSource', normalized.artistSource || 'unknown', testCase.expected.artistSource || 'unknown');

    if (testCase.expected.displayTitle !== undefined) {
      failures += assertEqual(testCase.name, 'displayTitle', displayTitle, testCase.expected.displayTitle);
    }
  }

  if (failures > 0) {
    console.error(`\n❌ Artist identity regression failed with ${failures} issue(s).`);
    process.exit(1);
  }

  console.log(`✅ Artist identity regression passed (${cases.length} cases).`);
}

function normalizeStoredConcertForTest(concert: Concert, forceReinferIdentity: boolean) {
  const shouldRefreshIdentity = forceReinferIdentity
    && (concert.artistSource === 'rule' || concert.artistSource === 'legacy' || concert.artistSource === 'unknown' || !concert.artistSource);
  const titleSeed = normalizeConcertRecord({
    ...concert,
    artistPrimary: shouldRefreshIdentity ? undefined : concert.artistPrimary,
    artistAll: shouldRefreshIdentity ? undefined : concert.artistAll,
    eventType: shouldRefreshIdentity || !concert.eventType || concert.eventType === 'unknown' ? undefined : concert.eventType,
    artistConfidence: shouldRefreshIdentity || typeof concert.artistConfidence !== 'number' || concert.artistConfidence <= 0 ? undefined : concert.artistConfidence,
    artistSource: shouldRefreshIdentity || !concert.artistSource || concert.artistSource === 'unknown' ? undefined : concert.artistSource,
  });
  const cleanedTitle = stripLeadingArtistPrefix(
    getConcertDisplayTitle(titleSeed),
    [titleSeed.artistPrimary, titleSeed.artist, ...(titleSeed.artistAll || [])]
  );
  const artistAll = titleSeed.artistAll && titleSeed.artistAll.length > 0
    ? titleSeed.artistAll
    : [titleSeed.artistPrimary || titleSeed.artist || ''].filter(Boolean);

  return normalizeConcertRecord(titleSeed, {
    rawTitle: cleanedTitle,
    artistPrimary: titleSeed.artistPrimary || titleSeed.artist || '',
    artistAll,
  });
}

function createConcert(overrides: Partial<Concert>): Concert {
  return {
    id: overrides.id || `identity-${Math.random().toString(36).slice(2)}`,
    title: overrides.title || 'Test Concert',
    image: overrides.image || '',
    date: overrides.date || '2026.01.01',
    city: overrides.city || '上海',
    venue: overrides.venue || '',
    price: overrides.price || '',
    status: overrides.status || '销售中',
    category: overrides.category || 'Concert',
    artist: overrides.artist || '',
    rawTitle: overrides.rawTitle,
    rawArtistTag: overrides.rawArtistTag,
    artistPrimary: overrides.artistPrimary,
    artistAll: overrides.artistAll,
    eventType: overrides.eventType,
    artistConfidence: overrides.artistConfidence,
    artistSource: overrides.artistSource,
    is_tribute: overrides.is_tribute || false,
    is_famous: overrides.is_famous ?? true,
    updatedAt: overrides.updatedAt || NOW,
    source: overrides.source || 'damai',
    sourceUrl: overrides.sourceUrl || '',
    eventDate: overrides.eventDate || '2026-01-01',
    eventTime: overrides.eventTime || '19:30',
    sortAt: overrides.sortAt || '2026-01-01T19:30:00.000Z',
    opportunityStatus: overrides.opportunityStatus || 'new',
    opportunityScore: overrides.opportunityScore ?? 80,
    opportunityScoreBreakdown: overrides.opportunityScoreBreakdown || [],
    lastSeenAt: overrides.lastSeenAt || NOW,
    projectId: overrides.projectId || null,
    notes: overrides.notes || '',
    normalizedCity: overrides.normalizedCity,
    normalizedVenue: overrides.normalizedVenue,
  };
}

function assertEqual(name: string, field: string, actual: string, expected: string) {
  if (actual === expected) return 0;
  console.error(`FAIL [${name}] ${field}: expected "${expected}", got "${actual}"`);
  return 1;
}

function assertArrayEqual(name: string, field: string, actual: string[], expected: string[]) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson === expectedJson) return 0;
  console.error(`FAIL [${name}] ${field}: expected ${expectedJson}, got ${actualJson}`);
  return 1;
}

main();
