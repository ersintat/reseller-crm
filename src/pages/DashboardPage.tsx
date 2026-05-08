import { Dealer, Employee, EmployeeCommission, EmployeePaymentAllocation, Role, SettlementTransaction, Statement } from '../types';
import { formatUsd, stores } from '../data/mockData';
import {
  getCurrentMonthEmployeeCommission,
  getDashboardTotals,
  getEmployeeOpenCommissionBalance,
} from '../lib/statementCalculations';
import { PageShell } from './Shared';

interface DashboardPageProps {
  dealers: Dealer[];
  statements: Statement[];
  transactions: SettlementTransaction[];
  allocations: any[];
  role: Role;
  employee: Employee;
  employeeCommissions: EmployeeCommission[];
  employeePaymentAllocations: EmployeePaymentAllocation[];
}

function MetricCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="bg-white border rounded-lg p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-2xl font-semibold text-slate-900">{value}</p>
      <p className="text-[11px] text-slate-500 mt-1">{helper}</p>
    </div>
  );
}

export function DashboardPage({
  dealers,
  statements,
  transactions,
  allocations,
  role,
  employee,
  employeeCommissions,
  employeePaymentAllocations,
}: DashboardPageProps) {
  const totals = getDashboardTotals(statements, transactions, dealers, allocations);

  if (role === 'employee') {
    const assignedStoreIds = employee.assignments.map((assignment) => assignment.storeId);
    const assignedDealerIds = dealers
      .filter((dealer) => assignedStoreIds.includes(dealer.storeId))
      .map((dealer) => dealer.id);
    const myPendingTransactions = transactions.filter(
      (transaction) =>
        assignedDealerIds.includes(transaction.dealerId) &&
        transaction.createdByRole === 'employee' &&
        transaction.status === 'pending_review',
    ).length;
    const assignedStoreNames = employee.assignments
      .map((assignment) => stores.find((store) => store.id === assignment.storeId)?.name || assignment.storeId)
      .join(', ');

    return (
      <PageShell title="Dashboard" subtitle="My commission and review overview">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricCard
            label="My Open Commission Balance"
            value={formatUsd(getEmployeeOpenCommissionBalance(employee.id, employeeCommissions, employeePaymentAllocations))}
            helper="Generated from assigned-store statements."
          />
          <MetricCard
            label="My Current Month Commission"
            value={formatUsd(getCurrentMonthEmployeeCommission(employee.id, employeeCommissions))}
            helper="Current mock period: April 2026."
          />
          <MetricCard
            label="Assigned Stores"
            value={String(employee.assignments.length)}
            helper={assignedStoreNames || 'No assigned stores.'}
          />
          <MetricCard
            label="My Pending Transactions"
            value={String(myPendingTransactions)}
            helper="Pending rows do not affect totals until approved."
          />
        </div>
      </PageShell>
    );
  }

  const employeeOpen = employeeCommissions.reduce(
    (total, commission) => total + Math.max(commission.commissionAmount - commission.paidAmount, 0),
    0,
  );
  const employeeCurrent = employeeCommissions
    .filter((commission) => commission.periodYear === 2026 && commission.periodMonth === 4)
    .reduce((total, commission) => total + commission.commissionAmount, 0);

  return (
    <PageShell title="Dashboard" subtitle="Admin settlement and commission overview">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          label="Dealer Open Balance"
          value={formatUsd(totals.openBalance)}
          helper="Derived from statement remaining amounts."
        />
        <MetricCard
          label="Current Month Dealer Receivables"
          value={formatUsd(totals.currentMonthReceivable)}
          helper="Based on confirmed transaction totals."
        />
        <MetricCard
          label="Employee Open Commissions"
          value={formatUsd(employeeOpen)}
          helper="Open commission ledger balance."
        />
        <MetricCard
          label="Current Month Employee Commissions"
          value={formatUsd(employeeCurrent)}
          helper="Current mock period: April 2026."
        />
      </div>
      <p className="text-sm text-amber-700">Pending review transactions: {totals.pendingCount}</p>
    </PageShell>
  );
}
