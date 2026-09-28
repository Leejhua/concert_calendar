import { Concert } from '../lib/damai-crawler';
import { scoreConcertOpportunity } from '../lib/opportunity-score';

const NOW = new Date('2026-06-01T00:00:00.000Z');
const UPDATED_AT = NOW.getTime();

type ScoreCase = {
  name: string;
  concert: Concert;
  startAt: Date | null;
  expectedScore?: number;
  minScore?: number;
  maxScore?: number;
  matchedRules?: string[];
  unmatchedRules?: string[];
};

const cases: ScoreCase[] = [
  {
    name: 'high potential major-city premium event should reach top score',
    concert: createConcert({
      title: '周杰伦嘉年华世界巡回演唱会 广州站',
      city: '广州市',
      venue: '广州体育馆',
      price: '680-1880',
      status: '销售中',
      artist: '周杰伦',
      artistPrimary: '周杰伦',
      artistAll: ['周杰伦'],
      artistConfidence: 0.95,
      eventDate: '2026-06-10',
    }),
    startAt: new Date('2026-06-10T12:00:00.000Z'),
    expectedScore: 100,
    matchedRules: [
      'artist_presence',
      'artist_confidence_high',
      'city_tier_1',
      'venue_known',
      'venue_large',
      'price_known',
      'price_premium',
      'status_selling',
      'date_near_14_days',
    ],
    unmatchedRules: ['artist_missing_penalty', 'artist_lineup_strong', 'city_tier_2', 'city_tier_3'],
  },
  {
    name: 'known venue and sale status without artist should stay medium with tier 3 and missing-artist penalty',
    concert: createConcert({
      title: '夏日音乐派对 佛山站',
      city: '佛山',
      venue: '岭南明珠演艺中心',
      price: '280-480',
      status: '预售',
      artist: '',
      artistPrimary: '',
      artistAll: [],
      artistConfidence: 0,
      eventDate: '2026-08-01',
    }),
    startAt: new Date('2026-08-01T12:00:00.000Z'),
    minScore: 65,
    maxScore: 72,
    matchedRules: ['city_tier_3', 'venue_known', 'venue_large', 'price_known', 'status_selling', 'date_near_120_days', 'artist_missing_penalty'],
    unmatchedRules: ['artist_presence', 'artist_confidence_high', 'artist_lineup_strong', 'city_tier_1', 'city_tier_2', 'price_premium', 'date_near_14_days', 'date_near_60_days', 'date_past_0_30', 'date_past_31_90', 'date_past_90_plus'],
  },
  {
    name: 'past event within 30 days should receive light tier penalty',
    concert: createConcert({
      title: '陈奕迅演唱会 上海站',
      city: '上海',
      venue: '梅赛德斯-奔驰文化中心',
      price: '580-1580',
      status: '销售中',
      artist: '陈奕迅',
      artistPrimary: '陈奕迅',
      artistAll: ['陈奕迅'],
      artistConfidence: 0.9,
      eventDate: '2026-05-20',
    }),
    startAt: new Date('2026-05-20T12:00:00.000Z'),
    maxScore: 90,
    matchedRules: ['date_past_0_30'],
    unmatchedRules: ['date_near_14_days', 'date_near_60_days', 'date_near_120_days', 'date_past_31_90', 'date_past_90_plus', 'artist_missing_penalty', 'city_tier_2', 'city_tier_3'],
  },
  {
    name: 'missing date should not crash and should expose missing date penalty',
    concert: createConcert({
      title: '林俊杰演唱会 深圳站',
      city: '深圳',
      venue: '深圳湾体育中心体育场',
      price: '480-1280',
      status: '开售',
      artist: '林俊杰',
      artistPrimary: '林俊杰',
      artistAll: ['林俊杰'],
      artistConfidence: 0.9,
      eventDate: null,
      eventTime: null,
      sortAt: null,
    }),
    startAt: null,
    minScore: 85,
    maxScore: 95,
    matchedRules: ['missing_date'],
    unmatchedRules: ['date_near_14_days', 'date_near_60_days', 'date_near_120_days', 'date_past_0_30', 'date_past_31_90', 'date_past_90_plus', 'artist_missing_penalty'],
  },
  {
    name: 'multi-artist lineup should receive lineup strength signal',
    concert: createConcert({
      title: 'A-Lin / 张韶涵 群星演唱会 杭州站',
      city: '杭州',
      venue: '杭州奥体中心体育馆',
      price: '380-980',
      status: '销售中',
      artistPrimary: 'A-Lin',
      artistAll: ['A-Lin', '张韶涵'],
      artistConfidence: 0.9,
      eventType: 'multi_artist',
      eventDate: '2026-07-15',
    }),
    startAt: new Date('2026-07-15T12:00:00.000Z'),
    minScore: 95,
    matchedRules: ['artist_lineup_strong', 'city_tier_2', 'date_near_60_days'],
    unmatchedRules: ['artist_missing_penalty', 'city_tier_1', 'city_tier_3'],
  },
  {
    name: 'low information event should stay low with missing-artist penalty',
    concert: createConcert({
      title: '小型音乐现场',
      city: '三亚',
      venue: '',
      price: '',
      status: '待定',
      artist: '',
      artistPrimary: '',
      artistAll: [],
      artistConfidence: 0,
      eventDate: null,
      eventTime: null,
      sortAt: null,
    }),
    startAt: null,
    maxScore: 45,
    matchedRules: ['missing_date', 'artist_missing_penalty'],
    unmatchedRules: ['artist_presence', 'venue_known', 'price_known', 'status_selling', 'city_tier_1', 'city_tier_2', 'city_tier_3'],
  },
  {
    name: 'tribute event should score like a solo event without direct type penalty or bonus',
    concert: createConcert({
      title: '致敬经典·烛光音乐会 广州站',
      city: '广州市',
      venue: '广州体育馆',
      price: '280-480',
      status: '销售中',
      artist: '烛光乐团',
      artistPrimary: '烛光乐团',
      artistAll: ['烛光乐团'],
      artistConfidence: 0.7,
      eventType: 'tribute',
      eventDate: '2026-06-20',
    }),
    startAt: new Date('2026-06-20T12:00:00.000Z'),
    minScore: 95,
    maxScore: 100,
    matchedRules: ['artist_presence', 'city_tier_1', 'venue_known', 'venue_large', 'price_known', 'status_selling', 'date_near_60_days'],
    unmatchedRules: ['artist_missing_penalty', 'artist_confidence_high', 'artist_lineup_strong', 'price_premium', 'date_near_14_days', 'city_tier_2', 'city_tier_3', 'date_past_0_30', 'date_past_31_90', 'date_past_90_plus'],
  },
  {
    name: 'fan meeting with known artist and mid-tier city should land in upper-mid band',
    concert: createConcert({
      title: '张艺兴粉丝见面会 成都站',
      city: '成都',
      venue: '成都正兴演艺空间',
      price: '180-580',
      status: '预售',
      artist: '张艺兴',
      artistPrimary: '张艺兴',
      artistAll: ['张艺兴'],
      artistConfidence: 0.9,
      eventType: 'fan_meeting',
      eventDate: '2026-07-10',
    }),
    startAt: new Date('2026-07-10T12:00:00.000Z'),
    minScore: 90,
    maxScore: 95,
    matchedRules: ['artist_presence', 'artist_confidence_high', 'city_tier_2', 'venue_known', 'price_known', 'status_selling', 'date_near_60_days'],
    unmatchedRules: ['artist_missing_penalty', 'artist_lineup_strong', 'city_tier_1', 'city_tier_3', 'venue_large', 'price_premium', 'date_near_14_days'],
  },
  {
    name: 'multi-artist lineup with three names should gain lineup strength and stay high',
    concert: createConcert({
      title: '群星演唱会 杭州站',
      city: '杭州',
      venue: '杭州奥体中心体育馆',
      price: '380-580',
      status: '销售中',
      artistPrimary: '艺人A',
      artistAll: ['艺人A', '艺人B', '艺人C'],
      artistConfidence: 0.9,
      eventType: 'multi_artist',
      eventDate: '2026-08-01',
    }),
    startAt: new Date('2026-08-01T12:00:00.000Z'),
    minScore: 97,
    maxScore: 100,
    matchedRules: ['artist_presence', 'artist_confidence_high', 'artist_lineup_strong', 'city_tier_2', 'venue_known', 'venue_large', 'price_known', 'status_selling', 'date_near_120_days'],
    unmatchedRules: ['artist_missing_penalty', 'city_tier_1', 'city_tier_3', 'price_premium', 'date_near_14_days', 'date_near_60_days', 'date_past_0_30', 'date_past_31_90', 'date_past_90_plus'],
  },
  {
    name: 'artist recovered but no commercial signals should stay mid and incur missing-date penalty',
    concert: createConcert({
      title: '某演唱会',
      city: '',
      venue: '',
      price: '',
      status: '待定',
      artist: '某歌手',
      artistPrimary: '某歌手',
      artistAll: ['某歌手'],
      artistConfidence: 0.6,
      eventDate: null,
      eventTime: null,
      sortAt: null,
    }),
    startAt: null,
    maxScore: 55,
    matchedRules: ['artist_presence', 'missing_date'],
    unmatchedRules: ['artist_missing_penalty', 'artist_confidence_high', 'city_tier_1', 'city_tier_2', 'city_tier_3', 'venue_known', 'venue_large', 'price_known', 'price_premium', 'status_selling', 'date_near_14_days', 'date_near_60_days', 'date_near_120_days', 'date_past_0_30', 'date_past_31_90', 'date_past_90_plus'],
  },
  {
    name: 'high-heat flagship show with premium price and near date should clamp at top score',
    concert: createConcert({
      title: '五月天人生无限公司巡回演唱会 北京站',
      city: '北京',
      venue: '国家体育场（鸟巢）',
      price: '580-2080',
      status: '销售中',
      artist: '五月天',
      artistPrimary: '五月天',
      artistAll: ['五月天'],
      artistConfidence: 0.95,
      eventDate: '2026-06-10',
    }),
    startAt: new Date('2026-06-10T12:00:00.000Z'),
    expectedScore: 100,
    matchedRules: ['artist_presence', 'artist_confidence_high', 'city_tier_1', 'venue_known', 'venue_large', 'price_known', 'price_premium', 'status_selling', 'date_near_14_days'],
    unmatchedRules: ['artist_missing_penalty', 'city_tier_2', 'city_tier_3'],
  },
  {
    name: 'overseas small-city record without city-tier bonus should rely on venue and price signals',
    concert: createConcert({
      title: '某海外演唱会 三亚站',
      city: '三亚',
      venue: '三亚海棠湾剧场',
      price: '380-980',
      status: '销售中',
      artist: '某海外艺人',
      artistPrimary: '某海外艺人',
      artistAll: ['某海外艺人'],
      artistConfidence: 0.7,
      eventDate: '2026-07-20',
    }),
    startAt: new Date('2026-07-20T12:00:00.000Z'),
    minScore: 93,
    maxScore: 97,
    matchedRules: ['artist_presence', 'venue_known', 'venue_large', 'price_known', 'price_premium', 'status_selling', 'date_near_60_days'],
    unmatchedRules: ['artist_missing_penalty', 'artist_confidence_high', 'artist_lineup_strong', 'city_tier_1', 'city_tier_2', 'city_tier_3', 'date_near_14_days'],
  },
  {
    name: 'high-quality record beyond 120-day window should keep score without date bonus or penalty',
    concert: createConcert({
      title: '某巡演 广州站',
      city: '广州',
      venue: '广州体育馆',
      price: '480-980',
      status: '销售中',
      artist: '某星',
      artistPrimary: '某星',
      artistAll: ['某星'],
      artistConfidence: 0.9,
      eventDate: '2026-11-15',
    }),
    startAt: new Date('2026-11-15T12:00:00.000Z'),
    minScore: 95,
    maxScore: 100,
    matchedRules: ['artist_presence', 'artist_confidence_high', 'city_tier_1', 'venue_known', 'venue_large', 'price_known', 'price_premium', 'status_selling'],
    unmatchedRules: ['artist_missing_penalty', 'artist_lineup_strong', 'city_tier_2', 'city_tier_3', 'date_near_14_days', 'date_near_60_days', 'date_near_120_days', 'date_past_0_30', 'date_past_31_90', 'date_past_90_plus', 'missing_date'],
  },
  {
    name: 'fan meeting with missing date and no commercial signals should drop into low-mid band',
    concert: createConcert({
      title: '某idol见面会',
      city: '杭州',
      venue: '杭州Mao Livehouse',
      price: '',
      status: '待定',
      artist: '某idol',
      artistPrimary: '某idol',
      artistAll: ['某idol'],
      artistConfidence: 0.5,
      eventType: 'fan_meeting',
      eventDate: null,
      eventTime: null,
      sortAt: null,
    }),
    startAt: null,
    minScore: 58,
    maxScore: 64,
    matchedRules: ['artist_presence', 'city_tier_2', 'venue_known', 'missing_date'],
    unmatchedRules: ['artist_missing_penalty', 'artist_confidence_high', 'artist_lineup_strong', 'city_tier_1', 'city_tier_3', 'venue_large', 'price_known', 'price_premium', 'status_selling', 'date_near_14_days', 'date_near_60_days', 'date_near_120_days', 'date_past_0_30', 'date_past_31_90', 'date_past_90_plus'],
  },
  {
    name: 'festival with strong lineup and premium price near date should clamp at top score',
    concert: createConcert({
      title: '草莓音乐节 上海站',
      city: '上海',
      venue: '上海体育场',
      price: '299-799',
      status: '销售中',
      artistPrimary: '艺人A',
      artistAll: ['艺人A', '艺人B', '艺人C', '艺人D'],
      artistConfidence: 0.85,
      eventType: 'festival',
      eventDate: '2026-06-15',
    }),
    startAt: new Date('2026-06-15T12:00:00.000Z'),
    expectedScore: 100,
    matchedRules: ['artist_presence', 'artist_confidence_high', 'artist_lineup_strong', 'city_tier_1', 'venue_known', 'venue_large', 'price_known', 'price_premium', 'status_selling', 'date_near_14_days'],
    unmatchedRules: ['artist_missing_penalty', 'city_tier_2', 'city_tier_3'],
  },
  {
    name: 'tier 3 city with known artist should receive tier 3 bonus',
    concert: createConcert({
      title: '某歌手演唱会 青岛站',
      city: '青岛',
      venue: '青岛体育馆',
      price: '280-480',
      status: '销售中',
      artist: '某歌手',
      artistPrimary: '某歌手',
      artistAll: ['某歌手'],
      artistConfidence: 0.9,
      eventDate: '2026-07-15',
    }),
    startAt: new Date('2026-07-15T12:00:00.000Z'),
    minScore: 94,
    maxScore: 98,
    matchedRules: ['artist_presence', 'artist_confidence_high', 'city_tier_3', 'venue_known', 'venue_large', 'price_known', 'status_selling', 'date_near_60_days'],
    unmatchedRules: ['artist_missing_penalty', 'artist_lineup_strong', 'city_tier_1', 'city_tier_2', 'price_premium', 'date_near_14_days', 'date_past_0_30', 'date_past_31_90', 'date_past_90_plus'],
  },
  {
    name: 'artist missing with strong city and venue signals should still incur missing-artist penalty',
    concert: createConcert({
      title: '【群星】演唱会 香港站',
      city: '香港',
      venue: '香港亚洲国际博览馆',
      price: '680-1880',
      status: '销售中',
      artist: '',
      artistPrimary: '',
      artistAll: [],
      artistConfidence: 0,
      eventDate: '2026-07-20',
    }),
    startAt: new Date('2026-07-20T12:00:00.000Z'),
    minScore: 82,
    maxScore: 88,
    matchedRules: ['city_tier_1', 'venue_known', 'venue_large', 'price_known', 'price_premium', 'status_selling', 'date_near_60_days', 'artist_missing_penalty'],
    unmatchedRules: ['artist_presence', 'artist_confidence_high', 'artist_lineup_strong', 'city_tier_2', 'city_tier_3', 'date_near_14_days', 'date_past_0_30', 'date_past_31_90', 'date_past_90_plus'],
  },
  {
    name: 'past event 31-90 days should receive medium tier penalty',
    concert: createConcert({
      title: '某歌手演唱会 北京站',
      city: '北京',
      venue: '国家体育馆',
      price: '480-980',
      status: '销售中',
      artist: '某歌手',
      artistPrimary: '某歌手',
      artistAll: ['某歌手'],
      artistConfidence: 0.9,
      eventDate: '2026-04-15',
    }),
    startAt: new Date('2026-04-15T12:00:00.000Z'),
    maxScore: 80,
    matchedRules: ['date_past_31_90'],
    unmatchedRules: ['date_near_14_days', 'date_near_60_days', 'date_near_120_days', 'date_past_0_30', 'date_past_90_plus', 'artist_missing_penalty', 'city_tier_2', 'city_tier_3'],
  },
  {
    name: 'past event beyond 90 days should receive heavy tier penalty',
    concert: createConcert({
      title: '某歌手演唱会 北京站',
      city: '北京',
      venue: '国家体育馆',
      price: '480-980',
      status: '销售中',
      artist: '某歌手',
      artistPrimary: '某歌手',
      artistAll: ['某歌手'],
      artistConfidence: 0.9,
      eventDate: '2026-02-15',
    }),
    startAt: new Date('2026-02-15T12:00:00.000Z'),
    maxScore: 70,
    matchedRules: ['date_past_90_plus'],
    unmatchedRules: ['date_near_14_days', 'date_near_60_days', 'date_near_120_days', 'date_past_0_30', 'date_past_31_90', 'artist_missing_penalty', 'city_tier_2', 'city_tier_3'],
  },
];

