const RAW_CITY_ALIAS_MAP: Record<string, string> = {
  '上海市': '上海',
  'shanghai': '上海',
  '北京市': '北京',
  'beijing': '北京',
  '广州市': '广州',
  'guangzhou': '广州',
  '深圳市': '深圳',
  'shenzhen': '深圳',
  '杭州市': '杭州',
  'hangzhou': '杭州',
  '南京市': '南京',
  'nanjing': '南京',
  '成都市': '成都',
  'chengdu': '成都',
  '武汉市': '武汉',
  'wuhan': '武汉',
  '重庆市': '重庆',
  'chongqing': '重庆',
  '天津市': '天津',
  'tianjin': '天津',
  '西安市': '西安',
  'xian': '西安',
  "xi'an": '西安',
  '苏州市': '苏州',
  'suzhou': '苏州',
  '长沙市': '长沙',
  'changsha': '长沙',
  '宁波市': '宁波',
  'ningbo': '宁波',
  '佛山市': '佛山',
  'foshan': '佛山',
  '东莞市': '东莞',
  'dongguan': '东莞',
  '珠海市': '珠海',
  'zhuhai': '珠海',
  '中国香港': '香港',
  '香港特别行政区': '香港',
  'hong kong': '香港',
  'hong kong china': '香港',
  'hong kong, china': '香港',
  'hk': '香港',
  '中国澳门': '澳门',
  '澳门特别行政区': '澳门',
  'macao': '澳门',
  'macau': '澳门',
  'macao china': '澳门',
  'macau china': '澳门',
  'macao, china': '澳门',
  'macau, china': '澳门',
  '台北市': '台北',
  '中国台湾台北': '台北',
  '台湾台北': '台北',
  'taipei': '台北',
  'taipei city': '台北',
  '高雄市': '高雄',
  'kaohsiung': '高雄',
  '新北市': '新北',
  'new taipei': '新北',
  '首尔特别市': '首尔',
  'seoul': '首尔',
  '东京市': '东京',
  'tokyo': '东京',
  '新加坡共和国': '新加坡',
  'singapore': '新加坡',
  '胡志明市': '胡志明',
  'ho chi minh': '胡志明',
  '吉隆坡市': '吉隆坡',
  'kuala lumpur': '吉隆坡',
};

const RAW_VENUE_ALIAS_MAP: Record<string, string> = {
  '梅赛德斯奔驰文化中心': '梅赛德斯-奔驰文化中心',
  '梅赛德斯-奔驰文化中心': '梅赛德斯-奔驰文化中心',
  '上海梅赛德斯奔驰文化中心': '梅赛德斯-奔驰文化中心',
  '上海梅赛德斯-奔驰文化中心': '梅赛德斯-奔驰文化中心',
  '梅奔': '梅赛德斯-奔驰文化中心',
  '梅奔文化中心': '梅赛德斯-奔驰文化中心',
  '国家体育场鸟巢': '国家体育场',
  '国家体育场（鸟巢）': '国家体育场',
  '国家体育场(鸟巢)': '国家体育场',
  '鸟巢': '国家体育场',
  '凯迪拉克中心': '华熙LIVE·五棵松',
  '五棵松': '华熙LIVE·五棵松',
  '五棵松体育馆': '华熙LIVE·五棵松',
  '华熙live五棵松': '华熙LIVE·五棵松',
  '华熙LIVE五棵松': '华熙LIVE·五棵松',
  '华熙LIVE·五棵松': '华熙LIVE·五棵松',
  '深圳湾体育中心': '深圳湾体育馆',
  '深圳湾体育中心体育馆': '深圳湾体育馆',
  '深圳湾体育馆': '深圳湾体育馆',
  '广州宝能观致文化中心': '宝能国际体育演艺中心',
  '宝能观致文化中心': '宝能国际体育演艺中心',
  '宝能国际体育演艺中心': '宝能国际体育演艺中心',
  '广州体育馆': '广州体育馆',
  '上海东方体育中心': '东方体育中心',
  '东方体育中心': '东方体育中心',
  '杭州奥体中心体育馆': '杭州奥体中心体育馆',
  '杭州奥体体育馆': '杭州奥体中心体育馆',
  '大莲花': '杭州奥体中心体育场',
  '杭州奥体中心体育场': '杭州奥体中心体育场',
  '亚洲国际博览馆': '香港亚洲国际博览馆',
  '香港亚洲国际博览馆': '香港亚洲国际博览馆',
  'asiaworld-expo': '香港亚洲国际博览馆',
  'asia world expo': '香港亚洲国际博览馆',
  '澳门威尼斯人金光综艺馆': '澳门威尼斯人金光综艺馆',
  '威尼斯人金光综艺馆': '澳门威尼斯人金光综艺馆',
  'cotai arena': '澳门威尼斯人金光综艺馆',
  '台北小巨蛋': '台北小巨蛋',
  'taipei arena': '台北小巨蛋',
  // 新加坡滨海艺术中心（Esplanade – Theatres on the Bay）的星和（StarHub）赞助命名与正式命名指同一物理场馆，合并到 canonical。
  // 依据：裁决报告 #30（PRYVT vs MIDNIGHT TIL MORNING）两侧场馆为同一 Esplanade 的不同命名；DB 中各出现 1 次。
  '星和滨海艺术中心剧院': '新加坡滨海艺术中心剧院',
  // —— 以下为裁决报告中明确"保持独立"的场馆对，记录于此供后续维护参考，不合并别名 ——
  // 澳门银河综艺馆（Galaxy Auditorium，主馆）与 澳门银河-G Box（同建筑群 Galaxy Macau 的不同厅）为不同演出空间，保持独立；
  // "银河-G Box" 与 "银河G Box" 仅连字符差异，已由 compactVenueKey 的去连字符逻辑自然归一，无需别名。
  // 伦敦人剧场 与 伦敦人综艺馆 同属 The Londoner Macao 建筑群的不同场馆，保持独立（裁决报告 #14）。
  // 亚洲国际博览馆 各馆号（10/11/5/3/1 号馆、Summit）为同一场馆不同馆号，保持独立；与主馆"亚洲国际博览馆"不合并。
  // 奥林匹克手球体育馆 与 奥林匹克体育馆 为首尔奥林匹克公园内不同物理场馆，保持独立（裁决报告 #32）。
};

