export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <img
        alt="PSNS Reseller CRM"
        className={compact ? 'h-9 w-9 shrink-0 rounded-lg object-cover' : 'h-11 w-11 shrink-0 rounded-xl object-cover'}
        src="/psns-logo.svg"
      />
      {!compact && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Finance Ops</p>
          <h1 className="text-base font-semibold leading-tight text-slate-950">PSNS Reseller CRM</h1>
        </div>
      )}
    </div>
  );
}
