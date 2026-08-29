const STATUS_TONES: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-800',
  PENDING: 'bg-amber-100 text-amber-800',
  RESOLVED: 'bg-green-100 text-green-800',
  CLOSED: 'bg-slate-200 text-slate-700',
};

const PRIORITY_TONES: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-700',
  NORMAL: 'bg-slate-100 text-slate-700',
  HIGH: 'bg-orange-100 text-orange-800',
  CRITICAL: 'bg-red-100 text-red-800',
};

export function Badge({ tone, value }: { tone: 'status' | 'priority'; value: string }) {
  const tones = tone === 'status' ? STATUS_TONES : PRIORITY_TONES;
  const className = tones[value] ?? 'bg-slate-100 text-slate-700';
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${className}`}>
      {value.toLowerCase()}
    </span>
  );
}
