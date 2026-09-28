import { NextRequest, NextResponse } from 'next/server';
import { getProjects } from '@/lib/db';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get('status');

  try {
    let projects = await getProjects();

    if (status) {
      projects = projects.filter((project) => project.status === status);
    }

    return NextResponse.json({ success: true, data: projects, total: projects.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
