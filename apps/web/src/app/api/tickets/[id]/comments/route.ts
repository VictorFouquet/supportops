import { NextResponse } from 'next/server';
import { addComment } from '@/lib/api.js';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const input = (await req.json()) as { body: string; isInternal?: boolean };
  const comment = await addComment(id, input);
  return NextResponse.json(comment, { status: 201 });
}
