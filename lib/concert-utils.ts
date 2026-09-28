import { format, isValid, startOfDay } from 'date-fns';
import { Concert } from '@/lib/damai-crawler';
import { scoreConcertOpportunity } from '@/lib/opportunity-score';
import { ConcertSource, OpportunityStatus } from '@/lib/types';

const DEFAULT_HOUR = 19;
const DEFAULT_MINUTE = 30;

export interface ConcertMetadata {
  source: ConcertSource;
  sourceUrl: string;
  eventDate: string | null;
  eventTime: string | null;
  sortAt: string | null;
  opportunityStatus: OpportunityStatus;
  opportunityScore: number;
  opportunityScoreBreakdown: Concert['opportunityScoreBreakdown'];
  lastSeenAt: number;
}

export function inferConcertSource(concertId: string): ConcertSource {
  if (concertId.startsWith('mtglobal_')) return 'moretickets-global';
  if (concertId.startsWith('mt_')) return 'moretickets';
  return 'damai';
}

export function parseConcertDateString(rawDate: string) {
  const dateMatch = rawDate.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  const timeMatch = rawDate.match(/(\d{1,2}:\d{2})/);

  if (!dateMatch) {
    return {
      eventDate: null,
      eventTime: timeMatch ? normalizeTimeString(timeMatch[1]) : null,
      startAt: null,
    };
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]) - 1;
  const day = Number(dateMatch[3]);
  const startAt = new Date(year, month, day);

  const normalizedTime = timeMatch ? normalizeTimeString(timeMatch[1]) : null;
  if (normalizedTime) {
    const [hours, minutes] = normalizedTime.split(':').map(Number);
    startAt.setHours(hours, minutes, 0, 0);
  } else {
    startAt.setHours(DEFAULT_HOUR, DEFAULT_MINUTE, 0, 0);
  }

  if (!isValid(startAt)) {
    return {
      eventDate: null,
      eventTime: normalizedTime,
      startAt: null,
    };
  }

  return {
    eventDate: format(startAt, 'yyyy-MM-dd'),
    eventTime: normalizedTime,
    startAt,
  };
}

export function getConcertStartDate(concert: Pick<Concert, 'date' | 'eventDate' | 'eventTime'>): Date | null {
  if (concert.eventDate) {
    const startAt = new Date(`${concert.eventDate}T${concert.eventTime || `${String(DEFAULT_HOUR).padStart(2, '0')}:${String(DEFAULT_MINUTE).padStart(2, '0')}`}:00`);
    if (isValid(startAt)) {
      return startAt;
    }
  }

  return parseConcertDateString(concert.date).startAt;
}

export function buildConcertMetadata(concert: Concert, now = Date.now()): ConcertMetadata {
  const { eventDate, eventTime, startAt } = parseConcertDateString(concert.date);
  const source = concert.source || inferConcertSource(concert.id);
  const normalizedStartAt = startAt || getConcertStartDate(concert);
  const scoreResult = scoreConcertOpportunity(concert, normalizedStartAt, new Date(now));

  return {
    source,
    sourceUrl: concert.sourceUrl || '',
    eventDate: concert.eventDate || eventDate,
    eventTime: concert.eventTime || eventTime,
    sortAt: concert.sortAt || (normalizedStartAt ? normalizedStartAt.toISOString() : null),
    opportunityStatus: concert.opportunityStatus || getDefaultOpportunityStatus(normalizedStartAt),
    opportunityScore: scoreResult.score,
    opportunityScoreBreakdown: scoreResult.rules,
    lastSeenAt: concert.lastSeenAt || concert.updatedAt || now,
  };
}

export function isUpcomingConcert(concert: Pick<Concert, 'date' | 'eventDate' | 'eventTime'>, now = new Date()) {
  const startAt = getConcertStartDate(concert);
  if (!startAt) return false;
  return startOfDay(startAt) >= startOfDay(now);
}

function getDefaultOpportunityStatus(startAt: Date | null): OpportunityStatus {
  if (!startAt) return 'new';
  return startOfDay(startAt) < startOfDay(new Date()) ? 'ignored' : 'new';
}

function normalizeTimeString(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
