import { NextResponse } from 'next/server';
import { assignTicket } from '@/lib/api.js';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const patch = (await req.json()) as { assigneeId?: string | null; teamId?: string | null };
  const ticket = await assignTicket(id, patch);
  return NextResponse.json(ticket);
}