function main() {
  let failures = 0;

  for (const testCase of cases) {
    const result = scoreConcertOpportunity(testCase.concert, testCase.startAt, NOW);

    if (testCase.expectedScore !== undefined && result.score !== testCase.expectedScore) {
      failures += 1;
      console.error(`FAIL [${testCase.name}] score: expected ${testCase.expectedScore}, got ${result.score}`);
    }

    if (testCase.minScore !== undefined && result.score < testCase.minScore) {
      failures += 1;
      console.error(`FAIL [${testCase.name}] score: expected >= ${testCase.minScore}, got ${result.score}`);
    }

    if (testCase.maxScore !== undefined && result.score > testCase.maxScore) {
      failures += 1;
      console.error(`FAIL [${testCase.name}] score: expected <= ${testCase.maxScore}, got ${result.score}`);
    }

    const matched = new Set(result.rules.filter((rule) => rule.matched).map((rule) => rule.key));
    for (const key of testCase.matchedRules || []) {
      if (!matched.has(key)) {
        failures += 1;
        console.error(`FAIL [${testCase.name}] expected matched rule "${key}"`);
      }
    }

    for (const key of testCase.unmatchedRules || []) {
      if (matched.has(key)) {
        failures += 1;
        console.error(`FAIL [${testCase.name}] expected unmatched rule "${key}"`);
      }
    }
  }

  failures += assertEventTypeHasNoDirectScoreEffect();

  if (failures > 0) {
    console.error(`\nOpportunity score regression failed with ${failures} issue(s).`);
    process.exit(1);
  }

  console.log(`Opportunity score regression passed (${cases.length + 1} cases).`);
}

