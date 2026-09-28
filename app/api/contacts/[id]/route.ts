import { NextRequest, NextResponse } from 'next/server';
import { updateContact, deleteContact } from '@/lib/db';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const contact = await updateContact(id, body);

    if (!contact) {
      return NextResponse.json({ success: false, message: 'Contact not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: contact });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deleted = await deleteContact(id);

    if (!deleted) {
      return NextResponse.json({ success: false, message: 'Contact not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
