import { Link, Navigate, useParams } from 'react-router-dom';
import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
  Assignment,
  AssignmentStatus,
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
import { Button, DataTable, EmptyState, SectionCard } from '../components/ui/Primitives';

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
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigoBrand to-indigo-400" />
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
      {helper && <p className="mt-2 text-xs leading-5 text-slate-500">{helper}</p>}
    </div>
  );
}

function InfoCallout({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-sm text-indigo-900">
      {children}
    </div>
  );
}

function FormLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 text-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function PermissionBadge({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={
        enabled
          ? 'inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200'
          : 'inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200'
      }
    >
      {enabled ? 'Enabled' : 'Restricted'}
    </span>
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
    <SectionCard
      title="Calculation Breakdown"
      subtitle="Confirmed transactions only are included in statement totals."
      action={<StatusBadge status={statement.status} />}
    >
      <div className="space-y-4 p-5">
        <InfoCallout>{bankPayoutHelper}</InfoCallout>
        <div className="grid gap-3 md:grid-cols-4">
        {rows.map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-base font-semibold text-slate-950">{formatUsd(Number(value))}</p>
          </div>
        ))}
        </div>
      </div>
    </SectionCard>
  );
}

interface DealerProfilePageProps {
  role: Role;
  assignedStoreIds: string[];
  addTransactionStoreIds: string[];
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
  addTransactionStoreIds,
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
  const canAddDealerTransaction = role === 'admin' || addTransactionStoreIds.includes(dealer.storeId);

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
    <PageShell title="Dealer Profile" subtitle={`${dealer.name} account overview and settlement ledger`}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
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

      <InfoCallout>{bankPayoutHelper}</InfoCallout>

