import type { ReactNode } from 'react';
import { getMe } from '@/lib/api.js';
import { AppHeader } from '@/components/app-header.js';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const me = await getMe();
  return (
    <div>
      <AppHeader user={me} />
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
