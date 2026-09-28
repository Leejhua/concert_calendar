import { Concert } from '../lib/damai-crawler';
import { getDuplicateConflictReasons, getDuplicateScoreDetail, isDuplicate, mergeConcertLists } from '../lib/deduplication';

type Case = {
  name: string;
  left: Concert;
  right: Concert;
  expectDuplicate: boolean;
  expectCanonicalId?: string;
  expectConflictReasons?: string[];
};

const NOW = Date.now();

const cases: Case[] = [
  {
    name: 'same event across city and venue aliases should merge',
    left: createConcert({
      id: 'damai-hk-1',
      title: '周杰伦嘉年华世界巡回演唱会-中国香港站',
      city: '中国香港',
      venue: '鸟巢',
      artist: '周杰伦',
      artistPrimary: '周杰伦',
      artistAll: ['周杰伦'],
      source: 'damai',
      sourceUrl: 'https://damai.example/jay',
      eventDate: '2026-07-10',
      price: '680-1880',
    }),
    right: createConcert({
      id: 'mt-hk-1',
      title: '周杰伦 嘉年华世界巡演 香港站',
      city: '香港特别行政区',
      venue: '国家体育场',
      artist: '周杰伦',
      artistPrimary: '周杰伦',
      artistAll: ['周杰伦'],
      source: 'moretickets',
      eventDate: '2026-07-10',
      price: '680-1880',
    }),
    expectDuplicate: true,
    expectCanonicalId: 'damai-hk-1',
  },
  {
    name: 'same city/date but different artists should not merge',
    left: createConcert({
      id: 'artist-a',
      title: '陈奕迅 FEAR AND DREAMS 广州站',
      city: '广州市',
      venue: '广州体育馆',
      artist: '陈奕迅',
      artistPrimary: '陈奕迅',
      artistAll: ['陈奕迅'],
      eventDate: '2026-08-21',
    }),
    right: createConcert({
      id: 'artist-b',
      title: '林俊杰 JJ20 广州站',
      city: '广州',
      venue: '广州体育馆',
      artist: '林俊杰',
      artistPrimary: '林俊杰',
      artistAll: ['林俊杰'],
      eventDate: '2026-08-21',
    }),
    expectDuplicate: false,
  },
  {
    name: 'project-linked record should win canonical selection',
    left: createConcert({
      id: 'project-linked',
      title: 'IVE 世界巡演 SHOW WHAT I HAVE 上海站',
      city: '上海市',
      venue: '梅奔文化中心',
      artist: 'IVE',
      artistPrimary: 'IVE',
      artistAll: ['IVE'],
      source: 'moretickets',
      projectId: 'project-123',
      eventDate: '2026-09-01',
    }),
    right: createConcert({
      id: 'better-source-but-no-project',
      title: 'IVE 世界巡演 SHOW WHAT I HAVE 上海站',
      city: '上海',
      venue: '梅赛德斯-奔驰文化中心',
      artist: 'IVE',
      artistPrimary: 'IVE',
      artistAll: ['IVE'],
      source: 'damai',
      sourceUrl: 'https://damai.example/ive',
      eventDate: '2026-09-01',
    }),
    expectDuplicate: true,
    expectCanonicalId: 'project-linked',
  },
  {
    name: 'multi-artist lineup aliases should merge',
    left: createConcert({
      id: 'festival-a',
      title: '群星演唱会 深圳站',
      city: '深圳市',
      venue: '深圳湾体育中心体育馆',
      artistPrimary: 'A-Lin',
      artistAll: ['A-Lin', '张韶涵'],
      eventType: 'multi_artist',
      eventDate: '2026-10-12',
    }),
    right: createConcert({
      id: 'festival-b',
      title: 'A-Lin / 张韶涵 群星演唱会 深圳站',
      city: '深圳',
      venue: '深圳湾体育馆',
      artistPrimary: 'A-Lin',
      artistAll: ['A-Lin', '张韶涵'],
      eventType: 'multi_artist',
      eventDate: '2026-10-12',
    }),
    expectDuplicate: true,
  },
  {
    name: 'same artist and city but different dates should not merge',
    left: createConcert({
      id: 'date-a',
      title: '陶喆 Soul Power II 北京站',
      city: '北京',
      venue: '华熙LIVE·五棵松',
      artist: '陶喆',
      artistPrimary: '陶喆',
      artistAll: ['陶喆'],
      eventDate: '2026-11-01',
    }),
    right: createConcert({
      id: 'date-b',
      title: '陶喆 Soul Power II 北京站',
      city: '北京市',
      venue: '凯迪拉克中心',
      artist: '陶喆',
      artistPrimary: '陶喆',
      artistAll: ['陶喆'],
      eventDate: '2026-11-06',
    }),
    expectDuplicate: false,
  },
  {
    name: 'same event across English city and venue aliases should merge',
    left: createConcert({
      id: 'asiaworld-zh',
      title: 'BLACKPINK WORLD TOUR 香港站',
      city: '中国香港',
      venue: '香港亚洲国际博览馆',
      artist: 'BLACKPINK',
      artistPrimary: 'BLACKPINK',
      artistAll: ['BLACKPINK'],
      eventDate: '2026-12-20',
    }),
    right: createConcert({
      id: 'asiaworld-en',
      title: 'BLACKPINK WORLD TOUR Hong Kong',
      city: 'Hong Kong, China',
      venue: 'AsiaWorld-Expo',
      artist: 'BLACKPINK',
      artistPrimary: 'BLACKPINK',
      artistAll: ['BLACKPINK'],
      source: 'moretickets-global',
      eventDate: '2026-12-20',
    }),
    expectDuplicate: true,
    expectCanonicalId: 'asiaworld-zh',
  },
  {
    name: 'single-day ticket and two-day pass should not merge',
    left: createConcert({
      id: 'sound-planet-single-day',
      title: 'SOUND PLANET FESTIVAL 2026-仁川站',
      city: '韩国',
      venue: 'Paradise City',
      artist: '单日票',
      rawArtistTag: '单日票',
      eventType: 'festival',
      eventDate: '2026-09-05',
      date: '2026.09.05',
    }),
    right: createConcert({
      id: 'sound-planet-two-day-pass',
      title: 'SOUND PLANET FESTIVAL 2026-仁川站',
      city: '韩国',
      venue: 'Paradise City',
      artist: '两日通票',
      rawArtistTag: '两日通票',
      eventType: 'festival',
      eventDate: '2026-09-05',
      date: '2026.9.5-9.6 兩日通票',
    }),
    expectDuplicate: false,
  },
  {
    name: 'NCT WISH cross-source same source id remains candidate when range is only source coverage',
    left: createConcert({
      id: 'mtglobal_69129cbe756c660001710fa3',
      title: 'NCT WISH 第一次巡回演唱会“INTO THE WISH: Our WISH”-澳门站',
      city: '中国澳门',
      venue: '澳门威尼斯人金光综艺馆',
      artist: 'NCT WISH',
      artistPrimary: 'NCT WISH',
      artistAll: ['NCT WISH'],
      source: 'moretickets-global',
      eventDate: '2026-03-21',
      date: '2026.03.21',
    }),
    right: createConcert({
      id: 'mt_69129cbe756c660001710fa3',
      title: 'NCT WISH 第一次世界巡回演唱会「INTO THE WISH : Our WISH」-澳门站',
      city: '中国澳门',
      venue: '澳门威尼斯人金光综艺馆',
      artist: 'NCT WISH',
      artistPrimary: 'NCT WISH',
      artistAll: ['NCT WISH'],
      source: 'moretickets',
      eventDate: '2026-03-21',
      date: '2026.03.21-2026.03.22',
    }),
    expectDuplicate: true,
  },
  {
    name: 'NCT WISH single-day ticket and two-day pass should not merge when range is product variant',
    left: createConcert({
      id: 'nct-wish-single-day-ticket',
      title: 'NCT WISH 第一次巡回演唱会“INTO THE WISH: Our WISH”-澳门站 单日票',
      city: '中国澳门',
      venue: '澳门威尼斯人金光综艺馆',
      artist: 'NCT WISH',
      artistPrimary: 'NCT WISH',
      artistAll: ['NCT WISH'],
      eventDate: '2026-03-21',
      date: '2026.03.21 单日票',
    }),
    right: createConcert({
      id: 'nct-wish-two-day-pass',
      title: 'NCT WISH 第一次世界巡回演唱会「INTO THE WISH : Our WISH」-澳门站 两日通票',
      city: '中国澳门',
      venue: '澳门威尼斯人金光综艺馆',
      artist: 'NCT WISH',
      artistPrimary: 'NCT WISH',
      artistAll: ['NCT WISH'],
      eventDate: '2026-03-21',
      date: '2026.03.21-2026.03.22 两日通票',
    }),
    expectDuplicate: false,
  },
  {
    name: 'Wang Sulong cross-source same source id remains candidate despite date range coverage',
    left: createConcert({
      id: 'mtglobal_69450601be402700018b6995',
      title: '汪苏泷 2026 "罗曼前传"世界巡回演唱会-澳门站',
      city: '中国澳门',
      venue: '澳门银河综艺馆',
      artist: '汪苏泷',
      artistPrimary: '汪苏泷',
      artistAll: ['汪苏泷'],
      source: 'moretickets-global',
      eventDate: '2026-02-27',
      date: '2026.02.27',
    }),
    right: createConcert({
      id: 'mt_69450601be402700018b6995',
      title: '汪苏泷 2026「罗曼前传」世界巡回演唱会-澳门站',
      city: '中国澳门',
      venue: '澳门银河综艺馆',
      artist: '汪苏泷',
      artistPrimary: '汪苏泷',
      artistAll: ['汪苏泷'],
      source: 'moretickets',
      eventDate: '2026-02-27',
      date: '2026.02.27-2026.03.01',
    }),
    expectDuplicate: true,
  },
  {
    name: 'English words containing pass should not disable shared source-id date range merge',
    left: createConcert({
      id: 'mtglobal_compass001',
      title: 'COMPASSION WORLD TOUR 香港站',
      city: '中国香港',
      venue: '亚洲国际博览馆',
      artist: 'COMPASSION',
      artistPrimary: 'COMPASSION',
      artistAll: ['COMPASSION'],
      source: 'moretickets-global',
      eventDate: '2026-05-01',
      date: '2026.05.01',
    }),
    right: createConcert({
      id: 'mt_compass001',
      title: 'COMPASSION WORLD TOUR 香港站',
      city: '中国香港',
      venue: '亚洲国际博览馆',
      artist: 'COMPASSION',
      artistPrimary: 'COMPASSION',
      artistAll: ['COMPASSION'],
      source: 'moretickets',
      eventDate: '2026-05-01',
      date: '2026.05.01-2026.05.02',
    }),
    expectDuplicate: true,
  },
  {
    name: 'Chinese date range with product variant should not merge with single-day ticket',
    left: createConcert({
      id: 'festival-cn-single-day',
      title: '星球音乐节 上海站 单日票',
      city: '上海',
      venue: '上海体育场',
      artist: '群星',
      artistPrimary: '群星',
      artistAll: ['群星'],
      eventType: 'festival',
      eventDate: '2026-10-01',
      date: '2026年10月1日 单日票',
    }),
    right: createConcert({
      id: 'festival-cn-two-day-pass',
      title: '星球音乐节 上海站 两日通票',
      city: '上海市',
      venue: '上海体育场',
      artist: '群星',
      artistPrimary: '群星',
      artistAll: ['群星'],
      eventType: 'festival',
      eventDate: '2026-10-01',
      date: '2026年10月1日-2026年10月2日 两日通票',
    }),
    expectDuplicate: false,
  },
  {
    name: 'both artists missing with shared source-id and high title similarity should not merge (artist_missing guard)',
    left: createConcert({
      id: 'mtglobal_missing001',
      title: '2026星球音乐节-澳门站',
      city: '中国澳门',
      venue: '澳门银河综艺馆',
      artist: '',
      artistPrimary: '',
      artistAll: [],
      source: 'moretickets-global',
      eventDate: '2026-04-15',
      date: '2026.04.15',
    }),
    right: createConcert({
      id: 'mt_missing001',
      title: '2026星球音乐节 澳门站',
      city: '中国澳门',
      venue: '澳门银河综艺馆',
      artist: '',
      artistPrimary: '',
      artistAll: [],
      source: 'moretickets',
      eventDate: '2026-04-15',
      date: '2026.04.15',
    }),
    expectDuplicate: false,
    expectConflictReasons: ['artist_missing'],
  },
  {
    name: 'one side artist missing with different artist in title should not merge (artist_missing guard)',
    left: createConcert({
      id: 'laufey-bkk',
      title: 'Laufey: A Matter of Time巡演-曼谷站',
      city: '泰国',
      venue: 'Impact会展中心',
      artist: 'Laufey',
      artistPrimary: 'Laufey',
      artistAll: ['Laufey'],
      eventDate: '2026-05-31',
      date: '2026.05.31',
    }),
    right: createConcert({
      id: 'lingorm-bkk',
      title: 'LingOrm Birthday Fan Party-曼谷站',
      city: '泰国',
      venue: 'Impact会展中心',
      artist: '',
      artistPrimary: '',
      artistAll: [],
      eventDate: '2026-05-31',
      date: '2026.05.31',
    }),
    expectDuplicate: false,
    expectConflictReasons: ['artist_missing'],
  },
];

