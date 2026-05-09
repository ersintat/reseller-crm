import { NavLink, Outlet } from 'react-router-dom';
import { Role } from '../../types';
import { Button } from '../ui/Primitives';

const navItems: { label: string; to: string; roles: Role[] }[] = [
  { label: 'Dashboard', to: '/', roles: ['admin', 'employee'] },
  { label: 'Dealers', to: '/dealers', roles: ['admin', 'employee'] },
  { label: 'Transactions', to: '/transactions', roles: ['admin'] },
  { label: 'Employees', to: '/employees', roles: ['admin'] },
  { label: 'Assignments', to: '/assignments', roles: ['admin'] },
  { label: 'My Commissions', to: '/my-commissions', roles: ['employee'] },
  { label: 'Settings', to: '/settings', roles: ['admin'] },
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
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex min-h-screen">
        <aside className="w-64 shrink-0 bg-white border-r border-slate-200 p-4">
          <div className="mb-7">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Finance Ops</p>
            <h1 className="text-lg font-semibold text-indigoBrand mt-1 leading-tight">Dealer Settlement Manager</h1>
          </div>
          <nav className="space-y-1">
            {navItems
              .filter((item) => item.roles.includes(role))
              .map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    [
                      'block rounded-md px-3 py-2 text-sm font-medium transition',
                      isActive
                        ? 'bg-indigo-50 text-indigoBrand border border-indigo-100'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950 border border-transparent',
                    ].join(' ')
                  }
                >
                  {item.label}
                </NavLink>
              ))}
          </nav>
        </aside>
        <main className="flex-1 min-w-0">
          <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-6">
            <div>
              <p className="text-sm font-medium text-slate-700">USD default currency</p>
              <p className="text-xs text-slate-500">
                {authEnabled ? 'Supabase auth · Mock financial data' : 'Demo mode · Mock financial data'}
              </p>
            </div>
            {authEnabled ? (
              <div className="flex items-center gap-3 text-sm">
                <div className="text-right">
                  <p className="font-medium text-slate-800">{userEmail}</p>
                  <p className="text-xs text-slate-500 capitalize">{roleLabel}</p>
                </div>
                <Button onClick={onSignOut}>Sign out</Button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500">Temporary role</span>
                <select
                  className="border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white"
                  value={role}
                  onChange={(event) => setRole(event.target.value as Role)}
                >
                  <option value="admin">Admin</option>
                  <option value="employee">Employee</option>
                </select>
              </div>
            )}
          </header>
          <div className="p-6 space-y-4">
            {flash && (
              <div className="bg-indigo-50 border border-indigo-200 text-indigo-900 text-sm px-3 py-2 rounded-md flex justify-between">
                <span>{flash}</span>
                <button className="text-indigo-700" onClick={() => setFlash('')}>
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
