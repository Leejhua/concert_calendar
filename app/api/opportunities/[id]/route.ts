import { NextRequest, NextResponse } from 'next/server';
import { getConcertById, updateConcertOpportunity } from '@/lib/db';
import { OpportunityStatus } from '@/lib/types';

const VALID_STATUSES: OpportunityStatus[] = ['new', 'watching', 'qualified', 'ignored', 'converted'];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const opportunityStatus = body.opportunityStatus as OpportunityStatus | undefined;
    const notes = typeof body.notes === 'string' ? body.notes : undefined;

    if (opportunityStatus && !VALID_STATUSES.includes(opportunityStatus)) {
      return NextResponse.json({ success: false, message: 'Invalid opportunity status' }, { status: 400 });
    }

    const existing = await getConcertById(id);
    if (!existing) {
      return NextResponse.json({ success: false, message: 'Opportunity not found' }, { status: 404 });
    }

    const updated = await updateConcertOpportunity(id, {
      opportunityStatus,
      notes,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
