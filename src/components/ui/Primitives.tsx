import { ReactNode } from 'react';

type Tone = 'indigo' | 'emerald' | 'amber' | 'red' | 'slate';

const toneClass: Record<Tone, string> = {
  indigo: 'bg-indigo-50 text-indigoBrand border-indigo-100',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  amber: 'bg-amber-50 text-amber-700 border-amber-100',
  red: 'bg-red-50 text-red-700 border-red-100',
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
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
    <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
      <div>
        {eyebrow && <p className="text-xs font-medium uppercase tracking-wide text-indigoBrand">{eyebrow}</p>}
        <h2 className="text-2xl font-semibold text-slate-950 mt-1">{title}</h2>
        <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

export function SectionCard({
  title,
  subtitle,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden ${className}`}>
      <div className="p-4 border-b border-slate-200">
        <h3 className="text-base font-semibold text-slate-950">{title}</h3>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
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
    <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        {context && <span className={`text-[11px] px-2 py-1 rounded border ${toneClass[tone]}`}>{context}</span>}
      </div>
      <p className="text-2xl font-semibold text-slate-950 mt-3">{value}</p>
      <p className="text-xs text-slate-500 mt-2">{helper}</p>
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
    <div className="p-6 text-sm">
      <p className="font-medium text-slate-700">{title}</p>
      {description && <p className="text-slate-500 mt-1">{description}</p>}
    </div>
  );
}

export function DataTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">{children}</table>
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
    primary: 'bg-indigoBrand text-white border-indigoBrand hover:bg-indigo-900',
    secondary: 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50',
    danger: 'bg-white text-red-700 border-red-200 hover:bg-red-50',
  }[variant];

  return (
    <button
      className={`inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-sm font-medium ${variantClass}`}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}
