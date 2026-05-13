export function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const tone = s.includes('paid') || s === 'closed' || s === 'resolved'
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    : s.includes('pending') || s.includes('draft') || s.includes('partial') || s.includes('review')
      ? 'bg-orange-50 text-psnsOrange ring-orange-200'
    : s.includes('reject') || s.includes('error')
        ? 'bg-red-50 text-psnsCoral ring-red-200'
        : 'bg-slate-100 text-slate-700 ring-psnsMist';

  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${tone}`}>{status}</span>;
}
