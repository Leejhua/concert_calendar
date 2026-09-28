import { NextRequest, NextResponse } from 'next/server';
import { updateProjectTask } from '@/lib/db';
import { ProjectTaskStatus } from '@/lib/types';

const VALID_TASK_STATUSES: ProjectTaskStatus[] = ['todo', 'in_progress', 'done', 'skipped'];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await params;
    const body = await request.json();
    const taskId = typeof body.taskId === 'string' ? body.taskId : '';
    const status = body.status as ProjectTaskStatus | undefined;
    const dueDate = body.dueDate === null || typeof body.dueDate === 'string' ? body.dueDate : undefined;
    const notes = typeof body.notes === 'string' ? body.notes : undefined;

    if (!taskId) {
      return NextResponse.json({ success: false, message: 'taskId is required' }, { status: 400 });
    }

    if (status && !VALID_TASK_STATUSES.includes(status)) {
      return NextResponse.json({ success: false, message: 'Invalid task status' }, { status: 400 });
    }

    const task = await updateProjectTask(taskId, { status, dueDate, notes });

    if (!task) {
      return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: task });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
