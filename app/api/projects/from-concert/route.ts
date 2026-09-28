import { NextRequest, NextResponse } from 'next/server';
import { createProjectFromConcert } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const concertId = typeof body.concertId === 'string' ? body.concertId : '';

    if (!concertId) {
      return NextResponse.json({ success: false, message: 'concertId is required' }, { status: 400 });
    }

    const result = await createProjectFromConcert(concertId);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message === 'Concert not found' ? 404 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