function assertEventTypeHasNoDirectScoreEffect() {
  const base = createConcert({
    title: '王菲经典金曲演唱会 北京站',
    city: '北京',
    venue: '国家体育馆',
    price: '580-1280',
    status: '销售中',
    artist: '王菲',
    artistPrimary: '王菲',
    artistAll: ['王菲'],
    artistConfidence: 0.9,
    eventType: 'solo',
    eventDate: '2026-07-01',
  });

  const tribute = createConcert({
    ...base,
    id: 'score-event-type-tribute',
    eventType: 'tribute',
  });

  const baseResult = scoreConcertOpportunity(base, new Date('2026-07-01T12:00:00.000Z'), NOW);
  const tributeResult = scoreConcertOpportunity(tribute, new Date('2026-07-01T12:00:00.000Z'), NOW);
  const eventTypeRules = baseResult.rules.concat(tributeResult.rules).filter((rule) => rule.key.includes('event_type'));

  let failures = 0;
  if (baseResult.score !== tributeResult.score) {
    failures += 1;
    console.error(`FAIL [eventType direct effect] expected same score, got ${baseResult.score} and ${tributeResult.score}`);
  }

  if (eventTypeRules.length > 0) {
    failures += 1;
    console.error('FAIL [eventType direct effect] expected no event_type scoring rules');
  }

  return failures;
}

