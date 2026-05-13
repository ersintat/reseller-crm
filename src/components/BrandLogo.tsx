export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <img
        alt="PSNS Reseller CRM"
        className={compact ? 'h-9 w-auto shrink-0' : 'h-11 w-auto shrink-0'}
        src="/psns-logo.svg"
      />
      {!compact && (
        <div>
          <h1 className="text-base font-bold leading-tight text-indigoBrand">PSNS Reseller CRM</h1>
          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Settlement · Receivables · Commissions
          </p>
        </div>
      )}
    </div>
  );
}
