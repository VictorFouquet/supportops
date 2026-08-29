import Link from 'next/link';
import type { Me } from '@/lib/api-types.js';
import { LogoutButton } from './logout-button.js';

export function AppHeader({ user }: { user: Me }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <nav className="flex items-center gap-6">
          <span className="font-semibold">SupportOps</span>
          <Link href="/tickets" className="text-sm text-slate-600 hover:text-slate-900">
            Tickets
          </Link>
        </nav>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-700">{user.name}</span>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
