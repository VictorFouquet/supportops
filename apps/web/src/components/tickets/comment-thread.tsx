import type { TicketComment } from '@/lib/api-types.js';
import { formatDateTime } from '@/lib/format.js';
import { displayName } from '@/lib/lookups.js';

export function CommentThread({
  comments,
  authorNames,
}: {
  comments: TicketComment[];
  authorNames: Map<string, string>;
}) {
  if (comments.length === 0) {
    return <p className="text-sm text-slate-500">No comments yet.</p>;
  }
  return (
    <ul className="space-y-4">
      {comments.map((comment) => (
        <li
          key={comment.id}
          className={`rounded-md border p-3 ${
            comment.isInternal ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'
          }`}
        >
          <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
            <span className="font-medium text-slate-700">
              {comment.authorType === 'CUSTOMER'
                ? 'Customer'
                : displayName(authorNames, comment.authorId)}
            </span>
            <span>{formatDateTime(comment.createdAt)}</span>
            {comment.isInternal && (
              <span className="rounded bg-amber-200 px-1.5 py-0.5 font-medium text-amber-900">
                Internal note
              </span>
            )}
          </div>
          <p className="whitespace-pre-wrap text-sm text-slate-800">{comment.body}</p>
        </li>
      ))}
    </ul>
  );
}
