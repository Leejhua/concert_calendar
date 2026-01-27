import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// --- Type Definitions ---
export interface Concert {
  id: string;
  title: string;
  image: string;
  date: string;
  city: string;
  venue: string;
  price: string;
  status: string;
  category?: string;
  artist?: string;
  updatedAt?: number;
}

const DATA_FILE = path.join(process.cwd(), 'data', 'concerts.json');

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);
  const city = searchParams.get('city'); // City name (e.g. "北京")
  const search = searchParams.get('search'); // Search keyword
  
  try {
    // 1. Read Data from Local JSON
    if (!fs.existsSync(DATA_FILE)) {
      return NextResponse.json({
        success: true,
        total: 0,
        page,
        data: [],
        message: "No local data found. Please run data sync script."
      });
    }

    const fileContent = fs.readFileSync(DATA_FILE, 'utf-8');
    let concerts: Concert[] = JSON.parse(fileContent);

    // 2. Filter Data
    if (city) {
      concerts = concerts.filter(c => c.city.includes(city));
    }

    if (search) {
      const lowerSearch = search.toLowerCase();
      concerts = concerts.filter(c => 
        c.title.toLowerCase().includes(lowerSearch) || 
        c.venue.toLowerCase().includes(lowerSearch) ||
        c.city.toLowerCase().includes(lowerSearch) ||
        (c.artist && c.artist.toLowerCase().includes(lowerSearch))
      );
    }

    // 3. Sort Data (Default by Date Ascending)
    // Date format usually "2026.03.13 周五 19:30"
    concerts.sort((a, b) => {
      const dateA = a.date.split(' ')[0] || '9999.99.99';
      const dateB = b.date.split(' ')[0] || '9999.99.99';
      return dateA.localeCompare(dateB);
    });

    // 4. Pagination
    const total = concerts.length;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedConcerts = concerts.slice(startIndex, endIndex);

    return NextResponse.json({
      success: true,
      total: total,
      page: page,
      pageSize: pageSize,
      totalPages: Math.ceil(total / pageSize),
      data: paginatedConcerts
    });

  } catch (error: any) {
    console.error('Error reading local data:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