const CITY_ALIAS_MAP = buildAliasMap(RAW_CITY_ALIAS_MAP, compactCityAliasKey);
const VENUE_ALIAS_MAP = buildAliasMap(RAW_VENUE_ALIAS_MAP, compactVenueKey);

export function normalizeCityName(value?: string | null) {
  if (!value) return '';
  const trimmed = value.trim();
  const aliasKey = compactCityAliasKey(trimmed);
  if (CITY_ALIAS_MAP[aliasKey]) return CITY_ALIAS_MAP[aliasKey];

  const normalized = trimmed
    .replace(/^中国/, '')
    .replace(/特别行政区$/, '')
    .replace(/自治州$/, '')
    .replace(/自治区$/, '')
    .replace(/省$/, '')
    .replace(/市$/, '')
    .trim();

  return CITY_ALIAS_MAP[compactCityAliasKey(normalized)] || normalized;
}

export function normalizeVenueName(value?: string | null) {
  if (!value) return '';
  const trimmed = value.trim();
  const aliased = VENUE_ALIAS_MAP[compactVenueKey(trimmed)] || trimmed;

  return compactVenueKey(aliased);
}

export function isNormalizedCityMatch(left?: string | null, right?: string | null) {
  const a = normalizeCityName(left);
  const b = normalizeCityName(right);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export function isNormalizedVenueMatch(left?: string | null, right?: string | null) {
  const a = normalizeVenueName(left);
  const b = normalizeVenueName(right);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function buildAliasMap(rawMap: Record<string, string>, keyBuilder: (value: string) => string) {
  const map: Record<string, string> = {};

  for (const [alias, canonical] of Object.entries(rawMap)) {
    map[keyBuilder(alias)] = canonical;
  }

  return map;
}

function compactCityAliasKey(value: string) {
  return value
    .trim()
    .replace(/[，,]/g, '')
    .replace(/['’]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function compactVenueKey(value: string) {
  return value
    .trim()
    .replace(/[（）()]/g, '')
    .replace(/[·•]/g, '')
    .replace(/\bLIVE\b/gi, 'live')
    .replace(/\bArena\b/gi, 'arena')
    .replace(/\bStadium\b/gi, 'stadium')
    .replace(/\bCenter\b/gi, 'center')
    .replace(/\bTheatre\b/gi, 'theatre')
    .replace(/\bTheater\b/gi, 'theatre')
    .replace(/\bGymnasium\b/gi, 'gymnasium')
    .replace(/\bSports Center\b/gi, 'sportscenter')
    .replace(/体育中心体育馆/g, '体育馆')
    .replace(/国际演艺中心/g, '演艺中心')
    .replace(/文化艺术中心/g, '文化中心')
    .replace(/[-－—_\s]/g, '')
    .toLowerCase();
}