function createConcert(overrides: Partial<Concert>): Concert {
  const eventDate = overrides.eventDate === undefined ? '2026-01-01' : overrides.eventDate;

  return {
    id: overrides.id || `score-${Math.random().toString(36).slice(2)}`,
    title: overrides.title || 'Test Concert',
    image: overrides.image || '',
    date: overrides.date || (eventDate ? eventDate.replace(/-/g, '.') : ''),
    city: overrides.city || '',
    venue: overrides.venue || '',
    price: overrides.price || '',
    status: overrides.status || '待定',
    category: overrides.category || 'Concert',
    artist: overrides.artist || '',
    rawTitle: overrides.rawTitle,
    rawArtistTag: overrides.rawArtistTag,
    artistPrimary: overrides.artistPrimary,
    artistAll: overrides.artistAll,
    eventType: overrides.eventType,
    artistConfidence: overrides.artistConfidence,
    artistSource: overrides.artistSource || 'rule',
    is_tribute: overrides.is_tribute || false,
    is_famous: overrides.is_famous ?? true,
    updatedAt: overrides.updatedAt || UPDATED_AT,
    source: overrides.source || 'damai',
    sourceUrl: overrides.sourceUrl || '',
    eventDate,
    eventTime: overrides.eventTime === undefined ? '19:30' : overrides.eventTime,
    sortAt: overrides.sortAt === undefined && eventDate ? `${eventDate}T19:30:00.000Z` : overrides.sortAt,
    opportunityStatus: overrides.opportunityStatus || 'new',
    opportunityScore: overrides.opportunityScore ?? 0,
    opportunityScoreBreakdown: overrides.opportunityScoreBreakdown || [],
    lastSeenAt: overrides.lastSeenAt || UPDATED_AT,
    projectId: overrides.projectId || null,
    notes: overrides.notes || '',
    normalizedCity: overrides.normalizedCity,
    normalizedVenue: overrides.normalizedVenue,
  };
}

main();