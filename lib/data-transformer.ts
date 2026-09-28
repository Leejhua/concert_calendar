import { addMinutes, isValid } from 'date-fns';
import { Concert } from '@/lib/damai-crawler';
import { getConcertDisplayTitle } from '@/lib/concert-identity';
import { getConcertStartDate } from '@/lib/concert-utils';
import { CalendarEvent } from '@/lib/types';

export function transformConcertsToEvents(concerts: Concert[]): CalendarEvent[] {
  const events = concerts.map((concert): CalendarEvent | null => {
    const startDate = getConcertStartDate(concert);

    if (!startDate || !isValid(startDate)) {
      console.warn(`[DataTransformer] Failed to parse date: "${concert.date}" (ID: ${concert.id}).`);
      return null;
    }

      return {
        id: concert.id,
        title: getConcertDisplayTitle(concert),
        start: startDate,
        end: addMinutes(startDate, 180),
      allDay: false,
      kind: 'concert',
      resource: concert,
    } satisfies CalendarEvent;
  });

  return events.filter((event): event is CalendarEvent => event !== null);
}
