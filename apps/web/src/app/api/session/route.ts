import { NextResponse } from 'next/server';
import { login } from '@/lib/api.js';
import { setSessionCookie, clearSessionCookie } from '@/lib/session.js';
import { ApiError } from '@/lib/http.js';

export async function POST(req: Request): Promise<NextResponse> {
  const { orgSlug, email, password } = (await req.json()) as {
    orgSlug?: string;
    email?: string;
    password?: string;
  };
  if (!orgSlug || !email || !password) {
    return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
  }
  try {
    const accessToken = await login({ orgSlug, email, password });
    await setSessionCookie(accessToken);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 400)) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    throw err;
  }
}

export async function DELETE(): Promise<NextResponse> {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
