import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'so_session';

export function middleware(req: NextRequest): NextResponse {
  const hasSession = req.cookies.has(SESSION_COOKIE);
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Guard everything except the login page, the session API, and static assets.
  matcher: ['/((?!login|api/session|_next/static|_next/image|favicon.ico).*)'],
};
