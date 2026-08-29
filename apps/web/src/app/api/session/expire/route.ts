import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/session.js';

/**
 * Clears a stale session cookie and sends the viewer to /login. `cookies()` can't be mutated
 * from a Server Component render, so pages that catch a 401 redirect here instead of clearing
 * the cookie themselves.
 */
export async function GET(req: Request): Promise<NextResponse> {
  await clearSessionCookie();
  return NextResponse.redirect(new URL('/login', req.url));
}
