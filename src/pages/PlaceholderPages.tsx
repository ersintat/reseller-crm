import { Link, Navigate, useParams } from 'react-router-dom';
import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
  Dealer,
  DealerPayment,
  DealerPaymentAllocation,
  Employee,
  EmployeeCommission,
  EmployeePayment,
  EmployeePaymentAllocation,
  ManualAdjustmentDirection,
  ManualAdjustmentScope,
  Role,
  SettlementTransaction,
  Statement,
  TransactionStatus,
  TransactionType,
} from '../types';
import { formatUsd, stores } from '../data/mockData';
import {
  allocateDealerPaymentFIFO,
  calculateStatementTotals,
  generateEmployeeCommissionsForStatement,
  getCommissionPreviewsForStatement,
  getCurrentMonthEmployeeCommission,
  getCurrentMonthReceivable,
  getDealerLedgerRows,
  getDealerOpenBalance,
  getEffectiveStatementPaidAmount,
  getEmployeeCommissionLedgerRows,
  getEmployeeCommissionPaidAmount,
  getEmployeeOpenCommissionBalance,
  getOpenCommissionsForEmployee,
  getOpenStatementsForDealer,
  getStatementPaidAmount,
  getStatementRemainingAmount,
} from '../lib/statementCalculations';
import { PageShell } from './Shared';
import { StatusBadge } from '../components/ui/StatusBadge';

const transactionTypes: TransactionType[] = [
  'bank_payout',
  'store_expense',
  'printing_cost',
  'shipping_cost',
  'manual_adjustment',
];
const adjustmentScopes: ManualAdjustmentScope[] = [
  'dealer_receivable_only',
  'shareable_net',
  'employee_commission_base',
];
const adjustmentDirections: ManualAdjustmentDirection[] = ['increase', 'decrease'];
const bankPayoutHelper =
  'bank_payout is a platform payout deposited into the dealer bank account. It is not a dealer payment.';

function SummaryCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="bg-white border rounded-lg p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-semibold text-slate-900">{value}</p>
      {helper && <p className="text-[11px] text-slate-500 mt-1">{helper}</p>}
    </div>
  );
}

