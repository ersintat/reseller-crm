import { Link } from 'react-router-dom';
import {
  Dealer,
  DealerPayment,
  DealerPaymentAllocation,
  Employee,
  EmployeeCommission,
  EmployeePayment,
  EmployeePaymentAllocation,
  PendingOrderCost,
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
  getDealerBalanceSummary,
  getDealerOpenBalance,
  getEffectiveStatementPaidAmount,
  getEmployeeOpenCommissionBalance,
} from '../lib/statementCalculations';
import { PageShell } from './Shared';
import { StatusBadge } from '../components/ui/StatusBadge';
import { DataTable, EmptyState, KpiCard, PageHeader, SectionCard } from '../components/ui/Primitives';
import { formatTransactionType } from '../lib/displayLabels';

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
  pendingOrderCosts: PendingOrderCost[];
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
  pendingOrderCosts,
}: DashboardPageProps) {
  const totals = getDashboardTotals(statements, transactions, dealers, allocations);

  if (role === 'employee') {
    const assignedStoreIds = employee.assignments.map((assignment) => assignment.storeId);
    const assignedDealerIds = dealers
      .filter((dealer) => assignedStoreIds.includes(dealer.storeId))
      .map((dealer) => dealer.id);
    const myPendingOrderCosts = pendingOrderCosts.filter(
      (cost) =>
        assignedDealerIds.includes(cost.dealerId) &&
        ['pending', 'partially_resolved'].includes(cost.status),
    );
    const myPendingCostRows = dealers
      .filter((dealer) => assignedDealerIds.includes(dealer.id))
      .map((dealer) => ({
        dealer,
        count: myPendingOrderCosts.filter((cost) => cost.dealerId === dealer.id).length,
      }))
      .filter((row) => row.count > 0);
    const myPendingTransactions = transactions.filter(
      (transaction) =>
        assignedDealerIds.includes(transaction.dealerId) &&
        transaction.createdByRole === 'employee' &&
        transaction.status === 'pending_review',
    ).length;
    const assignedStoreNames = employee.assignments
      .map((assignment) => {
        const assignedDealer = dealers.find((dealer) => dealer.storeId === assignment.storeId);
        return (
          assignedDealer?.storeName ||
          assignedDealer?.name ||
          stores.find((store) => store.id === assignment.storeId)?.name ||
          assignment.storeId
        );
      })
      .join(', ');

    return (
      <PageShell title="Dashboard" subtitle="My commission and review overview">
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <KpiCard
              label="My Open Commission Balance"
              value={formatUsd(getEmployeeOpenCommissionBalance(employee.id, employeeCommissions, employeePaymentAllocations))}
              helper="Generated from assigned-store statements."
            />
            <KpiCard
              label="My Current Month Commission"
              value={formatUsd(getCurrentMonthEmployeeCommission(employee.id, employeeCommissions))}
              helper="Current period: April 2026."
            />
            <KpiCard
              label="Assigned Stores"
              value={String(employee.assignments.length)}
              helper={assignedStoreNames || 'No assigned stores.'}
            />
            <KpiCard
              label="My Pending Transactions"
              value={String(myPendingTransactions)}
              helper="Pending rows do not affect totals until approved."
              tone={myPendingTransactions > 0 ? 'amber' : 'slate'}
            />
          </div>

          <SectionCard
            className={myPendingOrderCosts.length > 0 ? 'border-psnsOrange bg-[#fff7ed] shadow-[0_16px_40px_rgba(236,130,55,0.12)]' : ''}
            title="My Pending Order Costs"
            subtitle="Unresolved printing or shipping costs for stores you can view. Not included in current amount due."
          >
            {myPendingCostRows.length === 0 ? (
              <EmptyState title="No unresolved order costs for your assigned stores." />
            ) : (
              <DataTable>
                <thead className="bg-[#fff2e6] text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Assigned Store</th>
                    <th className="px-4 py-3 text-right">Pending Costs</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {myPendingCostRows.map((row) => (
                    <tr key={row.dealer.id} className="border-t border-orange-100 bg-[#fffaf5]">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-950">{row.dealer.name}</p>
                        <p className="text-xs text-slate-500">{row.dealer.storeName || row.dealer.storeId}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-amber-700">{row.count}</td>
                      <td className="px-4 py-3 text-right">
                        <Link className="rounded-lg px-2.5 py-1.5 text-indigoBrand font-medium hover:bg-indigo-50" to={`/dealers/${row.dealer.id}`}>
                          Review Pending Costs
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </SectionCard>
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
  const activePendingCosts = pendingOrderCosts.filter((cost) =>
    ['pending', 'partially_resolved'].includes(cost.status),
  );
  const pendingCostRows = dealers
    .map((dealer) => {
      const costs = activePendingCosts.filter((cost) => cost.dealerId === dealer.id);
      const oldest = [...costs].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      return { dealer, count: costs.length, oldest };
    })
    .filter((row) => row.count > 0);

  const dealerRows = dealers.map((dealer) => {
    const lastPayment = dealerPayments
      .filter((payment) => payment.dealerId === dealer.id)
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))[0];

    return {
      dealer,
      storeName: dealer.storeName || stores.find((store) => store.id === dealer.storeId)?.name || dealer.storeId,
      openBalance: getDealerOpenBalance(dealer.id, statements, transactions, dealers, allocations),
      balanceSummary: getDealerBalanceSummary(dealer.id, statements, transactions, dealers, allocations),
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
    const totalPaid = employeeCommissions
      .filter((commission) => commission.employeeId === row.id)
      .reduce((total, commission) => total + commission.paidAmount, 0);

    return {
      employee: row,
      openBalance: getEmployeeOpenCommissionBalance(row.id, employeeCommissions, employeePaymentAllocations),
      currentMonthCommission: getCurrentMonthEmployeeCommission(row.id, employeeCommissions),
      totalPaid,
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
        date: `${statement.month}-01`,
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
      kind: formatTransactionType(transaction.type),
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
      <PageHeader
        eyebrow="Finance Operations"
        title="Admin Dashboard"
        subtitle="Monitor dealer receivables, pending transactions, and employee commissions."
        action={
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-white">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Current month</span>
            <p className="font-semibold text-slate-950">{currentMonth}</p>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Dealer Open Balance"
          value={formatUsd(totals.openBalance)}
          helper="Net unpaid dealer receivables, including dealer credits."
          context={`${dealerRows.filter((row) => row.openBalance > 0).length} active`}
        />
        <KpiCard
          label="Current Month Dealer Receivables"
          value={formatUsd(totals.currentMonthReceivable)}
          helper="Confirmed transaction totals for the active period."
          context={currentMonth}
          tone="slate"
        />
        <KpiCard
          label="Employee Open Commissions"
          value={formatUsd(employeeOpen)}
          helper="Outstanding commission liability from generated ledgers."
          context={`${employeeRows.length} employee`}
          tone="emerald"
        />
        <KpiCard
          label="Pending Review Transactions"
          value={String(totals.pendingCount)}
          helper="Employee-submitted transactions awaiting admin decision."
          context={totals.pendingCount > 0 ? 'Action needed' : 'Clear'}
          tone={totals.pendingCount > 0 ? 'amber' : 'slate'}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Confirmed transactions</p>
          <p className="mt-1 text-lg font-semibold text-slate-950">
            {transactions.filter((transaction) => transaction.status === 'confirmed').length}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Open statements</p>
          <p className="mt-1 text-lg font-semibold text-slate-950">
            {statements.filter((statement) => !['closed'].includes(statement.status)).length}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Tracked dealers</p>
          <p className="mt-1 text-lg font-semibold text-slate-950">{dealers.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <SectionCard
          className="xl:col-span-2"
          title="Settlement Overview"
          subtitle="Dealer-level receivables and payment context from statement ledgers."
        >
          <DataTable>
              <thead className="bg-slate-100/70 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Dealer / Store</th>
                  <th className="px-4 py-3 text-right">Open Balance</th>
                  <th className="px-4 py-3 text-right">Month Receivable</th>
                  <th className="px-4 py-3">Last Payment</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {dealerRows.map((row) => (
                  <tr key={row.dealer.id} className="border-t border-slate-100 transition hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-950">{row.dealer.name}</p>
                      <p className="text-xs text-slate-500">{row.storeName}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="font-medium">{formatUsd(row.openBalance)}</p>
                      {row.balanceSummary.dealerCredit > 0 && (
                        <p className="text-xs font-medium text-psnsOrange">
                          net of {formatUsd(row.balanceSummary.dealerCredit)} credit
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">{formatUsd(row.currentMonthReceivable)}</td>
                    <td className="px-4 py-3">
                      {row.lastPayment ? (
                        <>
                          <p className="font-medium text-emerald-700">{formatUsd(row.lastPayment.amount)}</p>
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
                      <Link className="rounded-lg px-2.5 py-1.5 text-indigoBrand font-medium hover:bg-indigo-50" to={`/dealers/${row.dealer.id}`}>
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
          </DataTable>
        </SectionCard>

        <SectionCard className="border-amber-200 shadow-amber-50" title="Action Required" subtitle="Pending review queue.">
          {pendingTransactions.length === 0 ? (
            <EmptyState title="No transactions are waiting for review." />
          ) : (
            <DataTable>
                <thead className="bg-amber-50/70 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Dealer</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Submitted By</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {pendingTransactions.slice(0, 6).map((transaction) => {
                    const dealer = dealers.find((row) => row.id === transaction.dealerId);
                    return (
                      <tr key={transaction.id} className="border-t border-slate-100 transition hover:bg-amber-50/40">
                        <td className="px-4 py-3 text-slate-600">{transaction.date}</td>
                        <td className="px-4 py-3 font-medium text-slate-950">{dealer?.name || 'Unknown dealer'}</td>
                        <td className="px-4 py-3">{formatTransactionType(transaction.type)}</td>
                        <td className="px-4 py-3 font-medium text-right">{formatUsd(transaction.amount)}</td>
                        <td className="px-4 py-3">{transaction.createdByRole || 'admin'}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={transaction.status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-3">
                            <Link className="rounded-lg px-2.5 py-1.5 text-indigoBrand font-medium hover:bg-indigo-50" to={`/statements/${transaction.statementId}`}>
                              View
                            </Link>
                            <Link className="rounded-lg px-2.5 py-1.5 text-indigoBrand font-medium hover:bg-indigo-50" to="/transactions">
                              Review
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
            </DataTable>
          )}
        </SectionCard>
      </div>

      <SectionCard
        className="border-psnsOrange bg-[#fff7ed] shadow-[0_16px_40px_rgba(236,130,55,0.12)]"
        title="Pending Order Costs"
        subtitle="Unresolved printing and shipping costs tracked outside current amount due."
      >
        {pendingCostRows.length > 0 && (
          <div className="border-b border-orange-200 bg-gradient-to-r from-[#fff2e6] to-white px-5 py-4">
            <p className="text-sm font-bold text-indigoBrand">Action Required: unresolved order costs</p>
            <p className="mt-1 text-sm text-slate-700">
              These are not included in current amount due and will affect future statement totals after resolution.
            </p>
          </div>
        )}
        {pendingCostRows.length === 0 ? (
          <EmptyState title="No unresolved order costs." />
        ) : (
          <DataTable>
            <thead className="bg-slate-100/70 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Dealer</th>
                <th className="px-4 py-3 text-right">Pending Items</th>
                <th className="px-4 py-3">Oldest Created</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {pendingCostRows.map((row) => (
                <tr key={row.dealer.id} className="border-t border-slate-100 transition hover:bg-slate-50/80">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-950">{row.dealer.name}</p>
                    <p className="text-xs text-slate-500">{row.dealer.storeName || row.dealer.storeId}</p>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-amber-700">{row.count}</td>
                  <td className="px-4 py-3 text-slate-600">{row.oldest?.createdAt.slice(0, 10) || '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <Link className="rounded-lg px-2.5 py-1.5 text-indigoBrand font-medium hover:bg-indigo-50" to={`/dealers/${row.dealer.id}`}>
                      Review Pending Costs
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <SectionCard title="Employee Commission Snapshot" subtitle="Commission exposure by employee ledger.">
          <DataTable>
            <thead className="bg-slate-100/70 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3 text-right">Open Balance</th>
                <th className="px-4 py-3 text-right">Current Month</th>
                <th className="px-4 py-3 text-right">Total Paid</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {employeeRows.map((row) => (
                <tr key={row.employee.id} className="border-t border-slate-100 transition hover:bg-slate-50/80">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-950">{row.employee.name}</p>
                    <p className="text-xs text-slate-500">{row.employee.roleTitle}</p>
                  </td>
                  <td className="px-4 py-3 font-medium text-right">{formatUsd(row.openBalance)}</td>
                  <td className="px-4 py-3 text-right">{formatUsd(row.currentMonthCommission)}</td>
                  <td className="px-4 py-3 text-right text-emerald-700">
                    {formatUsd(row.totalPaid)}
                    {row.lastPayment && <p className="text-xs text-slate-500">{row.lastPayment.paymentDate}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.openBalance > 0 ? 'open' : 'closed'} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link className="rounded-lg px-2.5 py-1.5 text-indigoBrand font-medium hover:bg-indigo-50" to={`/employees/${row.employee.id}`}>
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </SectionCard>

        <SectionCard title="Recent Activity" subtitle="Latest statements, payments, and transaction events.">
          <div className="divide-y divide-slate-100">
            {recentActivity.length === 0 ? (
              <EmptyState title="No recent activity to display." />
            ) : (
              recentActivity.map((activity, index) => (
                <Link
                  key={`${activity.kind}-${activity.date}-${index}`}
                  to={activity.href}
                  className="flex items-center justify-between gap-4 p-4 transition hover:bg-slate-50"
                >
                  <div className="flex items-center gap-3">
                    <span className={activity.amount < 0 ? 'h-2.5 w-2.5 rounded-full bg-emerald-500' : activity.status === 'pending_review' ? 'h-2.5 w-2.5 rounded-full bg-amber-500' : 'h-2.5 w-2.5 rounded-full bg-indigoBrand'} />
                    <div>
                      <p className="font-medium text-slate-950">{activity.title}</p>
                      <p className="text-xs text-slate-500">
                        {activity.date} · {activity.kind}
                      </p>
                    </div>
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
        </SectionCard>
      </div>
    </div>
  );
}
