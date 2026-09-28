import { NextRequest, NextResponse } from 'next/server';
import { Concert } from '@/lib/damai-crawler';
import { getConcertSearchArtists } from '@/lib/concert-identity';
import { normalizeCityName, normalizeVenueName } from '@/lib/location-normalization';
import { getAllConcertsFromStorage, getConcertsByMonth } from '@/lib/db';
import { isUpcomingConcert } from '@/lib/concert-utils';
import { OpportunityStatus } from '@/lib/types';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);
  const city = searchParams.get('city');
  const search = searchParams.get('search');
  const month = searchParams.get('month');
  const status = searchParams.get('status') as OpportunityStatus | null;
  const upcomingOnly = searchParams.get('upcomingOnly') === 'true';
  const hasProject = searchParams.get('hasProject');
  const sort = searchParams.get('sort') || 'date';

  try {
    let concerts: Concert[] = month
      ? await getConcertsByMonth(month)
      : await getAllConcertsFromStorage();

    if (city) {
      const normalizedCity = normalizeCityName(city);
      concerts = concerts.filter((concert) => normalizeCityName(concert.city).includes(normalizedCity));
    }

    if (search) {
      const keyword = search.toLowerCase();
      const normalizedVenueKeyword = normalizeVenueName(search);
      const normalizedCityKeyword = normalizeCityName(search).toLowerCase();
      concerts = concerts.filter((concert) =>
        concert.title.toLowerCase().includes(keyword) ||
        normalizeVenueName(concert.venue).includes(normalizedVenueKeyword) ||
        normalizeCityName(concert.city).toLowerCase().includes(normalizedCityKeyword) ||
        getConcertSearchArtists(concert).some((artist) => artist.toLowerCase().includes(keyword))
      );
    }

    if (status) {
      concerts = concerts.filter((concert) => concert.opportunityStatus === status);
    }

    if (upcomingOnly) {
      concerts = concerts.filter((concert) => isUpcomingConcert(concert));
    }

    if (hasProject === 'true') {
      concerts = concerts.filter((concert) => Boolean(concert.projectId));
    }

    if (hasProject === 'false') {
      concerts = concerts.filter((concert) => !concert.projectId);
    }

    concerts = sortConcerts(concerts, sort);

    const total = concerts.length;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedConcerts = concerts.slice(startIndex, endIndex);

    return NextResponse.json({
      success: true,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      data: paginatedConcerts,
    });
  } catch (error) {
    console.error('Error reading local data:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function sortConcerts(concerts: Concert[], sort: string) {
  const items = [...concerts];

  switch (sort) {
    case 'score':
      return items.sort((a, b) => {
        const scoreDiff = (b.opportunityScore || 0) - (a.opportunityScore || 0);
        if (scoreDiff !== 0) return scoreDiff;
        return compareSortAt(a, b);
      });
    case 'updated':
      return items.sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0));
    default:
      return items.sort(compareSortAt);
  }
}

function compareSortAt(a: Concert, b: Concert) {
  const left = a.sortAt ? new Date(a.sortAt).getTime() : Number.MAX_SAFE_INTEGER;
  const right = b.sortAt ? new Date(b.sortAt).getTime() : Number.MAX_SAFE_INTEGER;
  if (left !== right) return left - right;
  return a.date.localeCompare(b.date);
}
