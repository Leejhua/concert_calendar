import { isNormalizedCityMatch, isNormalizedVenueMatch, normalizeCityName, normalizeVenueName } from '../lib/location-normalization';

type NormalizationCase = {
  name: string;
  input: string;
  expected: string;
};

type MatchCase = {
  name: string;
  left: string;
  right: string;
  expected: boolean;
};

const cityNormalizationCases: NormalizationCase[] = [
  { name: 'Guangzhou city suffix', input: '广州市', expected: '广州' },
  { name: 'Hong Kong full Chinese region name', input: '中国香港', expected: '香港' },
  { name: 'Hong Kong SAR', input: '香港特别行政区', expected: '香港' },
  { name: 'Hong Kong English with China suffix', input: 'Hong Kong, China', expected: '香港' },
  { name: 'Macao English spelling', input: 'Macao', expected: '澳门' },
  { name: 'Macau English alternate spelling', input: 'Macau, China', expected: '澳门' },
  { name: 'Taipei Chinese city suffix', input: '台北市', expected: '台北' },
  { name: 'Taipei English', input: 'Taipei City', expected: '台北' },
  { name: "Xi'an apostrophe variant", input: "Xi'an", expected: '西安' },
  { name: 'Singapore English', input: 'Singapore', expected: '新加坡' },
];

const venueNormalizationCases: NormalizationCase[] = [
  { name: 'Mercedes-Benz short name', input: '梅奔', expected: normalizeVenueName('梅赛德斯-奔驰文化中心') },
  { name: 'Mercedes-Benz no dash', input: '上海梅赛德斯奔驰文化中心', expected: normalizeVenueName('梅赛德斯-奔驰文化中心') },
  { name: 'Bird nest nickname', input: '鸟巢', expected: normalizeVenueName('国家体育场') },
  { name: 'Bird nest bracket form', input: '国家体育场（鸟巢）', expected: normalizeVenueName('国家体育场') },
  { name: 'Wukesong old sponsor name', input: '凯迪拉克中心', expected: normalizeVenueName('华熙LIVE·五棵松') },
  { name: 'Wukesong short name', input: '五棵松体育馆', expected: normalizeVenueName('华熙LIVE·五棵松') },
  { name: 'Shenzhen Bay full sports center name', input: '深圳湾体育中心体育馆', expected: normalizeVenueName('深圳湾体育馆') },
  { name: 'Hong Kong AsiaWorld Expo English', input: 'AsiaWorld-Expo', expected: normalizeVenueName('香港亚洲国际博览馆') },
  { name: 'Macao Cotai Arena English', input: 'Cotai Arena', expected: normalizeVenueName('澳门威尼斯人金光综艺馆') },
  { name: 'Taipei Arena English', input: 'Taipei Arena', expected: normalizeVenueName('台北小巨蛋') },
];

const cityMatchCases: MatchCase[] = [
  { name: 'Hong Kong Chinese and English should match', left: '中国香港', right: 'Hong Kong, China', expected: true },
  { name: 'Macao Chinese and English should match', left: '中国澳门', right: 'Macau', expected: true },
  { name: 'Taipei Chinese and English should match', left: '台北市', right: 'Taipei City', expected: true },
  { name: 'Different cities should not match', left: '广州', right: '深圳', expected: false },
];

const venueMatchCases: MatchCase[] = [
  { name: 'Mercedes-Benz aliases should match', left: '梅奔文化中心', right: '梅赛德斯-奔驰文化中心', expected: true },
  { name: 'Bird nest aliases should match', left: '鸟巢', right: '国家体育场', expected: true },
  { name: 'Wukesong aliases should match', left: '凯迪拉克中心', right: '华熙LIVE·五棵松', expected: true },
  { name: 'Shenzhen Bay aliases should match', left: '深圳湾体育中心体育馆', right: '深圳湾体育馆', expected: true },
  { name: 'Different venues should not match', left: '国家体育场', right: '台北小巨蛋', expected: false },
];

function main() {
  let failures = 0;

  failures += assertNormalizationCases('city', cityNormalizationCases, normalizeCityName);
  failures += assertNormalizationCases('venue', venueNormalizationCases, normalizeVenueName);
  failures += assertMatchCases('city match', cityMatchCases, isNormalizedCityMatch);
  failures += assertMatchCases('venue match', venueMatchCases, isNormalizedVenueMatch);

  if (failures > 0) {
    console.error(`\nLocation normalization regression failed with ${failures} issue(s).`);
    process.exit(1);
  }

  console.log(`Location normalization regression passed (${cityNormalizationCases.length + venueNormalizationCases.length + cityMatchCases.length + venueMatchCases.length} cases).`);
}

function assertNormalizationCases(
  group: string,
  cases: NormalizationCase[],
  normalize: (value: string) => string,
) {
  let failures = 0;

  for (const testCase of cases) {
    const actual = normalize(testCase.input);
    if (actual !== testCase.expected) {
      failures += 1;
      console.error(`FAIL [${group}: ${testCase.name}] expected "${testCase.expected}", got "${actual}"`);
    }
  }

  return failures;
}

function assertMatchCases(
  group: string,
  cases: MatchCase[],
  match: (left: string, right: string) => boolean,
) {
  let failures = 0;

  for (const testCase of cases) {
    const actual = match(testCase.left, testCase.right);
    if (actual !== testCase.expected) {
      failures += 1;
      console.error(`FAIL [${group}: ${testCase.name}] expected ${testCase.expected}, got ${actual}`);
    }
  }

  return failures;
}

main();
