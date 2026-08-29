'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button.js';
import { Field } from '@/components/ui/field.js';

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        orgSlug: form.get('orgSlug'),
        email: form.get('email'),
        password: form.get('password'),
      }),
    });
    setPending(false);
    if (res.ok) {
      router.push('/tickets');
      router.refresh();
      return;
    }
    setError('Invalid credentials');
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field
        id="orgSlug"
        name="orgSlug"
        label="Organization"
        autoComplete="organization"
        required
      />
      <Field id="email" name="email" type="email" label="Email" autoComplete="username" required />
      <Field
        id="password"
        name="password"
        type="password"
        label="Password"
        autoComplete="current-password"
        required
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
