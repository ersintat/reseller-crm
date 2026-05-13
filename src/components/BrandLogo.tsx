export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <svg
        aria-label="PSNS Reseller CRM"
        className={compact ? 'h-9 w-9 shrink-0' : 'h-11 w-11 shrink-0'}
        viewBox="0 0 48 48"
        role="img"
      >
        <rect width="48" height="48" rx="12" fill="#012354" />
        <path d="M10 30.5V16h11.2c4.2 0 6.8 2.4 6.8 6.1s-2.7 6.2-6.9 6.2h-5.2v2.2H10Zm5.9-6.8h4.6c1.5 0 2.4-.6 2.4-1.7s-.9-1.7-2.4-1.7h-4.6v3.4Z" fill="#ffffff" />
        <path d="M29.2 30.5V16h5.6l7.1 7.5V16H48v14.5h-5.5l-7.2-7.5v7.5h-6.1Z" fill="#ec8237" transform="translate(-5 0)" />
        <path d="M10 35h28" stroke="#f46033" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {!compact && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Finance Ops</p>
          <h1 className="text-base font-semibold leading-tight text-slate-950">PSNS Reseller CRM</h1>
        </div>
      )}
    </div>
  );
}
