'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button.js';
import { mutate } from '@/lib/mutate.js';

export function CommentForm({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) return;
    setError(null);
    setPending(true);
    const result = await mutate(`/api/tickets/${ticketId}/comments`, 'POST', {
      body,
      isInternal,
    });
    setPending(false);
    if (!result.ok) {
      setError('Could not post comment');
      return;
    }
    setBody('');
    setIsInternal(false);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-2">
      <label htmlFor="comment-body" className="block text-sm font-medium text-slate-700">
        Add a comment
      </label>
      <textarea
        id="comment-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={isInternal}
            onChange={(e) => setIsInternal(e.target.checked)}
          />
          Internal note
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? 'Posting…' : 'Post comment'}
        </Button>
      </div>
    </form>
  );
}
