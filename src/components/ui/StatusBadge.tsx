export function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const tone = s.includes('paid') || s === 'closed'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : s.includes('pending') || s.includes('draft') || s.includes('partial') || s.includes('review')
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : s.includes('reject') || s.includes('error')
        ? 'bg-red-50 text-red-700 border-red-200'
        : 'bg-slate-100 text-slate-700 border-slate-200';

  return <span className={`px-2 py-1 rounded text-xs font-medium border ${tone}`}>{status}</span>;
}
