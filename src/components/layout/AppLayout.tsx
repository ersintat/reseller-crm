import { Link, Outlet } from 'react-router-dom';
import { Role } from '../../types';

const navItems = [
  { label: 'Dashboard', to: '/' }, { label: 'Dealers', to: '/dealers' }, { label: 'Transactions', to: '/transactions', adminOnly: true },
  { label: 'Employees', to: '/employees', adminOnly: true }, { label: 'Assignments', to: '/assignments', adminOnly: true }, { label: 'My Commissions', to: '/my-commissions' }, { label: 'Settings', to: '/settings', adminOnly: true },
];

export function AppLayout({ role, setRole, flash, setFlash }: { role: Role; setRole: (r: Role) => void; flash: string; setFlash: (v: string) => void }) {
  return <div className="min-h-screen bg-slate-50 text-slate-900"><div className="flex"><aside className="w-64 bg-white border-r border-slate-200 min-h-screen p-4"><h1 className="text-lg font-semibold text-indigoBrand mb-6">Dealer Settlement Manager</h1><nav className="space-y-2">{navItems.filter((i) => role === 'admin' || !i.adminOnly).map((i) => <Link key={i.to} to={i.to} className="block rounded-md px-3 py-2 hover:bg-slate-100">{i.label}</Link>)}</nav></aside><main className="flex-1"><header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-6"><p className="text-sm text-slate-500">USD default currency · Mock baseline</p><select className="border border-slate-300 rounded-md px-2 py-1" value={role} onChange={(e) => setRole(e.target.value as Role)}><option value="admin">Admin</option><option value="employee">Employee</option></select></header><div className="p-6 space-y-3">{flash && <div className="bg-indigo-50 border border-indigo-200 text-indigo-900 text-sm px-3 py-2 rounded flex justify-between"><span>{flash}</span><button onClick={() => setFlash('')}>×</button></div>}<Outlet /></div></main></div></div>;
}
