import { NextRequest, NextResponse } from 'next/server';
import { getContacts, createContact } from '@/lib/db';

export async function GET() {
  try {
    const contacts = await getContacts();
    return NextResponse.json({ success: true, data: contacts });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ success: false, message: 'name is required' }, { status: 400 });
    }

    const contact = await createContact({
      name: body.name.trim(),
      role: body.role,
      phone: body.phone,
      email: body.email,
      wechat: body.wechat,
      company: body.company,
      notes: body.notes,
    });

    return NextResponse.json({ success: true, data: contact }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
