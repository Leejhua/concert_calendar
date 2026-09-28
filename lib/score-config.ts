/**
 * City tier configuration for opportunity scoring.
 *
 * Tiers are ordered from highest commercial potential (tier 1) to emerging
 * second-tier cities (tier 3). City matching uses substring inclusion against
 * the normalized city name (see {@link normalizeCityName}).
 *
 * Tier 1 — top-tier / international hub cities.
 * Tier 2 — strong first-tier / new first-tier cities.
 * Tier 3 — second-tier cities covering high-frequency cities observed in the
 *           concert database plus typical second-tier cities not in tier 1/2.
 */
export const CITY_TIERS = {
  tier1: [
    '北京',
    '上海',
    '广州',
    '深圳',
    '香港',
    '澳门',
    '台北',
    '新加坡',
    '首尔',
    '东京',
  ],
  tier2: [
    '杭州',
    '成都',
    '重庆',
    '南京',
    '武汉',
    '西安',
    '苏州',
    '长沙',
    '天津',
    '宁波',
  ],
  tier3: [
    '佛山',
    '东莞',
    '珠海',
    '青岛',
    '沈阳',
    '大连',
    '济南',
    '郑州',
    '合肥',
    '昆明',
    '南宁',
    '福州',
    '厦门',
    '无锡',
    '常州',
    '温州',
    '太原',
    '贵阳',
    '哈尔滨',
    '泉州',
    '南昌',
    '绍兴',
    '呼和浩特',
    '曼谷',
    '吉隆坡',
    '茂名',
    '绵阳',
    '台州',
    '扬州',
    '南通',
    '嘉兴',
    '榆林',
    '大同',
    '赣州',
    '上饶',
    '景德镇',
    '莆田',
    '亳州',
    '衡阳',
    '安顺',
    '阜阳',
    '阳江',
    '高阳',
    '吉林',
  ],
  tier1Bonus: 8,
  tier2Bonus: 4,
  tier3Bonus: 2,
} as const;