import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getMe } from '@/lib/api.js';
import { ApiError } from '@/lib/http.js';
import { AppHeader } from '@/components/app-header.js';

export default async function AppLayout({ children }: { children: ReactNode }) {
  let me;
  try {
    me = await getMe();
  } catch (err) {
    // The JWT can expire while the (non-expiring) session cookie is still present; send the
    // viewer through the expiry route so the stale cookie is cleared before they hit /login.
    if (err instanceof ApiError && err.status === 401) redirect('/api/session/expire');
    throw err;
  }
  return (
    <div>
      <AppHeader user={me} />
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
