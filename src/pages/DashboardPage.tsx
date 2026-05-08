import { Dealer, EmployeeCommission, Role, SettlementTransaction, Statement } from '../types';
import { formatUsd } from '../data/mockData';
import { getDashboardTotals, getCurrentMonthEmployeeCommission, getEmployeeOpenCommissionBalance } from '../lib/statementCalculations';
import { PageShell } from './Shared';

export function DashboardPage({ dealers, statements, transactions, allocations, role, employee, employeeCommissions, employeePaymentAllocations }: { dealers: Dealer[]; statements: Statement[]; transactions: SettlementTransaction[]; allocations: any[]; role: Role; employee: any; employeeCommissions: EmployeeCommission[]; employeePaymentAllocations: any[] }) {
  const totals = getDashboardTotals(statements, transactions, dealers, allocations);
  const employeeOpen = role === 'admin'
    ? employeeCommissions.reduce((a, e) => a + Math.max(e.commissionAmount - e.paidAmount, 0), 0)
    : getEmployeeOpenCommissionBalance(employee.id, employeeCommissions, employeePaymentAllocations);
  const employeeCurrent = role === 'admin'
    ? employeeCommissions.filter((c) => c.periodYear === 2026 && c.periodMonth === 4).reduce((a, c) => a + c.commissionAmount, 0)
    : getCurrentMonthEmployeeCommission(employee.id, employeeCommissions);

  return (
    <PageShell title="Dashboard" subtitle={role === 'admin' ? 'Admin settlement and commission overview' : 'My settlement and commission overview'}>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[['Dealer Open Balance', totals.openBalance], ['Current Month Dealer Receivables', totals.currentMonthReceivable], ['Employee Open Commissions', employeeOpen], ['Current Month Employee Commissions', employeeCurrent]].map(([label, value]) => (
          <div key={String(label)} className="bg-white border rounded-lg p-4">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-2xl font-semibold text-slate-900">{formatUsd(Number(value))}</p>
            <p className="text-[11px] text-slate-500 mt-1">Derived from confirmed transactions and allocation-aware ledgers.</p>
          </div>
        ))}
      </div>
      <p className="text-sm text-amber-700">Pending review transactions: {totals.pendingCount}</p>
    </PageShell>
  );
}