function main() {
  const originalLog = console.log;
  console.log = () => {};

  try {
    let failures = 0;

    for (const testCase of cases) {
      const detail = getDuplicateScoreDetail(testCase.left, testCase.right);
      const duplicate = isDuplicate(testCase.left, testCase.right);
      const merged = mergeConcertLists([testCase.left], [testCase.right]);
      const mergedIds = new Set(merged.map((item) => item.id));
      const canonicalId = merged.length === 1 ? merged[0].id : undefined;

      if (duplicate !== testCase.expectDuplicate) {
        failures += 1;
        originalLog(`FAIL [${testCase.name}] expected duplicate=${testCase.expectDuplicate}, got ${duplicate} (score=${detail.score.toFixed(2)})`);
      }

      if (testCase.expectDuplicate && merged.length !== 1) {
        failures += 1;
        originalLog(`FAIL [${testCase.name}] expected merged length 1, got ${merged.length}`);
      }

      if (!testCase.expectDuplicate && mergedIds.size !== 2) {
        failures += 1;
        originalLog(`FAIL [${testCase.name}] expected two separate records after merge attempt.`);
      }

      if (testCase.expectCanonicalId && canonicalId !== testCase.expectCanonicalId) {
        failures += 1;
        originalLog(`FAIL [${testCase.name}] expected canonical ${testCase.expectCanonicalId}, got ${canonicalId || 'none'}`);
      }

      if (testCase.expectConflictReasons) {
        const reasons = getDuplicateConflictReasons(testCase.left, testCase.right, detail);
        for (const expected of testCase.expectConflictReasons) {
          if (!reasons.includes(expected)) {
            failures += 1;
            originalLog(`FAIL [${testCase.name}] expected conflictReasons to include '${expected}', got [${reasons.join(', ')}]`);
          }
        }
      }
    }

    if (failures > 0) {
      originalLog(`\n❌ Dedup regression failed with ${failures} issue(s).`);
      process.exit(1);
    }

    originalLog(`✅ Dedup regression passed (${cases.length} cases).`);
  } finally {
    console.log = originalLog;
  }
}

function createConcert(overrides: Partial<Concert>): Concert {
  return {
    id: overrides.id || `concert-${Math.random().toString(36).slice(2)}`,
    title: overrides.title || 'Test Concert',
    image: overrides.image || '',
    date: overrides.date || formatEventDate(overrides.eventDate || '2026-01-01'),
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
    artistConfidence: overrides.artistConfidence ?? 0.9,
    artistSource: overrides.artistSource || 'rule',
    is_tribute: overrides.is_tribute || false,
    is_famous: overrides.is_famous ?? true,
    updatedAt: overrides.updatedAt || NOW,
    source: overrides.source || 'damai',
    sourceUrl: overrides.sourceUrl || '',
    eventDate: overrides.eventDate || '2026-01-01',
    eventTime: overrides.eventTime || '19:30',
    sortAt: overrides.sortAt || `${overrides.eventDate || '2026-01-01'}T19:30:00.000Z`,
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

function formatEventDate(value: string) {
  return value.replace(/-/g, '.');
}

main();
