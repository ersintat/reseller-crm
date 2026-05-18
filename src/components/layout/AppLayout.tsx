import { NavLink, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Role } from '../../types';
import { Button } from '../ui/Primitives';
import { BrandLogo } from '../BrandLogo';

const navItems: { label: string; to: string; roles: Role[]; marker: string }[] = [
  { label: 'Dashboard', to: '/', roles: ['admin', 'employee'], marker: 'D' },
  { label: 'Dealers', to: '/dealers', roles: ['admin', 'employee'], marker: 'R' },
  { label: 'Transactions', to: '/transactions', roles: ['admin'], marker: 'T' },
  { label: 'Employees', to: '/employees', roles: ['admin'], marker: 'E' },
  { label: 'Assignments', to: '/assignments', roles: ['admin'], marker: 'A' },
  { label: 'My Commissions', to: '/my-commissions', roles: ['employee'], marker: 'C' },
  { label: 'Settings', to: '/settings', roles: ['admin'], marker: 'S' },
];

export function AppLayout({
  role,
  setRole,
  flash,
  setFlash,
  authEnabled,
  userEmail,
  roleLabel,
  onSignOut,
  dataModeLabel,
  dataSourceError,
}: {
  role: Role;
  setRole: (role: Role) => void;
  flash: string;
  setFlash: (value: string) => void;
  authEnabled: boolean;
  userEmail?: string;
  roleLabel: string;
  onSignOut?: () => void;
  dataModeLabel: string;
  dataSourceError?: string;
}) {
  const isErrorFlash = /\b(error|could not|cannot|invalid|failed|missing)\b/i.test(flash);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!flash || isErrorFlash) return;
    const timeout = window.setTimeout(() => setFlash(''), 4000);
    return () => window.clearTimeout(timeout);
  }, [flash, isErrorFlash, setFlash]);

  const initials = (userEmail || 'Demo User')
    .split('@')[0]
    .split(/[._-]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  const nav = (compact = false, closeOnClick = false) => (
    <nav className="space-y-1.5">
      {navItems
        .filter((item) => item.roles.includes(role))
        .map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            title={compact ? item.label : undefined}
            onClick={() => {
              if (closeOnClick) setMobileNavOpen(false);
            }}
            className={({ isActive }) =>
              [
                'group flex items-center rounded-xl border px-3 py-2.5 text-sm font-medium transition',
                compact ? 'justify-center gap-0 xl:justify-start xl:gap-3' : 'gap-3',
                isActive
                  ? 'border-psnsMist bg-[#e5ebf0] text-indigoBrand shadow-sm'
                  : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={[
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold transition',
                    isActive
                      ? 'bg-white text-indigoBrand ring-1 ring-psnsMist'
                      : 'bg-slate-100 text-slate-500 group-hover:bg-white',
                  ].join(' ')}
                >
                  {item.marker}
                </span>
                <span className={compact ? 'hidden xl:inline' : ''}>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
    </nav>
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-900">
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-950/40"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative flex h-full w-[min(21rem,86vw)] flex-col border-r border-psnsMist bg-white px-4 py-5 shadow-2xl">
            <div className="mb-6 rounded-2xl border border-psnsMist bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm">
              <BrandLogo />
              <div className="mt-4 rounded-xl border-l-4 border-psnsOrange bg-[#e5ebf0] px-3 py-2 text-xs font-medium text-indigoBrand ring-1 ring-psnsMist">
                Settlement review · receivables · commissions
              </div>
            </div>
            {nav(false, true)}
          </aside>
        </div>
      )}

      <div className="flex min-h-screen min-w-0">
        <aside className="hidden w-20 shrink-0 border-r border-psnsMist bg-white/95 px-3 py-5 shadow-[1px_0_0_rgba(1,35,84,0.04)] md:block xl:w-72 xl:px-4">
          <div className="mb-7 rounded-2xl border border-psnsMist bg-gradient-to-br from-white to-slate-50 p-3 shadow-sm xl:p-4">
            <div className="flex justify-center xl:justify-start">
              <div className="xl:hidden">
                <BrandLogo compact />
              </div>
              <div className="hidden xl:block">
                <BrandLogo />
              </div>
            </div>
            <div className="mt-4 hidden rounded-xl border-l-4 border-psnsOrange bg-[#e5ebf0] px-3 py-2 text-xs font-medium text-indigoBrand ring-1 ring-psnsMist xl:block">
              Settlement review · receivables · commissions
            </div>
          </div>

          {nav(true)}
        </aside>

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 h-16 border-b border-psnsMist bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/80">
            <div className="flex h-full min-w-0 items-center justify-between gap-3 px-4 sm:px-5 lg:px-6">
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <button
                  aria-label="Open navigation"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-psnsMist bg-white text-indigoBrand shadow-sm md:hidden"
                  onClick={() => setMobileNavOpen(true)}
                >
                  <span className="h-0.5 w-4 rounded bg-current shadow-[0_5px_0_current,0_-5px_0_current]" />
                </button>
                <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-psnsMist sm:inline-flex">
                  USD default currency
                </span>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100">
                  {authEnabled ? 'Supabase auth connected' : 'Demo mode'}
                </span>
                <span className="hidden rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-100 md:inline-flex">
                  {dataModeLabel}
                </span>
              </div>

              {authEnabled ? (
                <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                    {initials || 'U'}
                  </div>
                  <div className="hidden min-w-0 text-right sm:block">
                    <p className="truncate text-sm font-semibold text-slate-900">{userEmail}</p>
                    <p className="text-xs text-slate-500 capitalize">{roleLabel}</p>
                  </div>
                  <Button onClick={onSignOut}>Sign out</Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="hidden text-xs font-medium text-slate-500 sm:inline">Temporary role</span>
                  <select
                    className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm"
                    value={role}
                    onChange={(event) => setRole(event.target.value as Role)}
                  >
                    <option value="admin">Admin</option>
                    <option value="employee">Employee</option>
                  </select>
                </div>
              )}
            </div>
          </header>

          <div className="min-w-0 p-4 sm:p-5 lg:p-7">
            {dataSourceError && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 shadow-sm">
                {dataSourceError}
              </div>
            )}
            {flash && (
              <div
                className={[
                  'fixed right-4 top-20 z-30 flex max-w-[calc(100vw-2rem)] items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg sm:right-5 sm:max-w-md',
                  isErrorFlash
                    ? 'border-red-200 bg-red-50 text-red-800'
                    : 'border-indigo-100 bg-white text-slate-800',
                ].join(' ')}
              >
                <span className="leading-5">{flash}</span>
                <button
                  className={isErrorFlash ? 'font-semibold text-red-700' : 'font-semibold text-slate-500'}
                  onClick={() => setFlash('')}
                >
                  x
                </button>
              </div>
            )}
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
