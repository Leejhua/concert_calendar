import { NextRequest, NextResponse } from 'next/server';
import { getProjectById, updateProject } from '@/lib/db';
import { ProjectStage, ProjectStatus, ProjectPriority } from '@/lib/types';

const VALID_STAGES: ProjectStage[] = ['planning', 'outreach', 'quoted', 'confirmed', 'execution', 'review'];
const VALID_STATUSES: ProjectStatus[] = ['active', 'on_hold', 'completed', 'cancelled'];
const VALID_PRIORITIES: ProjectPriority[] = ['low', 'normal', 'high'];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await getProjectById(id);

    if (!project) {
      return NextResponse.json({ success: false, message: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: project });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (body.stage && !VALID_STAGES.includes(body.stage)) {
      return NextResponse.json({ success: false, message: 'Invalid stage' }, { status: 400 });
    }
    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ success: false, message: 'Invalid status' }, { status: 400 });
    }
    if (body.priority && !VALID_PRIORITIES.includes(body.priority)) {
      return NextResponse.json({ success: false, message: 'Invalid priority' }, { status: 400 });
    }

    const project = await updateProject(id, {
      stage: body.stage,
      owner: body.owner,
      priority: body.priority,
      status: body.status,
      notes: body.notes,
      quoteAmount: body.quoteAmount,
      quoteStatus: body.quoteStatus,
      nextFollowUpAt: body.nextFollowUpAt,
    });

    if (!project) {
      return NextResponse.json({ success: false, message: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: project });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
