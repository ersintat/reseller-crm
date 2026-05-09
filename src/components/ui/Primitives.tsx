import { ReactNode } from 'react';

type Tone = 'indigo' | 'emerald' | 'amber' | 'red' | 'slate';

const toneClass: Record<Tone, string> = {
  indigo: 'bg-indigo-50 text-indigoBrand ring-indigo-100',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100',
  red: 'bg-red-50 text-red-700 ring-red-100',
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
};

const accentClass: Record<Tone, string> = {
  indigo: 'from-indigo-500 to-indigoBrand',
  emerald: 'from-emerald-400 to-emerald-600',
  amber: 'from-amber-400 to-amber-600',
  red: 'from-red-400 to-red-600',
  slate: 'from-slate-300 to-slate-500',
};

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigoBrand via-indigo-500 to-emerald-400" />
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          {eyebrow && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigoBrand">{eyebrow}</p>
          )}
          <h2 className="text-2xl font-semibold text-slate-950 mt-1">{title}</h2>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">{subtitle}</p>
        </div>
        {action}
      </div>
    </div>
  );
}

export function SectionCard({
  title,
  subtitle,
  children,
  className = '',
  action,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section className={`bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden ${className}`}>
      <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-b from-white to-slate-50/60">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-950">{title}</h3>
            {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
          </div>
          {action}
        </div>
      </div>
      {children}
    </section>
  );
}

export function KpiCard({
  label,
  value,
  helper,
  context,
  tone = 'indigo',
}: {
  label: string;
  value: string;
  helper: string;
  context?: string;
  tone?: Tone;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accentClass[tone]}`} />
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
        {context && (
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${toneClass[tone]}`}>
            {context}
          </span>
        )}
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{helper}</p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="m-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6 text-sm">
      <p className="font-medium text-slate-800">{title}</p>
      {description && <p className="text-slate-500 mt-1">{description}</p>}
    </div>
  );
}

export function DataTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-sm">{children}</table>
    </div>
  );
}

export function Button({
  children,
  variant = 'secondary',
  onClick,
  type = 'button',
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  onClick?: () => void;
  type?: 'button' | 'submit';
}) {
  const variantClass = {
    primary: 'bg-indigoBrand text-white border-indigoBrand shadow-sm hover:bg-indigo-900',
    secondary: 'bg-white text-slate-700 border-slate-300 shadow-sm hover:bg-slate-50',
    danger: 'bg-white text-red-700 border-red-200 shadow-sm hover:bg-red-50',
  }[variant];

  return (
    <button
      className={`inline-flex h-9 items-center justify-center rounded-lg border px-3.5 text-sm font-medium transition ${variantClass}`}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}
