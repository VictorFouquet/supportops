import { NextResponse } from 'next/server';
import { setStatus } from '@/lib/api.js';
import type { TicketStatus } from '@/lib/api-types.js';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const { status } = (await req.json()) as { status: TicketStatus };
  const ticket = await setStatus(id, status);
  return NextResponse.json(ticket);
}
