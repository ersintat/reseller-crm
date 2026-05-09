import { Link } from 'react-router-dom';
import {
  Dealer,
  DealerPayment,
  DealerPaymentAllocation,
  Employee,
  EmployeeCommission,
  EmployeePayment,
  EmployeePaymentAllocation,
  Role,
  SettlementTransaction,
  Statement,
} from '../types';
import { formatUsd, stores } from '../data/mockData';
import {
  calculateStatementTotals,
  getCurrentMonthEmployeeCommission,
  getCurrentMonthReceivable,
  getDashboardTotals,
  getDealerOpenBalance,
  getEffectiveStatementPaidAmount,
  getEmployeeOpenCommissionBalance,
} from '../lib/statementCalculations';
import { PageShell } from './Shared';
import { StatusBadge } from '../components/ui/StatusBadge';

interface DashboardPageProps {
  dealers: Dealer[];
  statements: Statement[];
  transactions: SettlementTransaction[];
  allocations: DealerPaymentAllocation[];
  role: Role;
  employee: Employee;
  employeeCommissions: EmployeeCommission[];
  employeePaymentAllocations: EmployeePaymentAllocation[];
  dealerPayments: DealerPayment[];
  employeePayments: EmployeePayment[];
}

function MetricCard({
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
  tone?: 'indigo' | 'emerald' | 'amber' | 'slate';
}) {
  const toneClass = {
    indigo: 'bg-indigo-50 text-indigoBrand border-indigo-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
  }[tone];

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        {context && <span className={`text-[11px] px-2 py-1 rounded border ${toneClass}`}>{context}</span>}
      </div>
      <p className="text-2xl font-semibold text-slate-950 mt-3">{value}</p>
      <p className="text-xs text-slate-500 mt-2">{helper}</p>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-3">
      <div>
        <h3 className="text-base font-semibold text-slate-950">{title}</h3>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
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
  dealerPayments,
  employeePayments,
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
            tone={myPendingTransactions > 0 ? 'amber' : 'slate'}
          />
        </div>
      </PageShell>
    );
  }

  const currentMonth = '2026-04';
  const employeeOpen = employeeCommissions.reduce(
    (total, commission) => total + Math.max(commission.commissionAmount - commission.paidAmount, 0),
    0,
  );
  const pendingTransactions = transactions
    .filter((transaction) => transaction.status === 'pending_review')
    .sort((a, b) => b.date.localeCompare(a.date));

  const dealerRows = dealers.map((dealer) => {
    const lastPayment = dealerPayments
      .filter((payment) => payment.dealerId === dealer.id)
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))[0];

    return {
      dealer,
      storeName: stores.find((store) => store.id === dealer.storeId)?.name || dealer.storeId,
      openBalance: getDealerOpenBalance(dealer.id, statements, transactions, dealers, allocations),
      currentMonthReceivable: getCurrentMonthReceivable(
        dealer.id,
        statements,
        transactions,
        dealers,
        allocations,
        currentMonth,
      ),
      lastPayment,
    };
  });

  const employeeRows = [employee].map((row) => {
    const lastPayment = employeePayments
      .filter((payment) => payment.employeeId === row.id)
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))[0];

    return {
      employee: row,
      openBalance: getEmployeeOpenCommissionBalance(row.id, employeeCommissions, employeePaymentAllocations),
      currentMonthCommission: getCurrentMonthEmployeeCommission(row.id, employeeCommissions),
      lastPayment,
    };
  });

  const recentActivity = [
    ...statements.map((statement) => {
      const dealer = dealers.find((row) => row.id === statement.dealerId);
      const totalsForStatement = dealer
        ? calculateStatementTotals(
            statement,
            transactions,
            dealer,
            getEffectiveStatementPaidAmount(statement, allocations),
          )
        : null;

      return {
        date: statement.createdAt || `${statement.month}-01`,
        kind: 'Statement',
        title: `${dealer?.name || 'Dealer'} settlement`,
        amount: totalsForStatement?.dealer_receivable_amount ?? 0,
        status: statement.status,
        href: `/statements/${statement.id}`,
      };
    }),
    ...dealerPayments.map((payment) => ({
      date: payment.paymentDate,
      kind: 'Dealer Payment',
      title: dealers.find((dealer) => dealer.id === payment.dealerId)?.name || 'Dealer payment',
      amount: -payment.amount,
      status: 'paid',
      href: `/dealers/${payment.dealerId}`,
    })),
    ...transactions.map((transaction) => ({
      date: transaction.date,
      kind: transaction.type,
      title: dealers.find((dealer) => dealer.id === transaction.dealerId)?.name || 'Transaction',
      amount: transaction.amount,
      status: transaction.status,
      href: `/statements/${transaction.statementId}`,
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-indigoBrand">Finance Operations</p>
          <h2 className="text-2xl font-semibold text-slate-950 mt-1">Admin Dashboard</h2>
          <p className="text-sm text-slate-500 mt-1">
            Monitor dealer receivables, pending transactions, and employee commissions.
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600 shadow-sm">
          Current month <span className="font-semibold text-slate-950">{currentMonth}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          label="Dealer Open Balance"
          value={formatUsd(totals.openBalance)}
          helper="Unpaid dealer receivables across open statements."
          context={`${dealerRows.filter((row) => row.openBalance > 0).length} active`}
        />
        <MetricCard
          label="Current Month Dealer Receivables"
          value={formatUsd(totals.currentMonthReceivable)}
          helper="Confirmed transaction totals for the active mock period."
          context={currentMonth}
          tone="slate"
        />
        <MetricCard
          label="Employee Open Commissions"
          value={formatUsd(employeeOpen)}
          helper="Outstanding commission liability from generated ledgers."
          context={`${employeeRows.length} employee`}
          tone="emerald"
        />
        <MetricCard
          label="Pending Review Transactions"
          value={String(totals.pendingCount)}
          helper="Employee-submitted transactions awaiting admin decision."
          context={totals.pendingCount > 0 ? 'Action needed' : 'Clear'}
          tone={totals.pendingCount > 0 ? 'amber' : 'slate'}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <section className="xl:col-span-2 bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <SectionHeader
              title="Settlement Overview"
              subtitle="Dealer-level receivables and payment context from mock statement ledgers."
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Dealer / Store</th>
                  <th className="px-4 py-3">Open Balance</th>
                  <th className="px-4 py-3">Month Receivable</th>
                  <th className="px-4 py-3">Last Payment</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {dealerRows.map((row) => (
                  <tr key={row.dealer.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-950">{row.dealer.name}</p>
                      <p className="text-xs text-slate-500">{row.storeName}</p>
                    </td>
                    <td className="px-4 py-3 font-medium">{formatUsd(row.openBalance)}</td>
                    <td className="px-4 py-3">{formatUsd(row.currentMonthReceivable)}</td>
                    <td className="px-4 py-3">
                      {row.lastPayment ? (
                        <>
                          <p className="font-medium">{formatUsd(row.lastPayment.amount)}</p>
                          <p className="text-xs text-slate-500">{row.lastPayment.paymentDate}</p>
                        </>
                      ) : (
                        <span className="text-slate-400">No payment</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.dealer.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link className="text-indigoBrand font-medium" to={`/dealers/${row.dealer.id}`}>
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <SectionHeader title="Action Required" subtitle="Pending review queue." />
          </div>
          {pendingTransactions.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">No transactions are waiting for review.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Dealer</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Submitted By</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {pendingTransactions.slice(0, 6).map((transaction) => {
                    const dealer = dealers.find((row) => row.id === transaction.dealerId);
                    return (
                      <tr key={transaction.id} className="border-t border-slate-100">
                        <td className="px-4 py-3 text-slate-600">{transaction.date}</td>
                        <td className="px-4 py-3 font-medium text-slate-950">{dealer?.name || 'Unknown dealer'}</td>
                        <td className="px-4 py-3">{transaction.type}</td>
                        <td className="px-4 py-3 font-medium">{formatUsd(transaction.amount)}</td>
                        <td className="px-4 py-3">{transaction.createdByRole || 'admin'}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={transaction.status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-3">
                            <Link className="text-indigoBrand font-medium" to={`/statements/${transaction.statementId}`}>
                              View
                            </Link>
                            <Link className="text-indigoBrand font-medium" to="/transactions">
                              Review
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <section className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <SectionHeader title="Employee Commission Snapshot" subtitle="Commission exposure by employee ledger." />
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Open Balance</th>
                <th className="px-4 py-3">Current Month</th>
                <th className="px-4 py-3">Last Payment</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {employeeRows.map((row) => (
                <tr key={row.employee.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-950">{row.employee.name}</p>
                    <p className="text-xs text-slate-500">{row.employee.roleTitle}</p>
                  </td>
                  <td className="px-4 py-3 font-medium">{formatUsd(row.openBalance)}</td>
                  <td className="px-4 py-3">{formatUsd(row.currentMonthCommission)}</td>
                  <td className="px-4 py-3">
                    {row.lastPayment ? (
                      <>
                        <p className="font-medium">{formatUsd(row.lastPayment.amount)}</p>
                        <p className="text-xs text-slate-500">{row.lastPayment.paymentDate}</p>
                      </>
                    ) : (
                      <span className="text-slate-400">No payment</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.openBalance > 0 ? 'open' : 'closed'} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link className="text-indigoBrand font-medium" to={`/employees/${row.employee.id}`}>
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <SectionHeader title="Recent Activity" subtitle="Latest statements, payments, and transaction events." />
          </div>
          <div className="divide-y divide-slate-100">
            {recentActivity.length === 0 ? (
              <div className="p-6 text-sm text-slate-500">No recent activity to display.</div>
            ) : (
              recentActivity.map((activity, index) => (
                <Link
                  key={`${activity.kind}-${activity.date}-${index}`}
                  to={activity.href}
                  className="flex items-center justify-between gap-4 p-4 hover:bg-slate-50"
                >
                  <div>
                    <p className="font-medium text-slate-950">{activity.title}</p>
                    <p className="text-xs text-slate-500">
                      {activity.date} · {activity.kind}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={activity.amount < 0 ? 'font-semibold text-emerald-700' : 'font-semibold text-slate-950'}>
                      {formatUsd(Math.abs(activity.amount))}
                    </p>
                    <StatusBadge status={activity.status} />
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
