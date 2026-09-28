import { differenceInCalendarDays, startOfDay } from 'date-fns';
import type { Concert } from '@/lib/damai-crawler';
import { getConcertSearchArtists, normalizeConcertRecord } from '@/lib/concert-identity';
import { normalizeCityName } from '@/lib/location-normalization';
import { CITY_TIERS } from '@/lib/score-config';

export interface OpportunityScoreRule {
  key: string;
  label: string;
  delta: number;
  matched: boolean;
}

export interface OpportunityScoreResult {
  score: number;
  rules: OpportunityScoreRule[];
}

const BASE_SCORE = 50;

const LARGE_VENUE_KEYWORDS = ['体育场', 'stadium', 'arena', '中心', '馆', '场'];
const PREMIUM_STATUS_KEYWORDS = ['销售中', '预售', '开售', 'on sale'];

export const opportunityScoreConfig = {
  artistPresence: 10,
  artistConfidenceHigh: 5,
  artistLineupStrong: 6,
  artistMissingPenalty: -8,
  venueKnown: 5,
  venueLarge: 6,
  priceKnown: 4,
  pricePremium: 6,
  statusSelling: 4,
  dateNear14Days: 15,
  dateNear60Days: 10,
  dateNear120Days: 5,
  datePastPenalty0to30: -10,
  datePastPenalty31to90: -20,
  datePastPenalty90plus: -30,
  missingDatePenalty: -8,
} as const;

export function scoreConcertOpportunity(concert: Concert, startAt: Date | null, now = new Date()): OpportunityScoreResult {
  const normalized = normalizeConcertRecord(concert);
  const artists = getConcertSearchArtists(normalized);
  const priceValue = parsePriceValue(normalized.price || '');
  const cityTier = getCityTier(normalizeCityName(normalized.city || ''));
  const venueLarge = isLargeVenue(normalized.venue || '');
  const statusSelling = isSellingStatus(normalized.status || '');
  const rules: OpportunityScoreRule[] = [];

  addRule(rules, 'artist_presence', '可识别艺人', artists.length > 0, opportunityScoreConfig.artistPresence);
  addRule(rules, 'artist_missing_penalty', '缺失艺人信息', artists.length === 0, opportunityScoreConfig.artistMissingPenalty);
  addRule(rules, 'artist_confidence_high', '艺人置信度高', (normalized.artistConfidence || 0) >= 0.8, opportunityScoreConfig.artistConfidenceHigh);
  addRule(rules, 'artist_lineup_strong', '阵容人数较多', artists.length >= 2, opportunityScoreConfig.artistLineupStrong);
  addRule(rules, 'city_tier_1', '高线城市', cityTier === 1, CITY_TIERS.tier1Bonus);
  addRule(rules, 'city_tier_2', '重点城市', cityTier === 2, CITY_TIERS.tier2Bonus);
  addRule(rules, 'city_tier_3', '二线城市', cityTier === 3, CITY_TIERS.tier3Bonus);
  addRule(rules, 'venue_known', '场馆信息完整', Boolean(normalized.venue), opportunityScoreConfig.venueKnown);
  addRule(rules, 'venue_large', '大场馆信号', venueLarge, opportunityScoreConfig.venueLarge);
  addRule(rules, 'price_known', '票价信息完整', priceValue !== null, opportunityScoreConfig.priceKnown);
  addRule(rules, 'price_premium', '高票价信号', priceValue !== null && priceValue >= 680, opportunityScoreConfig.pricePremium);
  addRule(rules, 'status_selling', '销售状态积极', statusSelling, opportunityScoreConfig.statusSelling);

  if (!startAt) {
    addRule(rules, 'missing_date', '缺少有效日期', true, opportunityScoreConfig.missingDatePenalty);
  } else {
    const diffDays = differenceInCalendarDays(startOfDay(startAt), startOfDay(now));
    addRule(rules, 'date_near_14_days', '近 14 天窗口', diffDays >= 0 && diffDays <= 14, opportunityScoreConfig.dateNear14Days);
    addRule(rules, 'date_near_60_days', '近 60 天窗口', diffDays > 14 && diffDays <= 60, opportunityScoreConfig.dateNear60Days);
    addRule(rules, 'date_near_120_days', '近 120 天窗口', diffDays > 60 && diffDays <= 120, opportunityScoreConfig.dateNear120Days);

    const pastDays = Math.abs(Math.min(diffDays, 0));
    addRule(rules, 'date_past_0_30', '已过期 0-30 天', diffDays < 0 && pastDays <= 30, opportunityScoreConfig.datePastPenalty0to30);
    addRule(rules, 'date_past_31_90', '已过期 31-90 天', diffDays < 0 && pastDays > 30 && pastDays <= 90, opportunityScoreConfig.datePastPenalty31to90);
    addRule(rules, 'date_past_90_plus', '已过期 90+ 天', diffDays < 0 && pastDays > 90, opportunityScoreConfig.datePastPenalty90plus);
  }

  const total = rules.reduce((sum, rule) => sum + (rule.matched ? rule.delta : 0), BASE_SCORE);
  return {
    score: clamp(total, 0, 100),
    rules,
  };
}

function addRule(rules: OpportunityScoreRule[], key: string, label: string, matched: boolean, delta: number) {
  rules.push({ key, label, matched, delta });
}

function parsePriceValue(price: string) {
  const matches = price.match(/\d+(?:\.\d+)?/g);
  if (!matches || matches.length === 0) return null;
  const values = matches.map(Number).filter((value) => !Number.isNaN(value));
  if (values.length === 0) return null;
  return Math.max(...values);
}

function getCityTier(city: string): number {
  if (!city) return 0;
  if (CITY_TIERS.tier1.some((item) => city.includes(item))) return 1;
  if (CITY_TIERS.tier2.some((item) => city.includes(item))) return 2;
  if (CITY_TIERS.tier3.some((item) => city.includes(item))) return 3;
  return 0;
}

function isLargeVenue(venue: string) {
  const normalized = venue.toLowerCase();
  return LARGE_VENUE_KEYWORDS.some((item) => normalized.includes(item));
}

function isSellingStatus(status: string) {
  const normalized = status.toLowerCase();
  return PREMIUM_STATUS_KEYWORDS.some((item) => normalized.includes(item));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}