      {role === 'admin' && (
        <div className="grid gap-5 xl:grid-cols-3">
          <SectionCard title="New Statement" subtitle="Create a mock monthly statement for this dealer.">
            <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end">
              <FormLabel label="Statement month">
                <input
                  type="month"
                  className="h-10 w-full px-3"
                  value={month}
                  onChange={(event) => setMonth(event.target.value)}
                />
              </FormLabel>
              <Button variant="primary" onClick={createStatement}>
                New Statement
              </Button>
            </div>
          </SectionCard>

          <SectionCard
            className="xl:col-span-2"
            title="Record Payment"
            subtitle="Allocate dealer payments with FIFO or manual statement allocation."
          >
            <div className="space-y-4 p-5">
              <div className="grid gap-3 md:grid-cols-4">
                <FormLabel label="Payment date">
                  <input
                    type="date"
                    className="h-10 w-full px-3"
                    value={payForm.paymentDate}
                    onChange={(event) => setPayForm({ ...payForm, paymentDate: event.target.value })}
                  />
                </FormLabel>
                <FormLabel label="Amount">
                  <input
                    placeholder="0.00"
                    type="number"
                    min="0.01"
                    className="h-10 w-full px-3"
                    value={payForm.amount}
                    onChange={(event) => setPayForm({ ...payForm, amount: event.target.value })}
                  />
                </FormLabel>
                <FormLabel label="Description">
                  <input
                    placeholder="Dealer payment"
                    className="h-10 w-full px-3"
                    value={payForm.description}
                    onChange={(event) => setPayForm({ ...payForm, description: event.target.value })}
                  />
                </FormLabel>
                <FormLabel label="Allocation mode">
                  <select
                    className="h-10 w-full px-3"
                    value={payForm.mode}
                    onChange={(event) => setPayForm({ ...payForm, mode: event.target.value as 'fifo' | 'manual' })}
                  >
                    <option value="fifo">FIFO</option>
                    <option value="manual">Manual</option>
                  </select>
                </FormLabel>
              </div>

              {payForm.mode === 'fifo' && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  <span className="font-semibold text-slate-700">FIFO preview: </span>
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
                <div className="rounded-xl border border-slate-200">
                  {openStatements.map((open) => (
                    <div
                      key={open.statement.id}
                      className="grid items-center gap-3 border-t border-slate-100 px-4 py-3 text-sm first:border-t-0 md:grid-cols-3"
                    >
                      <span className="font-medium text-slate-900">{open.statement.month}</span>
                      <span className="text-slate-500">Remaining {formatUsd(open.remaining)}</span>
                      <input
                        type="number"
                        min="0"
                        placeholder="Allocate"
                        className="h-9 px-3"
                        value={manual[open.statement.id] || ''}
                        onChange={(event) => setManual({ ...manual, [open.statement.id]: event.target.value })}
                      />
                    </div>
                  ))}
                </div>
              )}

              <Button variant="primary" onClick={submitPayment}>
                Submit Payment
              </Button>
            </div>
          </SectionCard>
        </div>
      )}

      <SectionCard title="Statement Ledger" subtitle="Chronological receivable and payment activity for this dealer.">
        {ledger.length === 0 ? (
          <EmptyState title="No ledger activity yet." />
        ) : (
          <DataTable>
            <thead className="bg-slate-100/70 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right">Running</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((row, index) => {
                running += row.amount;
                const isPayment = row.amount < 0;
                return (
                  <tr
                    key={`${row.date}-${index}`}
                    className={isPayment ? 'border-t border-slate-100 bg-emerald-50/40' : 'border-t border-slate-100 hover:bg-slate-50'}
                  >
                    <td className="px-4 py-3 text-slate-600">{row.date}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{row.kind}</td>
                    <td className="px-4 py-3 text-slate-600">{row.description}</td>
                    <td className={isPayment ? 'px-4 py-3 text-right font-semibold text-emerald-700' : 'px-4 py-3 text-right font-semibold text-slate-950'}>
                      {formatUsd(row.amount)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-950">{formatUsd(running)}</td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </SectionCard>

      <SectionCard title="Statements" subtitle="Statement-level payout, receivable, payment, and remaining balance review.">
        <DataTable>
          <thead className="bg-slate-100/70 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Month</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Platform Payout</th>
              <th className="px-4 py-3 text-right">Company Share</th>
              <th className="px-4 py-3 text-right">Dealer Receivable</th>
              <th className="px-4 py-3 text-right">Paid</th>
              <th className="px-4 py-3 text-right">Remaining</th>
              <th className="px-4 py-3 text-right">Actions</th>
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
                <tr key={statement.id} className="border-t border-slate-100 transition hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-950">{statement.month}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={statement.status} />
                  </td>
                  <td className="px-4 py-3 text-right">{formatUsd(totals.total_bank_payouts)}</td>
                  <td className="px-4 py-3 text-right">{formatUsd(totals.company_share_amount)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-950">{formatUsd(totals.dealer_receivable_amount)}</td>
                  <td className="px-4 py-3 text-right text-emerald-700">{formatUsd(totals.paid_amount)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-950">{formatUsd(totals.remaining_amount)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Link className="rounded-lg px-2.5 py-1.5 font-medium text-indigoBrand hover:bg-indigo-50" to={`/statements/${statement.id}`}>
                        View
                      </Link>
                      {role === 'employee' && canAddDealerTransaction && (
                        <Link className="rounded-lg px-2.5 py-1.5 font-medium text-indigoBrand hover:bg-indigo-50" to={`/statements/${statement.id}#add-transaction`}>
                          Add Transaction
                        </Link>
                      )}
                      {role === 'admin' && (
                        <button
                          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-indigoBrand hover:bg-indigo-50"
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
                          Close
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </SectionCard>
    </PageShell>
  );
}

interface StatementDetailPageProps {
  role: Role;
  assignedStoreIds: string[];
  addTransactionStoreIds: string[];
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
  addTransactionStoreIds,
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
  const canAddTransaction = role === 'admin' || addTransactionStoreIds.includes(dealer.storeId);

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
    <PageShell title="Statement Detail" subtitle={`${dealer.name} · ${statement.month} financial review`}>
      <StatementBreakdown statement={statement} dealer={dealer} transactions={transactions} allocations={allocations} />

      {canAddTransaction ? (
        <SectionCard
          title="Add Transaction"
          subtitle={role === 'employee' ? 'Employee submissions enter the review queue.' : 'Admin-created transactions are confirmed immediately.'}
        >
          <div id="add-transaction" className="space-y-4 p-5">
            {role === 'employee' ? (
              <InfoCallout>Your transaction will be submitted for admin review and will not affect totals until approved.</InfoCallout>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Admin-created transactions are confirmed immediately.
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-4">
              <FormLabel label="Date">
                <input
                  type="date"
                  aria-label="Transaction date"
                  value={form.date}
                  onChange={(event) => setForm({ ...form, date: event.target.value })}
                  className="h-10 w-full px-3"
                />
              </FormLabel>
              <FormLabel label="Type">
                <select
                  aria-label="Transaction type"
                  value={form.type}
                  onChange={(event) => setForm({ ...form, type: event.target.value as TransactionType })}
                  className="h-10 w-full px-3"
                >
                  {transactionTypes.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </FormLabel>
              <FormLabel label="Amount">
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(event) => setForm({ ...form, amount: event.target.value })}
                  className="h-10 w-full px-3"
                  placeholder="0.00"
                />
              </FormLabel>
              <FormLabel label="Description">
                <input
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  className="h-10 w-full px-3"
                  placeholder="Description"
                />
              </FormLabel>
              <FormLabel label="Order code">
                <input
                  value={form.orderCode}
                  onChange={(event) => setForm({ ...form, orderCode: event.target.value })}
                  className="h-10 w-full px-3"
                  placeholder="Optional"
                />
              </FormLabel>
              {form.type === 'manual_adjustment' && (
                <>
                  <FormLabel label="Adjustment scope">
                    <select
                      aria-label="Manual adjustment scope"
                      value={form.adjustmentScope}
                      onChange={(event) =>
                        setForm({ ...form, adjustmentScope: event.target.value as ManualAdjustmentScope })
                      }
                      className="h-10 w-full px-3"
                    >
                      {adjustmentScopes.map((scope) => (
                        <option key={scope}>{scope}</option>
                      ))}
                    </select>
                  </FormLabel>
                  <FormLabel label="Direction">
                    <select
                      aria-label="Manual adjustment direction"
                      value={form.adjustmentDirection}
                      onChange={(event) =>
                        setForm({ ...form, adjustmentDirection: event.target.value as ManualAdjustmentDirection })
                      }
                      className="h-10 w-full px-3"
                    >
                      {adjustmentDirections.map((direction) => (
                        <option key={direction}>{direction}</option>
                      ))}
                    </select>
                  </FormLabel>
                </>
              )}
            </div>
            <Button variant="primary" onClick={addTransaction}>
              Add Transaction
            </Button>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Transaction Ledger" subtitle="Pending and rejected rows are separated visually from confirmed activity.">
        <DataTable>
          <thead className="bg-slate-100/70 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Description</th>
            </tr>
          </thead>
          <tbody>
            {txns.map((transaction) => (
              <tr
                key={transaction.id}
                className={`border-t border-slate-100 ${
                  transaction.status === 'confirmed'
                    ? 'transition hover:bg-slate-50'
                    : transaction.status === 'rejected'
                      ? 'bg-red-50/70 text-red-900'
                      : 'bg-amber-50/70 text-amber-900'
                }`}
              >
                <td className="px-4 py-3">{transaction.date}</td>
                <td className="px-4 py-3 font-medium">{transaction.type}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={transaction.status} />
                </td>
                <td className="px-4 py-3 text-right font-semibold">{formatUsd(transaction.amount)}</td>
                <td className="px-4 py-3">{transaction.orderCode || '-'}</td>
                <td className="px-4 py-3">{transaction.description || '-'}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </SectionCard>

      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard title="Payment Allocations" subtitle="Dealer payments allocated to this statement.">
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Paid amount</p>
              <p className="mt-1 text-xl font-semibold text-emerald-700">{formatUsd(totals.paid_amount)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Remaining amount</p>
              <p className="mt-1 text-xl font-semibold text-slate-950">{formatUsd(totals.remaining_amount)}</p>
            </div>
          </div>
          {statementAllocations.length === 0 ? (
            <EmptyState title="No payment allocation rows yet." />
          ) : (
            <div className="divide-y divide-slate-100 px-5 pb-5 text-sm">
              {statementAllocations.map((allocation) => (
                <div key={allocation.id} className="flex items-center justify-between py-3">
                  <span className="font-medium text-slate-900">{allocation.paymentId}</span>
                  <span className="font-semibold text-emerald-700">{formatUsd(allocation.allocatedAmount)}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {role === 'admin' && (
          <SectionCard title="Employee Commission Preview" subtitle="Estimated commission from current statement totals.">
            {commissionPreviews.length === 0 ? (
              <EmptyState title="No employee commission assignment for this dealer." />
            ) : (
              <DataTable>
                <thead className="bg-slate-100/70 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Assigned Employee</th>
                    <th className="px-4 py-3 text-right">Rate</th>
                    <th className="px-4 py-3 text-right">Commission Base</th>
                    <th className="px-4 py-3 text-right">Estimated Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {commissionPreviews.map((preview) => (
                    <tr key={preview.employee.id} className="border-t border-slate-100 transition hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-950">{preview.employee.name}</td>
                      <td className="px-4 py-3 text-right">{preview.assignment.commissionRatePct}%</td>
                      <td className="px-4 py-3 text-right">{formatUsd(preview.commissionBase)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-950">{formatUsd(preview.estimatedCommission)}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </SectionCard>
        )}
      </div>
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
  const pendingRows = rows.filter((transaction) => transaction.status === 'pending_review');

  return (
    <PageShell title="Transactions" subtitle="Global transaction management and approval queue">
      <SectionCard title="Transaction Filters" subtitle="Narrow the approval and ledger views without changing mock data.">
        <div className="grid gap-3 p-5 md:grid-cols-4">
          <FormLabel label="Dealer">
            <select
              className="h-10 w-full px-3"
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
          </FormLabel>
          <FormLabel label="Type">
            <select
              className="h-10 w-full px-3"
              value={filters.type}
              onChange={(event) => setFilters({ ...filters, type: event.target.value })}
            >
              <option value="">All types</option>
              {transactionTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </FormLabel>
          <FormLabel label="Status">
            <select
              className="h-10 w-full px-3"
              value={filters.status}
              onChange={(event) => setFilters({ ...filters, status: event.target.value })}
            >
              <option value="">All status</option>
              <option>confirmed</option>
              <option>pending_review</option>
              <option>rejected</option>
            </select>
          </FormLabel>
          <FormLabel label="Search">
            <input
              className="h-10 w-full px-3"
              placeholder="Order or description"
              value={filters.q}
              onChange={(event) => setFilters({ ...filters, q: event.target.value })}
            />
          </FormLabel>
        </div>
      </SectionCard>

      <SectionCard className="border-amber-200 shadow-amber-50" title="Approval Queue" subtitle="Employee-submitted transactions waiting for admin review.">
        {pendingRows.length === 0 ? (
          <EmptyState title="No transactions are waiting for review." />
        ) : (
          <DataTable>
            <thead className="bg-amber-50/80 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Dealer</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Submitted By</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingRows.map((transaction) => (
                <tr key={transaction.id} className="border-t border-amber-100 bg-amber-50/50">
                  <td className="px-4 py-3">{transaction.date}</td>
                  <td className="px-4 py-3 font-medium text-slate-950">{dealers.find((dealer) => dealer.id === transaction.dealerId)?.name}</td>
                  <td className="px-4 py-3">{transaction.type}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatUsd(transaction.amount)}</td>
                  <td className="px-4 py-3">{transaction.createdByRole || 'admin'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="primary" onClick={() => updateStatus(transaction.id, 'confirmed')}>
                        Approve
                      </Button>
                      <Button variant="danger" onClick={() => updateStatus(transaction.id, 'rejected')}>
                        Reject
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </SectionCard>

      <SectionCard title="Transaction Ledger" subtitle="All visible transactions matching the current filters.">
        {rows.length === 0 ? (
          <EmptyState title="No transactions match the current filters." />
        ) : (
          <DataTable>
            <thead className="bg-slate-100/70 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Dealer</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((transaction) => (
                <tr
                  key={transaction.id}
                  className={`border-t border-slate-100 ${
                    transaction.status === 'pending_review'
                      ? 'bg-amber-50/60'
                      : transaction.status === 'rejected'
                        ? 'bg-red-50/60'
                        : 'transition hover:bg-slate-50'
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-slate-950">{dealers.find((dealer) => dealer.id === transaction.dealerId)?.name}</td>
                  <td className="px-4 py-3">{transaction.type}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={transaction.status} />
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{formatUsd(transaction.amount)}</td>
                  <td className="px-4 py-3">{transaction.orderCode || '-'}</td>
                  <td className="px-4 py-3 text-right">
                    {role === 'admin' && transaction.status === 'pending_review' && (
                      <div className="flex justify-end gap-2">
                        <Button variant="primary" onClick={() => updateStatus(transaction.id, 'confirmed')}>
                          Approve
                        </Button>
                        <Button variant="danger" onClick={() => updateStatus(transaction.id, 'rejected')}>
                          Reject
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </SectionCard>
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
    <PageShell title="Employee Profile" subtitle={`${employee.name} commission ledger and payment workspace`}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Open Commission Balance"
          value={formatUsd(getEmployeeOpenCommissionBalance(employee.id, commissions, allocations))}
          helper="Remaining unpaid generated commissions."
        />
        <SummaryCard
          label="Current Month Commission"
          value={formatUsd(getCurrentMonthEmployeeCommission(employee.id, commissions))}
          helper="Generated from eligible assigned statements."
        />
        <SummaryCard
          label="Total Paid Commission"
          value={formatUsd(
            commissions
              .filter((commission) => commission.employeeId === employee.id)
              .reduce((total, commission) => total + commission.paidAmount, 0),
          )}
          helper="Paid amounts recorded on commission rows."
        />
        <SummaryCard
          label="Last Payment"
          value={formatUsd(payments.filter((payment) => payment.employeeId === employee.id).slice(-1)[0]?.amount || 0)}
          helper="Most recent employee payment amount."
        />
      </div>

      <SectionCard title="Record Employee Payment" subtitle="Allocate commission payments with FIFO or manual controls.">
        <div className="space-y-4 p-5">
          <div className="grid gap-3 md:grid-cols-4">
            <FormLabel label="Payment date">
              <input
                type="date"
                className="h-10 w-full px-3"
                value={form.paymentDate}
                onChange={(event) => setForm({ ...form, paymentDate: event.target.value })}
              />
            </FormLabel>
            <FormLabel label="Amount">
              <input
                type="number"
                min="0.01"
                className="h-10 w-full px-3"
                value={form.amount}
                onChange={(event) => setForm({ ...form, amount: event.target.value })}
                placeholder="0.00"
              />
            </FormLabel>
            <FormLabel label="Description">
              <input
                className="h-10 w-full px-3"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="Commission payment"
              />
            </FormLabel>
            <FormLabel label="Allocation mode">
              <select
                className="h-10 w-full px-3"
                value={form.mode}
                onChange={(event) => setForm({ ...form, mode: event.target.value as 'fifo' | 'manual' })}
              >
                <option value="fifo">FIFO</option>
                <option value="manual">Manual</option>
              </select>
            </FormLabel>
          </div>

          {form.mode === 'fifo' && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              FIFO applies payment to the oldest open commission rows first.
            </div>
          )}

          {form.mode === 'manual' && (
            <div className="rounded-xl border border-slate-200">
              {openCommissions.map((open) => (
                <div
                  key={open.commission.id}
                  className="grid items-center gap-3 border-t border-slate-100 px-4 py-3 text-sm first:border-t-0 md:grid-cols-3"
                >
                  <span className="font-medium text-slate-950">
                    {open.commission.periodYear}-{open.commission.periodMonth}
                  </span>
                  <span className="text-slate-500">Remaining {formatUsd(open.remaining)}</span>
                  <input
                    type="number"
                    className="h-9 px-3"
                    value={manual[open.commission.id] || ''}
                    onChange={(event) => setManual({ ...manual, [open.commission.id]: event.target.value })}
                    placeholder="Allocate"
                  />
                </div>
              ))}
            </div>
          )}

          <Button variant="primary" onClick={submit}>
            Record Employee Payment
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Commission Ledger" subtitle="Commission accruals and employee payment activity.">
        {rows.length === 0 ? (
          <EmptyState title="No commission or payment records yet." />
        ) : (
          <DataTable>
            <thead className="bg-slate-100/70 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right">Running</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                running += row.amount;
                const isPayment = row.amount < 0;
                return (
                  <tr
                    key={`${row.date}-${index}`}
                    className={isPayment ? 'border-t border-slate-100 bg-emerald-50/40' : 'border-t border-slate-100 transition hover:bg-slate-50'}
                  >
                    <td className="px-4 py-3 text-slate-600">{row.date}</td>
                    <td className="px-4 py-3 font-medium text-slate-950">{row.kind}</td>
                    <td className={isPayment ? 'px-4 py-3 text-right font-semibold text-emerald-700' : 'px-4 py-3 text-right font-semibold text-slate-950'}>
                      {formatUsd(row.amount)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-950">{formatUsd(running)}</td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </SectionCard>
    </PageShell>
  );
}

export function AssignmentsPage({
  employees,
  dealers,
  onUpdateAssignment,
}: {
  employees: Employee[];
  dealers: Dealer[];
  onUpdateAssignment: (employeeId: string, assignment: Assignment) => void;
}) {
  const [editing, setEditing] = useState<null | {
    employeeId: string;
    employeeName: string;
    storeName: string;
    assignment: Assignment;
    rate: string;
  }>(null);
  const [error, setError] = useState('');
  const rows = employees.flatMap((employee) =>
    employee.assignments.map((assignment) => ({
      employee,
      assignment,
      dealer: dealers.find((dealer) => dealer.storeId === assignment.storeId),
      store: stores.find((store) => store.id === assignment.storeId),
    })),
  );

  const openEditor = (row: (typeof rows)[number]) => {
    setError('');
    setEditing({
      employeeId: row.employee.id,
      employeeName: row.employee.name,
      storeName: row.store?.name || row.dealer?.name || row.assignment.storeId,
      assignment: { ...row.assignment },
      rate: String(row.assignment.commissionRatePct),
    });
  };

  const updateEditingAssignment = (patch: Partial<Assignment>) => {
    setEditing((current) =>
      current ? { ...current, assignment: { ...current.assignment, ...patch } } : current,
    );
  };

  const saveAssignment = () => {
    if (!editing) return;
    const trimmedRate = editing.rate.trim();
    if (!trimmedRate) {
      setError('Commission rate is required.');
      return;
    }

    const commissionRatePct = Number(trimmedRate);
    if (!Number.isFinite(commissionRatePct) || commissionRatePct < 0 || commissionRatePct > 100) {
      setError('Commission rate must be a number between 0 and 100.');
      return;
    }

    onUpdateAssignment(editing.employeeId, {
      ...editing.assignment,
      commissionRatePct,
    });
    setEditing(null);
    setError('');
  };

  return (
    <PageShell title="Assignments" subtitle="Current mock store access and commission assignments">
      <SectionCard
        title="Assignment Matrix"
        subtitle="Rate changes apply to future generated commissions only; existing commission rows are not regenerated automatically."
      >
        <DataTable>
          <thead className="bg-slate-100/70 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Assigned Store</th>
              <th className="px-4 py-3 text-right">Commission Rate</th>
              <th className="px-4 py-3">View Transactions</th>
              <th className="px-4 py-3">Add Transactions</th>
              <th className="px-4 py-3">Edit Transactions</th>
              <th className="px-4 py-3">View Commission</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.employee.id}-${row.assignment.storeId}`} className="border-t border-slate-100 transition hover:bg-slate-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-950">{row.employee.name}</p>
                  <p className="text-xs text-slate-500">{row.employee.roleTitle}</p>
                </td>
                <td className="px-4 py-3 font-medium text-slate-900">{row.store?.name || row.dealer?.name || row.assignment.storeId}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-950">{row.assignment.commissionRatePct}%</td>
                <td className="px-4 py-3"><PermissionBadge enabled={row.assignment.canViewTransactions} /></td>
                <td className="px-4 py-3"><PermissionBadge enabled={row.assignment.canAddTransactions} /></td>
                <td className="px-4 py-3"><PermissionBadge enabled={row.assignment.canEditTransactions} /></td>
                <td className="px-4 py-3"><PermissionBadge enabled={row.assignment.canViewCommission} /></td>
                <td className="px-4 py-3"><StatusBadge status={row.assignment.status} /></td>
                <td className="px-4 py-3 text-right">
                  <button
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                    onClick={() => openEditor(row)}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </SectionCard>

      {editing && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/30 px-4 py-6">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="border-b border-slate-200 bg-gradient-to-b from-white to-slate-50 px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigoBrand">
                Assignment Management
              </p>
              <h3 className="mt-1 text-lg font-semibold text-slate-950">Edit Assignment</h3>
              <p className="mt-1 text-sm text-slate-500">
                {editing.employeeName} · {editing.storeName}
              </p>
            </div>

            <div className="space-y-5 p-5">
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {error}
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <FormLabel label="Commission rate">
                  <input
                    aria-label="Commission rate"
                    className="h-10 w-full px-3"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={editing.rate}
                    onChange={(event) => setEditing({ ...editing, rate: event.target.value })}
                  />
                </FormLabel>

                <FormLabel label="Status">
                  <select
                    aria-label="Assignment status"
                    className="h-10 w-full px-3"
                    value={editing.assignment.status}
                    onChange={(event) =>
                      updateEditingAssignment({ status: event.target.value as AssignmentStatus })
                    }
                  >
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                  </select>
                </FormLabel>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {[
                  ['Can view transactions', 'canViewTransactions'],
                  ['Can add transactions', 'canAddTransactions'],
                  ['Can edit transactions', 'canEditTransactions'],
                  ['Can view commission', 'canViewCommission'],
                ].map(([label, key]) => (
                  <label
                    key={key}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700"
                  >
                    <span>{label}</span>
                    <input
                      aria-label={label}
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-indigoBrand"
                      checked={Boolean(editing.assignment[key as keyof Assignment])}
                      onChange={(event) =>
                        updateEditingAssignment({ [key]: event.target.checked } as Partial<Assignment>)
                      }
                    />
                  </label>
                ))}
              </div>

              <InfoCallout>
                Commission rate changes affect future generated commission rows only. Existing paid or open commission rows are not recalculated by this edit.
              </InfoCallout>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <Button onClick={() => setEditing(null)}>Cancel</Button>
              <Button variant="primary" onClick={saveAssignment}>
                Save Assignment
              </Button>
            </div>
          </div>
        </div>
      )}
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
