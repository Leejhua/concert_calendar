import { NextRequest, NextResponse } from 'next/server';
import { createFollowUp, getOverdueFollowUps } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.projectId || typeof body.projectId !== 'string') {
      return NextResponse.json({ success: false, message: 'projectId is required' }, { status: 400 });
    }
    if (!body.content || typeof body.content !== 'string' || !body.content.trim()) {
      return NextResponse.json({ success: false, message: 'content is required' }, { status: 400 });
    }

    const followUp = await createFollowUp({
      projectId: body.projectId,
      content: body.content.trim(),
      followUpDate: body.followUpDate || null,
    });

    return NextResponse.json({ success: true, data: followUp }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const overdueOnly = searchParams.get('overdue') === 'true';

    if (overdueOnly) {
      const followUps = await getOverdueFollowUps();
      return NextResponse.json({ success: true, data: followUps });
    }

    return NextResponse.json({ success: true, data: [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