function StatementBreakdown({ statement, dealer, transactions, allocations }: {
  statement: Statement;
  dealer: Dealer;
  transactions: SettlementTransaction[];
  allocations: DealerPaymentAllocation[];
}) {
  const paid = getEffectiveStatementPaidAmount(statement, allocations);
  const totals = calculateStatementTotals(statement, transactions, dealer, paid);
  const rows = [
    ['Platform payout', totals.total_bank_payouts],
    ['Dealer share', totals.dealer_share_amount],
    ['Company share', totals.company_share_amount],
    ['Printing cost', totals.total_printing_costs],
    ['Shipping cost', totals.total_shipping_costs],
    ['Dealer receivable', totals.dealer_receivable_amount],
    ['Paid', totals.paid_amount],
    ['Remaining', totals.remaining_amount],
  ];

  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-medium text-slate-900">Statement Breakdown</h3>
          <p className="text-xs text-slate-500 mt-1">{bankPayoutHelper}</p>
        </div>
        <StatusBadge status={statement.status} />
      </div>
      <div className="grid md:grid-cols-4 gap-3 mt-4">
        {rows.map(([label, value]) => (
          <div key={String(label)} className="border rounded-md px-3 py-2 bg-slate-50">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="font-semibold">{formatUsd(Number(value))}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

interface DealerProfilePageProps {
  role: Role;
  assignedStoreIds: string[];
  dealers: Dealer[];
  statements: Statement[];
  transactions: SettlementTransaction[];
  setStatements: Dispatch<SetStateAction<Statement[]>>;
  setFlash: (value: string) => void;
  payments: DealerPayment[];
  allocations: DealerPaymentAllocation[];
  setPayments: Dispatch<SetStateAction<DealerPayment[]>>;
  setAllocations: Dispatch<SetStateAction<DealerPaymentAllocation[]>>;
  employees: Employee[];
  employeeCommissions: EmployeeCommission[];
  setEmployeeCommissions: Dispatch<SetStateAction<EmployeeCommission[]>>;
}

export function DealerProfilePage({
  role,
  assignedStoreIds,
  dealers,
  statements,
  transactions,
  setStatements,
  setFlash,
  payments,
  allocations,
  setPayments,
  setAllocations,
  employees,
  setEmployeeCommissions,
}: DealerProfilePageProps) {
  const { dealerId } = useParams();
  const dealer = dealers.find((row) => row.id === dealerId);
  const [month, setMonth] = useState('2026-05');
  const [payForm, setPayForm] = useState({
    paymentDate: '2026-05-01',
    amount: '',
    description: '',
    mode: 'fifo' as 'fifo' | 'manual',
  });
  const [manual, setManual] = useState<Record<string, string>>({});

  if (!dealer) return <PageShell title="Dealer Profile" subtitle="Dealer not found" />;
  if (role === 'employee' && !assignedStoreIds.includes(dealer.storeId)) return <Navigate to="/dealers" replace />;

  const dealerStatements = statements.filter((statement) => statement.dealerId === dealer.id);
  const openStatements = getOpenStatementsForDealer(dealer.id, statements, transactions, dealers, allocations);
  const ledger = getDealerLedgerRows(dealer.id, statements, transactions, dealers, payments, allocations);
  const openBalance = getDealerOpenBalance(dealer.id, statements, transactions, dealers, allocations);
  const currentMonthReceivable = getCurrentMonthReceivable(
    dealer.id,
    statements,
    transactions,
    dealers,
    allocations,
  );
  const totalPaid = dealerStatements.reduce(
    (total, statement) => total + getEffectiveStatementPaidAmount(statement, allocations),
    0,
  );
  const lastPayment = payments
    .filter((payment) => payment.dealerId === dealer.id)
    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))[0];
  let running = 0;

  const createStatement = () => {
    if (dealerStatements.some((statement) => statement.month === month)) {
      setFlash('Error: duplicate statement month blocked.');
      return;
    }
    setStatements((previous) => [
      ...previous,
      {
        id: `st-${dealer.id}-${month}`,
        dealerId: dealer.id,
        month,
        status: 'draft',
        paidAmount: 0,
        createdAt: new Date().toISOString(),
      },
    ]);
    setFlash('Statement created.');
  };

  const submitPayment = () => {
    if (role !== 'admin') return;

    const amount = Number(payForm.amount);
    if (!amount || amount <= 0) {
      setFlash('Payment amount must be positive.');
      return;
    }

    let rows: { statementId: string; allocatedAmount: number }[] = [];
    if (payForm.mode === 'fifo') {
      rows = allocateDealerPaymentFIFO({ dealerId: dealer.id, amount, openStatements });
    } else {
      rows = Object.entries(manual)
        .filter(([, value]) => Number(value) > 0)
        .map(([statementId, value]) => ({ statementId, allocatedAmount: Number(value) }));
      const total = rows.reduce((sum, row) => sum + row.allocatedAmount, 0);
      if (Math.abs(total - amount) > 0.001) {
        setFlash('Manual allocation must equal payment amount.');
        return;
      }
      for (const row of rows) {
        const statement = openStatements.find((open) => open.statement.id === row.statementId);
        if (!statement) {
          setFlash('Invalid statement selection.');
          return;
        }
        if (row.allocatedAmount > statement.remaining) {
          setFlash('Cannot allocate more than remaining amount.');
          return;
        }
      }
    }

    if (rows.length === 0) {
      setFlash('No open statement balance is available for this payment.');
      return;
    }

    const paymentId = `pay-${Date.now()}`;
    const payment: DealerPayment = {
      id: paymentId,
      dealerId: dealer.id,
      amount,
      currency: 'USD',
      paymentDate: payForm.paymentDate,
      description: payForm.description || 'Dealer payment',
      allocationMode: payForm.mode,
      createdBy: role,
      createdAt: new Date().toISOString(),
    };
    const allocationRows: DealerPaymentAllocation[] = rows.map((row, index) => ({
      id: `${paymentId}-${index}`,
      paymentId,
      statementId: row.statementId,
      allocatedAmount: row.allocatedAmount,
    }));

    setPayments((previous) => [...previous, payment]);
    setAllocations((previous) => [...previous, ...allocationRows]);
    setStatements((previous) =>
      previous.map((statement) => {
        if (statement.dealerId !== dealer.id) return statement;
        const existingPaid = getEffectiveStatementPaidAmount(statement, allocations);
        const newlyAllocated = allocationRows
          .filter((allocation) => allocation.statementId === statement.id)
          .reduce((total, allocation) => total + allocation.allocatedAmount, 0);
        const paid = existingPaid + newlyAllocated;
        const remaining = calculateStatementTotals(statement, transactions, dealer, paid).remaining_amount;
        const status = remaining <= 0 ? 'closed' : paid > 0 ? 'partially_paid' : statement.status;
        return { ...statement, paidAmount: paid, status };
      }),
    );
    setFlash('Payment recorded and allocated.');
  };

  return (
    <PageShell title="Dealer Profile" subtitle={dealer.name}>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard label="Open Balance" value={formatUsd(openBalance)} helper="Sum of statement remaining amounts." />
        <SummaryCard
          label="Current Month Receivable"
          value={formatUsd(currentMonthReceivable)}
          helper="Current mock period: April 2026."
        />
        <SummaryCard label="Total Paid" value={formatUsd(totalPaid)} helper="Seed paid amount plus allocated payments." />
        <SummaryCard
          label="Last Payment"
          value={lastPayment ? formatUsd(lastPayment.amount) : formatUsd(0)}
          helper={lastPayment ? lastPayment.paymentDate : 'No recorded dealer payment.'}
        />
      </div>

      <p className="text-xs text-slate-500">{bankPayoutHelper}</p>

      {role === 'admin' && (
        <div className="flex gap-2">
          <input
            type="month"
            className="border rounded px-2 py-1"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          />
          <button className="bg-indigoBrand text-white px-3 py-1 rounded" onClick={createStatement}>
            New Statement
          </button>
        </div>
      )}

      {role === 'admin' && (
        <div className="bg-white border rounded-lg p-4 space-y-3">
          <h3 className="font-medium">Record Dealer Payment</h3>
          <div className="grid md:grid-cols-4 gap-2">
            <input
              type="date"
              className="border rounded px-2 py-1"
              value={payForm.paymentDate}
              onChange={(event) => setPayForm({ ...payForm, paymentDate: event.target.value })}
            />
            <input
              placeholder="Amount"
              type="number"
              min="0.01"
              className="border rounded px-2 py-1"
              value={payForm.amount}
              onChange={(event) => setPayForm({ ...payForm, amount: event.target.value })}
            />
            <input
              placeholder="Description"
              className="border rounded px-2 py-1"
              value={payForm.description}
              onChange={(event) => setPayForm({ ...payForm, description: event.target.value })}
            />
            <select
              className="border rounded px-2 py-1"
              value={payForm.mode}
              onChange={(event) => setPayForm({ ...payForm, mode: event.target.value as 'fifo' | 'manual' })}
            >
              <option value="fifo">FIFO</option>
              <option value="manual">Manual</option>
            </select>
          </div>

          {payForm.mode === 'fifo' && (
            <div className="text-xs text-slate-600">
              Preview:{' '}
              {allocateDealerPaymentFIFO({
                dealerId: dealer.id,
                amount: Number(payForm.amount) || 0,
                openStatements,
              })
                .map((row) => `${row.statementId}: ${formatUsd(row.allocatedAmount)}`)
                .join(' | ') || 'No allocation preview'}
            </div>
          )}

          {payForm.mode === 'manual' && (
            <div className="space-y-1">
              {openStatements.map((open) => (
                <div key={open.statement.id} className="flex items-center gap-2 text-sm">
                  <span className="w-36">{open.statement.month}</span>
                  <span className="w-28">{formatUsd(open.remaining)}</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="Allocate"
                    className="border rounded px-2 py-1"
                    value={manual[open.statement.id] || ''}
                    onChange={(event) => setManual({ ...manual, [open.statement.id]: event.target.value })}
                  />
                </div>
              ))}
            </div>
          )}

          <button className="bg-indigoBrand text-white px-3 py-1 rounded" onClick={submitPayment}>
            Submit Payment
          </button>
        </div>
      )}

      {ledger.length === 0 && (
        <div className="bg-white border rounded-lg p-4 text-slate-500">No ledger activity yet.</div>
      )}

      <table className="w-full bg-white border rounded-lg overflow-hidden text-sm">
        <thead className="bg-slate-100">
          <tr>
            <th className="p-2 text-left">Date</th>
            <th>Type</th>
            <th>Description</th>
            <th>Amount</th>
            <th>Running</th>
          </tr>
        </thead>
        <tbody>
          {ledger.map((row, index) => {
            running += row.amount;
            return (
              <tr key={`${row.date}-${index}`} className="border-t">
                <td className="p-2">{row.date}</td>
                <td>{row.kind}</td>
                <td>{row.description}</td>
                <td>{formatUsd(row.amount)}</td>
                <td>{formatUsd(running)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <table className="w-full bg-white border rounded-lg overflow-hidden text-sm">
        <thead className="bg-slate-100">
          <tr>
            <th className="p-3 text-left">Month</th>
            <th>Status</th>
            <th>Platform Payout</th>
            <th>Company Share</th>
            <th>Dealer Receivable</th>
            <th>Paid</th>
            <th>Remaining</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {dealerStatements.map((statement) => {
            const totals = calculateStatementTotals(
              statement,
              transactions,
              dealer,
              getEffectiveStatementPaidAmount(statement, allocations),
            );
            return (
              <tr key={statement.id} className="border-t">
                <td className="p-3">{statement.month}</td>
                <td>
                  <StatusBadge status={statement.status} />
                </td>
                <td>{formatUsd(totals.total_bank_payouts)}</td>
                <td>{formatUsd(totals.company_share_amount)}</td>
                <td>{formatUsd(totals.dealer_receivable_amount)}</td>
                <td>{formatUsd(totals.paid_amount)}</td>
                <td>{formatUsd(totals.remaining_amount)}</td>
                <td className="space-x-2">
                  <Link className="text-indigoBrand" to={`/statements/${statement.id}`}>
                    View
                  </Link>
                  {role === 'employee' && (
                    <Link className="text-indigoBrand" to={`/statements/${statement.id}#add-transaction`}>
                      Add Transaction
                    </Link>
                  )}
                  {role === 'admin' && (
                    <button
                      className="text-xs text-indigoBrand"
                      onClick={() => {
                        setStatements((previous) =>
                          previous.map((row) =>
                            row.id === statement.id ? { ...row, status: 'closed' } : row,
                          ),
                        );
                        setEmployeeCommissions((previous) =>
                          generateEmployeeCommissionsForStatement(
                            statement,
                            dealers,
                            employees,
                            transactions,
                            previous,
                          ),
                        );
                        setFlash('Statement closed and commissions generated.');
                      }}
                    >
                      Close Statement
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </PageShell>
  );
}

interface StatementDetailPageProps {
  role: Role;
  assignedStoreIds: string[];
  dealers: Dealer[];
  statements: Statement[];
  transactions: SettlementTransaction[];
  setTransactions: Dispatch<SetStateAction<SettlementTransaction[]>>;
  setFlash: (value: string) => void;
  allocations: DealerPaymentAllocation[];
  employees: Employee[];
}

export function StatementDetailPage({
  role,
  assignedStoreIds,
  dealers,
  statements,
  transactions,
  setTransactions,
  setFlash,
  allocations,
  employees,
}: StatementDetailPageProps) {
  const { statementId } = useParams();
  const statement = statements.find((row) => row.id === statementId);
  const [form, setForm] = useState({
    date: '2026-04-15',
    type: 'bank_payout' as TransactionType,
    amount: '',
    description: '',
    orderCode: '',
    adjustmentScope: 'shareable_net' as ManualAdjustmentScope,
    adjustmentDirection: 'increase' as ManualAdjustmentDirection,
  });

  if (!statement) return <PageShell title="Statement Detail" subtitle="Statement not found" />;
  const dealer = dealers.find((row) => row.id === statement.dealerId);
  if (!dealer) return <PageShell title="Statement Detail" subtitle="Dealer not found" />;
  if (role === 'employee' && !assignedStoreIds.includes(dealer.storeId)) return <Navigate to="/dealers" replace />;

  const txns = transactions.filter((transaction) => transaction.statementId === statement.id);
  const paid = getEffectiveStatementPaidAmount(statement, allocations);
  const totals = calculateStatementTotals(statement, transactions, dealer, paid);
  const statementAllocations = allocations.filter((allocation) => allocation.statementId === statement.id);
  const commissionPreviews = getCommissionPreviewsForStatement(statement, transactions, dealer, employees);

  const addTransaction = () => {
    const amount = Number(form.amount);
    if (!form.date || !form.type || amount <= 0) {
      setFlash('Error: required fields and positive amount are required.');
      return;
    }

    const status: TransactionStatus = role === 'admin' ? 'confirmed' : 'pending_review';
    setTransactions((previous) => [
      ...previous,
      {
        id: `t-${Date.now()}`,
        dealerId: dealer.id,
        statementId: statement.id,
        date: form.date,
        type: form.type,
        amount,
        status,
        description: form.description,
        orderCode: form.orderCode || undefined,
        adjustmentScope: form.type === 'manual_adjustment' ? form.adjustmentScope : undefined,
        adjustmentDirection: form.type === 'manual_adjustment' ? form.adjustmentDirection : undefined,
        createdByRole: role,
      },
    ]);
    setFlash(role === 'admin' ? 'Transaction added and confirmed.' : 'Transaction submitted for admin review.');
    setForm((previous) => ({ ...previous, amount: '', description: '', orderCode: '' }));
  };

  return (
    <PageShell title="Statement Detail" subtitle={`${dealer.name} · ${statement.month}`}>
      <StatementBreakdown statement={statement} dealer={dealer} transactions={transactions} allocations={allocations} />

      <div id="add-transaction" className="bg-white border-2 border-indigo-100 rounded-lg p-4 space-y-3">
        <div>
          <h3 className="font-semibold text-slate-900">Add Transaction</h3>
          {role === 'employee' ? (
            <p className="text-xs text-slate-500">
              Your transaction will be submitted for admin review and will not affect totals until approved.
            </p>
          ) : (
            <p className="text-xs text-slate-500">Admin-created transactions are confirmed immediately.</p>
          )}
        </div>
        <div className="grid md:grid-cols-4 gap-2 text-sm">
          <input
            type="date"
            aria-label="Transaction date"
            value={form.date}
            onChange={(event) => setForm({ ...form, date: event.target.value })}
            className="border rounded px-2 py-1"
          />
          <select
            aria-label="Transaction type"
            value={form.type}
            onChange={(event) => setForm({ ...form, type: event.target.value as TransactionType })}
            className="border rounded px-2 py-1"
          >
            {transactionTypes.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
          <input
            type="number"
            min="0.01"
            value={form.amount}
            onChange={(event) => setForm({ ...form, amount: event.target.value })}
            className="border rounded px-2 py-1"
            placeholder="Amount"
          />
          <input
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            className="border rounded px-2 py-1"
            placeholder="Description"
          />
          <input
            value={form.orderCode}
            onChange={(event) => setForm({ ...form, orderCode: event.target.value })}
            className="border rounded px-2 py-1"
            placeholder="Order Code optional"
          />
          {form.type === 'manual_adjustment' && (
            <>
              <select
                aria-label="Manual adjustment scope"
                value={form.adjustmentScope}
                onChange={(event) =>
                  setForm({ ...form, adjustmentScope: event.target.value as ManualAdjustmentScope })
                }
                className="border rounded px-2 py-1"
              >
                {adjustmentScopes.map((scope) => (
                  <option key={scope}>{scope}</option>
                ))}
              </select>
              <select
                aria-label="Manual adjustment direction"
                value={form.adjustmentDirection}
                onChange={(event) =>
                  setForm({ ...form, adjustmentDirection: event.target.value as ManualAdjustmentDirection })
                }
                className="border rounded px-2 py-1"
              >
                {adjustmentDirections.map((direction) => (
                  <option key={direction}>{direction}</option>
                ))}
              </select>
            </>
          )}
        </div>
        <button className="bg-indigoBrand text-white px-3 py-1 rounded" onClick={addTransaction}>
          Add Transaction
        </button>
      </div>

      <table className="w-full bg-white border rounded-lg overflow-hidden text-sm">
        <thead className="bg-slate-100">
          <tr>
            <th className="p-2 text-left">Date</th>
            <th>Type</th>
            <th>Status</th>
            <th>Amount</th>
            <th>Order</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {txns.map((transaction) => (
            <tr
              key={transaction.id}
              className={`border-t ${
                transaction.status === 'confirmed'
                  ? ''
                  : transaction.status === 'rejected'
                    ? 'text-red-500 bg-red-50'
                    : 'text-slate-500 bg-slate-50'
              }`}
            >
              <td className="p-2">{transaction.date}</td>
              <td>{transaction.type}</td>
              <td>
                <StatusBadge status={transaction.status} />
              </td>
              <td>{formatUsd(transaction.amount)}</td>
              <td>{transaction.orderCode || '-'}</td>
              <td>{transaction.description || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="bg-white border rounded-lg p-4 text-sm">
        <h3 className="font-medium mb-2">Payment Allocations</h3>
        <p>Paid amount: {formatUsd(totals.paid_amount)}</p>
        <p>Remaining amount: {formatUsd(totals.remaining_amount)}</p>
        {statementAllocations.length === 0 ? (
          <p className="text-xs text-slate-500 mt-1">No payment allocation rows yet.</p>
        ) : (
          statementAllocations.map((allocation) => (
            <p key={allocation.id} className="text-xs">
              {allocation.paymentId}: {formatUsd(allocation.allocatedAmount)}
            </p>
          ))
        )}
      </div>

      {role === 'admin' && (
        <div className="bg-white border rounded-lg p-4">
          <h3 className="font-medium">Employee Commission Preview</h3>
          {commissionPreviews.length === 0 ? (
            <p className="text-sm text-slate-500 mt-2">No employee commission assignment for this dealer.</p>
          ) : (
            <table className="w-full text-sm mt-3">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-2">Assigned Employee</th>
                  <th>Commission Rate</th>
                  <th>Commission Base</th>
                  <th>Estimated Commission</th>
                </tr>
              </thead>
              <tbody>
                {commissionPreviews.map((preview) => (
                  <tr key={preview.employee.id} className="border-t">
                    <td className="py-2">{preview.employee.name}</td>
                    <td>{preview.assignment.commissionRatePct}%</td>
                    <td>{formatUsd(preview.commissionBase)}</td>
                    <td>{formatUsd(preview.estimatedCommission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </PageShell>
  );
}

interface TransactionsPageProps {
  role: Role;
  assignedStoreIds: string[];
  dealers: Dealer[];
  transactions: SettlementTransaction[];
  setTransactions: Dispatch<SetStateAction<SettlementTransaction[]>>;
  setFlash: (value: string) => void;
}

export function TransactionsPage({
  role,
  assignedStoreIds,
  dealers,
  transactions,
  setTransactions,
  setFlash,
}: TransactionsPageProps) {
  const [filters, setFilters] = useState({ dealerId: '', type: '', status: '', q: '' });
  const visibleDealers = role === 'admin' ? dealers : dealers.filter((dealer) => assignedStoreIds.includes(dealer.storeId));
  const visibleIds = useMemo(() => new Set(visibleDealers.map((dealer) => dealer.id)), [visibleDealers]);
  const rows = useMemo(
    () =>
      transactions
        .filter((transaction) => visibleIds.has(transaction.dealerId))
        .filter((transaction) => !filters.dealerId || transaction.dealerId === filters.dealerId)
        .filter((transaction) => !filters.type || transaction.type === filters.type)
        .filter((transaction) => !filters.status || transaction.status === filters.status)
        .filter(
          (transaction) =>
            !filters.q ||
            (transaction.orderCode || '').includes(filters.q) ||
            (transaction.description || '').toLowerCase().includes(filters.q.toLowerCase()),
        ),
    [transactions, visibleIds, filters],
  );

  const updateStatus = (transactionId: string, status: TransactionStatus) => {
    setTransactions((previous) =>
      previous.map((transaction) => (transaction.id === transactionId ? { ...transaction, status } : transaction)),
    );
    setFlash(status === 'confirmed' ? 'Transaction approved.' : 'Transaction rejected.');
  };

  return (
    <PageShell title="Transactions" subtitle="Global transaction management and approval queue">
      <div className="grid md:grid-cols-4 gap-2">
        <select
          className="border rounded px-2 py-1"
          value={filters.dealerId}
          onChange={(event) => setFilters({ ...filters, dealerId: event.target.value })}
        >
          <option value="">All dealers</option>
          {visibleDealers.map((dealer) => (
            <option key={dealer.id} value={dealer.id}>
              {dealer.name}
            </option>
          ))}
        </select>
        <select
          className="border rounded px-2 py-1"
          value={filters.type}
          onChange={(event) => setFilters({ ...filters, type: event.target.value })}
        >
          <option value="">All types</option>
          {transactionTypes.map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
        <select
          className="border rounded px-2 py-1"
          value={filters.status}
          onChange={(event) => setFilters({ ...filters, status: event.target.value })}
        >
          <option value="">All status</option>
          <option>confirmed</option>
          <option>pending_review</option>
          <option>rejected</option>
        </select>
        <input
          className="border rounded px-2 py-1"
          placeholder="Search order/description"
          value={filters.q}
          onChange={(event) => setFilters({ ...filters, q: event.target.value })}
        />
      </div>
      <table className="w-full bg-white border rounded-lg overflow-hidden text-sm mt-3">
        <thead className="bg-slate-100">
          <tr>
            <th className="p-3 text-left">Dealer</th>
            <th>Type</th>
            <th>Status</th>
            <th>Amount</th>
            <th>Order</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td className="p-4 text-slate-500" colSpan={6}>
                No transactions match the current filters.
              </td>
            </tr>
          )}
          {rows.map((transaction) => (
            <tr key={transaction.id} className="border-t">
              <td className="p-3">{dealers.find((dealer) => dealer.id === transaction.dealerId)?.name}</td>
              <td>{transaction.type}</td>
              <td>
                <StatusBadge status={transaction.status} />
              </td>
              <td>{formatUsd(transaction.amount)}</td>
              <td>{transaction.orderCode || '-'}</td>
              <td>
                {role === 'admin' && transaction.status === 'pending_review' && (
                  <>
                    <button className="text-indigoBrand mr-2" onClick={() => updateStatus(transaction.id, 'confirmed')}>
                      Approve
                    </button>
                    <button className="text-red-600" onClick={() => updateStatus(transaction.id, 'rejected')}>
                      Reject
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PageShell>
  );
}

export function EmployeesPage({ employees, dealers, commissions, allocations }: {
  employees: Employee[];
  dealers: Dealer[];
  commissions: EmployeeCommission[];
  allocations: EmployeePaymentAllocation[];
}) {
  return (
    <PageShell title="Employees" subtitle="Commission ledger overview">
      <table className="w-full bg-white border rounded-lg text-sm">
        <thead className="bg-slate-100">
          <tr>
            <th className="p-2 text-left">Name</th>
            <th>Assigned Stores</th>
            <th>Open Balance</th>
            <th>Current Month</th>
            <th>Total Paid</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {employees.map((employee) => {
            const open = getEmployeeOpenCommissionBalance(employee.id, commissions, allocations);
            const current = getCurrentMonthEmployeeCommission(employee.id, commissions);
            const totalPaid = commissions
              .filter((commission) => commission.employeeId === employee.id)
              .reduce((total, commission) => total + commission.paidAmount, 0);
            return (
              <tr key={employee.id} className="border-t">
                <td className="p-2">{employee.name}</td>
                <td>
                  {employee.assignments
                    .map(
                      (assignment) =>
                        `${dealers.find((dealer) => dealer.storeId === assignment.storeId)?.name || assignment.storeId} (${assignment.commissionRatePct}%)`,
                    )
                    .join(', ')}
                </td>
                <td>{formatUsd(open)}</td>
                <td>{formatUsd(current)}</td>
                <td>{formatUsd(totalPaid)}</td>
                <td>
                  <Link to={`/employees/${employee.id}`} className="text-indigoBrand">
                    View
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </PageShell>
  );
}

export function EmployeeProfilePage({
  role,
  employees,
  commissions,
  payments,
  allocations,
  setPayments,
  setAllocations,
  setCommissions,
  setFlash,
}: {
  role: Role;
  employees: Employee[];
  dealers: Dealer[];
  commissions: EmployeeCommission[];
  payments: EmployeePayment[];
  allocations: EmployeePaymentAllocation[];
  setPayments: Dispatch<SetStateAction<EmployeePayment[]>>;
  setAllocations: Dispatch<SetStateAction<EmployeePaymentAllocation[]>>;
  setCommissions: Dispatch<SetStateAction<EmployeeCommission[]>>;
  setFlash: (value: string) => void;
}) {
  const { employeeId } = useParams();
  const [form, setForm] = useState({
    paymentDate: '2026-05-01',
    amount: '',
    description: '',
    mode: 'fifo' as 'fifo' | 'manual',
  });
  const [manual, setManual] = useState<Record<string, string>>({});

  if (role !== 'admin') return <Navigate to="/" replace />;
  const employee = employees.find((row) => row.id === employeeId);
  if (!employee) return <PageShell title="Employee Profile" subtitle="Not found" />;

  const openCommissions = getOpenCommissionsForEmployee(employee.id, commissions, allocations);
  const rows = getEmployeeCommissionLedgerRows(employee.id, commissions, payments);
  let running = 0;

  const submit = () => {
    const amount = Number(form.amount);
    if (amount <= 0) {
      setFlash('Invalid payment amount.');
      return;
    }

    let allocationRows: { commissionId: string; allocatedAmount: number }[] = [];
    if (form.mode === 'fifo') {
      let left = amount;
      for (const open of [...openCommissions].sort((a, b) =>
        `${a.commission.periodYear}-${a.commission.periodMonth}`.localeCompare(
          `${b.commission.periodYear}-${b.commission.periodMonth}`,
        ),
      )) {
        if (left <= 0) break;
        const allocatedAmount = Math.min(left, open.remaining);
        if (allocatedAmount > 0) {
          allocationRows.push({ commissionId: open.commission.id, allocatedAmount });
          left -= allocatedAmount;
        }
      }
    } else {
      allocationRows = Object.entries(manual)
        .filter(([, value]) => Number(value) > 0)
        .map(([commissionId, value]) => ({ commissionId, allocatedAmount: Number(value) }));
      const total = allocationRows.reduce((sum, row) => sum + row.allocatedAmount, 0);
      if (Math.abs(total - amount) > 0.001) {
        setFlash('Manual allocation must equal payment amount.');
        return;
      }
      for (const row of allocationRows) {
        const open = openCommissions.find((item) => item.commission.id === row.commissionId);
        if (!open || row.allocatedAmount > open.remaining) {
          setFlash('Invalid allocation.');
          return;
        }
      }
    }

    if (allocationRows.length === 0) {
      setFlash('No open commission balance is available for this payment.');
      return;
    }

    const paymentId = `ep-${Date.now()}`;
    setPayments((previous) => [
      ...previous,
      {
        id: paymentId,
        employeeId: employee.id,
        amount,
        currency: 'USD',
        paymentDate: form.paymentDate,
        description: form.description || 'Commission payment',
        allocationMode: form.mode,
        createdBy: 'admin',
        createdAt: new Date().toISOString(),
      },
    ]);
    const nextAllocations = allocationRows.map((row, index) => ({
      id: `${paymentId}-${index}`,
      paymentId,
      commissionId: row.commissionId,
      allocatedAmount: row.allocatedAmount,
    }));
    setAllocations((previous) => [...previous, ...nextAllocations]);
    setCommissions((previous) =>
      previous.map((commission) => {
        if (commission.employeeId !== employee.id) return commission;
        const paidAmount = getEmployeeCommissionPaidAmount(commission.id, [...allocations, ...nextAllocations]);
        const remainingAmount = Math.max(commission.commissionAmount - paidAmount, 0);
        return {
          ...commission,
          paidAmount,
          remainingAmount,
          status: remainingAmount === 0 ? 'paid' : paidAmount > 0 ? 'partially_paid' : 'open',
        };
      }),
    );
    setFlash('Employee payment recorded.');
  };

  return (
    <PageShell title="Employee Profile / Commission Ledger" subtitle={employee.name}>
      <div className="grid md:grid-cols-4 gap-3">
        <SummaryCard
          label="Open Commission Balance"
          value={formatUsd(getEmployeeOpenCommissionBalance(employee.id, commissions, allocations))}
        />
        <SummaryCard
          label="Current Month Commission"
          value={formatUsd(getCurrentMonthEmployeeCommission(employee.id, commissions))}
        />
        <SummaryCard
          label="Total Paid Commission"
          value={formatUsd(
            commissions
              .filter((commission) => commission.employeeId === employee.id)
              .reduce((total, commission) => total + commission.paidAmount, 0),
          )}
        />
        <SummaryCard
          label="Last Payment"
          value={formatUsd(payments.filter((payment) => payment.employeeId === employee.id).slice(-1)[0]?.amount || 0)}
        />
      </div>

      <div className="bg-white border rounded-lg p-4">
        <h3 className="font-medium mb-2">Record Employee Payment</h3>
        <div className="grid md:grid-cols-4 gap-2">
          <input
            type="date"
            className="border rounded px-2 py-1"
            value={form.paymentDate}
            onChange={(event) => setForm({ ...form, paymentDate: event.target.value })}
          />
          <input
            type="number"
            min="0.01"
            className="border rounded px-2 py-1"
            value={form.amount}
            onChange={(event) => setForm({ ...form, amount: event.target.value })}
            placeholder="Amount"
          />
          <input
            className="border rounded px-2 py-1"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            placeholder="Description"
          />
          <select
            className="border rounded px-2 py-1"
            value={form.mode}
            onChange={(event) => setForm({ ...form, mode: event.target.value as 'fifo' | 'manual' })}
          >
            <option value="fifo">FIFO</option>
            <option value="manual">Manual</option>
          </select>
        </div>
        {form.mode === 'manual' &&
          openCommissions.map((open) => (
            <div key={open.commission.id} className="text-sm mt-1">
              {open.commission.periodYear}-{open.commission.periodMonth} rem {formatUsd(open.remaining)}
              <input
                type="number"
                className="border rounded px-1 py-0.5 ml-2"
                value={manual[open.commission.id] || ''}
                onChange={(event) => setManual({ ...manual, [open.commission.id]: event.target.value })}
              />
            </div>
          ))}
        <button className="bg-indigoBrand text-white px-3 py-1 rounded mt-2" onClick={submit}>
          Record Employee Payment
        </button>
      </div>

      {rows.length === 0 && (
        <div className="bg-white border rounded-lg p-4 text-slate-500">No commission or payment records yet.</div>
      )}
      <table className="w-full bg-white border rounded-lg text-sm">
        <thead className="bg-slate-100">
          <tr>
            <th className="p-2 text-left">Date</th>
            <th>Type</th>
            <th>Amount</th>
            <th>Running</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            running += row.amount;
            return (
              <tr key={`${row.date}-${index}`} className="border-t">
                <td className="p-2">{row.date}</td>
                <td>{row.kind}</td>
                <td>{formatUsd(row.amount)}</td>
                <td>{formatUsd(running)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </PageShell>
  );
}

export function AssignmentsPage({ employees, dealers }: { employees: Employee[]; dealers: Dealer[] }) {
  const rows = employees.flatMap((employee) =>
    employee.assignments.map((assignment) => ({
      employee,
      assignment,
      dealer: dealers.find((dealer) => dealer.storeId === assignment.storeId),
      store: stores.find((store) => store.id === assignment.storeId),
    })),
  );

  return (
    <PageShell title="Assignments" subtitle="Current mock store access and commission assignments">
      <table className="w-full bg-white border rounded-lg text-sm">
        <thead className="bg-slate-100">
          <tr>
            <th className="p-3 text-left">Employee</th>
            <th>Assigned Store</th>
            <th>Commission Rate</th>
            <th>Can View Transactions</th>
            <th>Can Add Transactions</th>
            <th>Can Edit Transactions</th>
            <th>Can View Commission</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.employee.id}-${row.assignment.storeId}`} className="border-t">
              <td className="p-3">{row.employee.name}</td>
              <td>{row.store?.name || row.dealer?.name || row.assignment.storeId}</td>
              <td>{row.assignment.commissionRatePct}%</td>
              <td>Yes</td>
              <td>Yes</td>
              <td>No</td>
              <td>Yes</td>
            </tr>
          ))}
        </tbody>
      </table>
    </PageShell>
  );
}

export function SettingsPage({ onResetDemoData }: { onResetDemoData: () => void }) {
  return (
    <PageShell title="Settings" subtitle="Demo environment controls">
      <div className="bg-white border rounded-lg p-4">
        <p className="text-sm text-slate-600 mb-2">Local demo data is persisted in your browser storage.</p>
        <button className="bg-red-600 text-white px-3 py-2 rounded" onClick={onResetDemoData}>
          Reset Demo Data
        </button>
      </div>
    </PageShell>
  );
}

export function MyCommissionsPage({
  role,
  employee,
  commissions,
  payments,
  allocations,
}: {
  role: Role;
  employee: Employee;
  dealers: Dealer[];
  commissions: EmployeeCommission[];
  payments: EmployeePayment[];
  allocations: EmployeePaymentAllocation[];
}) {
  if (role !== 'employee') {
    return <PageShell title="My Commissions" subtitle="Switch to employee role to view this page" />;
  }

  const rows = getEmployeeCommissionLedgerRows(employee.id, commissions, payments);

  return (
    <PageShell title="My Commissions" subtitle="Your commission ledger">
      <div className="grid md:grid-cols-2 gap-3">
        <SummaryCard
          label="My open commission balance"
          value={formatUsd(getEmployeeOpenCommissionBalance(employee.id, commissions, allocations))}
        />
        <SummaryCard
          label="My current month commission"
          value={formatUsd(getCurrentMonthEmployeeCommission(employee.id, commissions))}
        />
      </div>
      {rows.length === 0 && (
        <div className="bg-white border rounded-lg p-4 text-slate-500">No commission or payment records yet.</div>
      )}
      <table className="w-full bg-white border rounded-lg text-sm">
        <thead className="bg-slate-100">
          <tr>
            <th className="p-2 text-left">Date</th>
            <th>Type</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.date}-${index}`} className="border-t">
              <td className="p-2">{row.date}</td>
              <td>{row.kind}</td>
              <td>{formatUsd(row.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </PageShell>
  );
}
