import { NavLink, Outlet } from 'react-router-dom';
import { Role } from '../../types';
import { Button } from '../ui/Primitives';

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
}: {
  role: Role;
  setRole: (role: Role) => void;
  flash: string;
  setFlash: (value: string) => void;
  authEnabled: boolean;
  userEmail?: string;
  roleLabel: string;
  onSignOut?: () => void;
}) {
  const initials = (userEmail || 'Demo User')
    .split('@')[0]
    .split(/[._-]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex min-h-screen">
        <aside className="w-72 shrink-0 border-r border-slate-200 bg-white/95 px-4 py-5 shadow-[1px_0_0_rgba(15,23,42,0.02)]">
          <div className="mb-7 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigoBrand text-sm font-semibold text-white shadow-sm">
                DSM
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Finance Ops</p>
                <h1 className="text-base font-semibold leading-tight text-slate-950">Dealer Settlement</h1>
              </div>
            </div>
            <div className="mt-4 rounded-xl bg-indigo-50 px-3 py-2 text-xs text-indigoBrand ring-1 ring-indigo-100">
              Settlement review · receivables · commissions
            </div>
          </div>

          <nav className="space-y-1.5">
            {navItems
              .filter((item) => item.roles.includes(role))
              .map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    [
                      'group flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition',
                      isActive
                        ? 'border-indigo-100 bg-indigo-50 text-indigoBrand shadow-sm'
                        : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950',
                    ].join(' ')
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={[
                          'flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-semibold transition',
                          isActive
                            ? 'bg-white text-indigoBrand ring-1 ring-indigo-100'
                            : 'bg-slate-100 text-slate-500 group-hover:bg-white',
                        ].join(' ')}
                      >
                        {item.marker}
                      </span>
                      <span>{item.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
          </nav>

          <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
            <p className="font-medium text-slate-700">Financial data mode</p>
            <p className="mt-1">{authEnabled ? 'Supabase auth, mock ledgers' : 'Demo role switcher, mock ledgers'}</p>
          </div>
        </aside>

        <main className="flex-1 min-w-0">
          <header className="sticky top-0 z-10 h-16 border-b border-slate-200 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/75">
            <div className="flex h-full items-center justify-between px-6">
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                  USD default currency
                </span>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100">
                  {authEnabled ? 'Supabase auth connected' : 'Demo mode'}
                </span>
                <span className="hidden rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-100 md:inline-flex">
                  Mock financial data
                </span>
              </div>

              {authEnabled ? (
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                    {initials || 'U'}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-slate-900">{userEmail}</p>
                    <p className="text-xs text-slate-500 capitalize">{roleLabel}</p>
                  </div>
                  <Button onClick={onSignOut}>Sign out</Button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-slate-500">Temporary role</span>
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

          <div className="p-6 lg:p-7">
            {flash && (
              <div className="mb-4 flex justify-between rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 shadow-sm">
                <span>{flash}</span>
                <button className="font-medium text-indigo-700" onClick={() => setFlash('')}>
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
