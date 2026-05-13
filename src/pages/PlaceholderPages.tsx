import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
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
  PendingOrderCost,
  PendingOrderCostScope,
  PendingOrderCostStatus,
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
  sortStatementsByPeriod,
} from '../lib/statementCalculations';
import { PageShell } from './Shared';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Button, DataTable, EmptyState, SectionCard } from '../components/ui/Primitives';
import type {
  PendingOrderCostInput,
  PendingOrderCostUpdateInput,
  RecordDealerPaymentInput,
  RecordEmployeePaymentInput,
  ResolvePendingOrderCostInput,
  UpdateTransactionInput,
} from '../lib/settlementActivityService';
import {
  currencyOptions,
  formatCurrencyAmount,
  formatExchangeRate,
  formatOriginalMoney,
  formatTransactionType,
  formatUsdAmount,
  roundUsdAmount,
  platformPayoutHelper,
  type SupportedCurrency,
} from '../lib/displayLabels';
import { fetchExchangeRateToUsd } from '../lib/exchangeRateService';
import { downloadDealerAccountStatementPdf, downloadStatementPdf } from '../lib/statementPdf';

const transactionTypes: TransactionType[] = [
  'bank_payout',
  'store_expense',
  'printing_cost',
  'shipping_cost',
  'manual_adjustment',
];
const employeePaymentCurrencyOptions: SupportedCurrency[] = ['TRY', 'USD', 'AUD'];
const dealerStatuses: Dealer['status'][] = ['active', 'review', 'inactive'];
const adjustmentScopes: ManualAdjustmentScope[] = [
  'dealer_receivable_only',
  'shareable_net',
  'employee_commission_base',
];
const adjustmentDirections: ManualAdjustmentDirection[] = ['increase', 'decrease'];

function parsePositiveNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseOptionalNonNegativeNumber(value: string) {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1).replace(/\.0$/, '')}%`;
}

function formatPercentInput(value: number) {
  return (value * 100).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function getExchangeRateForSave(currency: SupportedCurrency, value: string) {
  if (currency === 'USD' && value.trim() === '') return 1;
  return parsePositiveNumber(value);
}

function formatRateForInput(rate: number) {
  return rate.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
}

function calculateUsdPreview(amountValue: string, currency: SupportedCurrency, rateValue: string) {
  const originalAmount = parsePositiveNumber(amountValue);
  const exchangeRate = getExchangeRateForSave(currency, rateValue);
  if (!originalAmount || !exchangeRate) return 0;
  return roundUsdAmount(originalAmount * exchangeRate);
}

function handleCurrencyChange<T extends { currency: SupportedCurrency; exchangeRateToUsd: string }>(
  state: T,
  currency: SupportedCurrency,
): T {
  return {
    ...state,
    currency,
    exchangeRateToUsd: currency === 'USD' ? '1' : state.currency === 'USD' ? '' : state.exchangeRateToUsd,
  };
}

function MoneyConversionPreview({
  amount,
  currency,
  exchangeRateToUsd,
}: {
  amount: string;
  currency: SupportedCurrency;
  exchangeRateToUsd: string;
}) {
  const usdAmount = calculateUsdPreview(amount, currency, exchangeRateToUsd);
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">USD Equivalent</span>
      <p className="mt-1 text-base font-semibold text-slate-950">{formatUsdAmount(usdAmount)}</p>
    </div>
  );
}

interface ExchangeRateLookupState {
  loading: boolean;
  error: string;
  sourceDate: string;
  source: string;
}

function useExchangeRateAutofill({
  currency,
  date,
  setExchangeRateToUsd,
}: {
  currency: SupportedCurrency;
  date: string;
  setExchangeRateToUsd: (value: string) => void;
}) {
  const [lookup, setLookup] = useState<ExchangeRateLookupState>({
    loading: false,
    error: '',
    sourceDate: '',
    source: '',
  });
  const manualOverrideRef = useRef(false);
  const setRateRef = useRef(setExchangeRateToUsd);

  useEffect(() => {
    setRateRef.current = setExchangeRateToUsd;
  }, [setExchangeRateToUsd]);

  useEffect(() => {
    let cancelled = false;
    manualOverrideRef.current = false;

    if (currency === 'USD') {
      setRateRef.current('1');
      setLookup({ loading: false, error: '', sourceDate: date, source: 'USD' });
      return () => {
        cancelled = true;
      };
    }

    if (!date) {
      setLookup({ loading: false, error: 'Select a date before fetching a rate.', sourceDate: '', source: '' });
      return () => {
        cancelled = true;
      };
    }

    setLookup({ loading: true, error: '', sourceDate: '', source: 'Frankfurter' });
    void fetchExchangeRateToUsd(currency, date)
      .then((result) => {
        if (cancelled) return;
        if (!manualOverrideRef.current) {
          setRateRef.current(formatRateForInput(result.rate));
        }
        setLookup({
          loading: false,
          error: '',
          sourceDate: result.sourceDate,
          source: result.source,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setLookup({
          loading: false,
          error: 'Could not fetch rate. Please enter manually.',
          sourceDate: '',
          source: 'Frankfurter',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [currency, date]);

  const markManualOverride = () => {
    manualOverrideRef.current = true;
  };

  return { lookup, markManualOverride };
}

function ExchangeRateLookupStatus({ lookup }: { lookup: ExchangeRateLookupState }) {
  if (lookup.loading) {
    return <p className="text-xs text-slate-500">Fetching Frankfurter exchange rate...</p>;
  }

  if (lookup.error) {
    return <p className="text-xs font-medium text-amber-700">{lookup.error}</p>;
  }

  if (lookup.sourceDate) {
    return (
      <p className="text-xs text-slate-500">
        Rate source: {lookup.source} {lookup.sourceDate}. You can override it manually.
      </p>
    );
  }

  return null;
}
function SummaryCard({ label, value, helper, secondary }: { label: string; value: string; helper?: string; secondary?: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigoBrand to-indigo-400" />
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
      {secondary && <p className="mt-1 text-xs font-medium text-slate-500">{secondary}</p>}
      {helper && <p className="mt-2 text-xs leading-5 text-slate-500">{helper}</p>}
    </div>
  );
}

function formatCommissionPeriod(commission: EmployeeCommission) {
  return `${commission.periodYear}-${String(commission.periodMonth).padStart(2, '0')}`;
}

function formatCommissionRate(rate: number) {
  return `${(rate * 100).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}%`;
}

function getCommissionDealerName(commission: EmployeeCommission, dealers: Dealer[]) {
  const dealer = dealers.find((row) => row.id === commission.dealerId || row.supabaseId === commission.dealerId);
  return dealer?.storeName || dealer?.name || commission.dealerId;
}

function getZeroCommissionNote(commission: EmployeeCommission) {
  if (commission.commissionAmount > 0) return '';
  const costs = commission.printingCosts + commission.shippingCosts;
  if (commission.companyShareAmount <= 0) return 'No company share.';
  if (commission.commissionBase <= 0 && costs > commission.companyShareAmount + commission.commissionBaseAdjustments) {
    return 'Costs exceed company share.';
  }
  if (commission.commissionBase <= 0) return 'Commission base is zero.';
  return 'Commission amount is zero.';
}

function isZeroCommissionRow(commission: EmployeeCommission) {
  return Math.abs(commission.commissionAmount) < 0.001 && Math.abs(commission.remainingAmount) < 0.001;
}

function getCommissionLedgerDetails(commission: EmployeeCommission, dealers: Dealer[]) {
  const zeroNote = getZeroCommissionNote(commission);
  return (
    <div className="space-y-1">
      <p className="font-medium text-slate-900">{getCommissionDealerName(commission, dealers)}</p>
      <p className="text-xs text-slate-500">
        Base {formatUsd(commission.commissionBase)} × {formatCommissionRate(commission.commissionRate)}
      </p>
      {zeroNote && <p className="text-xs font-medium text-amber-700">{zeroNote}</p>}
    </div>
  );
}

function CommissionBreakdownTable({
  commissions,
  dealers,
  allocations,
  showZeroRows,
  onToggleZeroRows,
}: {
  commissions: EmployeeCommission[];
  dealers: Dealer[];
  allocations: EmployeePaymentAllocation[];
  showZeroRows: boolean;
  onToggleZeroRows: () => void;
}) {
  const sortedCommissions = [...commissions].sort((a, b) => {
    const periodCompare = formatCommissionPeriod(a).localeCompare(formatCommissionPeriod(b));
    if (periodCompare !== 0) return periodCompare;
    return getCommissionDealerName(a, dealers).localeCompare(getCommissionDealerName(b, dealers));
  });
  const hiddenZeroCount = sortedCommissions.filter(isZeroCommissionRow).length;
  const rows = showZeroRows ? sortedCommissions : sortedCommissions.filter((commission) => !isZeroCommissionRow(commission));
  const storeSummaries = Array.from(
    sortedCommissions.reduce(
      (map, commission) => {
        const storeName = getCommissionDealerName(commission, dealers);
        const paid = getEmployeeCommissionPaidAmount(commission.id, allocations);
        const remaining = Math.max(commission.commissionAmount - paid, 0);
        const summary = map.get(storeName) || { storeName, total: 0, paid: 0, open: 0 };
        summary.total += commission.commissionAmount;
        summary.paid += paid;
        summary.open += remaining;
        map.set(storeName, summary);
        return map;
      },
      new Map<string, { storeName: string; total: number; paid: number; open: number }>(),
    ).values(),
  ).sort((a, b) => a.storeName.localeCompare(b.storeName));

  return (
    <div className="space-y-4 p-5">
      {storeSummaries.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-3">
          {storeSummaries.map((summary) => (
            <div key={summary.storeName} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm font-semibold text-slate-950">{summary.storeName}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="uppercase tracking-wide text-slate-500">Total</p>
                  <p className="mt-1 font-semibold text-slate-950">{formatUsd(summary.total)}</p>
                </div>
                <div>
                  <p className="uppercase tracking-wide text-slate-500">Open</p>
                  <p className="mt-1 font-semibold text-amber-700">{formatUsd(summary.open)}</p>
                </div>
                <div>
                  <p className="uppercase tracking-wide text-slate-500">Paid</p>
                  <p className="mt-1 font-semibold text-emerald-700">{formatUsd(summary.paid)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">
          Zero commission rows are hidden by default to keep the ledger focused.
          {hiddenZeroCount > 0 ? ` ${hiddenZeroCount} hidden.` : ''}
        </p>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-indigoBrand focus:ring-indigoBrand"
            checked={showZeroRows}
            onChange={onToggleZeroRows}
          />
          Show zero commission rows
        </label>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={sortedCommissions.length === 0 ? 'No generated commission rows yet.' : 'Only zero commission rows are hidden.'}
          description={sortedCommissions.length === 0 ? undefined : 'Enable the toggle to audit zero commission statements.'}
        />
      ) : (
        <DataTable>
          <thead className="bg-slate-100/70 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 whitespace-nowrap">Store</th>
              <th className="px-4 py-3 whitespace-nowrap">Period</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Commission Base</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Rate</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Commission</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Paid</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Remaining</th>
              <th className="px-4 py-3 whitespace-nowrap">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((commission) => {
              const paid = getEmployeeCommissionPaidAmount(commission.id, allocations);
              const remaining = Math.max(commission.commissionAmount - paid, 0);
              const zeroNote = getZeroCommissionNote(commission);
              const isZero = isZeroCommissionRow(commission);
              return (
                <tr
                  key={commission.id}
                  className={
                    isZero
                      ? 'border-t border-slate-100 bg-slate-50/70 text-slate-500'
                      : 'border-t border-slate-100 transition hover:bg-slate-50'
                  }
                >
                  <td className="px-4 py-3 font-medium text-slate-950 whitespace-nowrap">
                    {getCommissionDealerName(commission, dealers)}
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatCommissionPeriod(commission)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-950 whitespace-nowrap">
                    {formatUsd(commission.commissionBase)}
                    <p className="mt-1 text-xs font-normal leading-5 text-slate-500 whitespace-normal">
                      Company {formatUsd(commission.companyShareAmount)} · Printing {formatUsd(commission.printingCosts)} ·
                      Shipping {formatUsd(commission.shippingCosts)}
                      {commission.commissionBaseAdjustments !== 0
                        ? ` · Adj ${formatUsd(commission.commissionBaseAdjustments)}`
                        : ''}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">{formatCommissionRate(commission.commissionRate)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-950 whitespace-nowrap">
                    {formatUsd(commission.commissionAmount)}
                    {zeroNote && <p className="mt-1 text-xs font-medium text-amber-700 whitespace-normal">{zeroNote}</p>}
                  </td>
                  <td className="px-4 py-3 text-right text-emerald-700 font-semibold whitespace-nowrap">{formatUsd(paid)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-950 whitespace-nowrap">{formatUsd(remaining)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge status={commission.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}
    </div>
  );
}

function getDealerSecondaryCurrency(dealer: Dealer): SupportedCurrency | null {
  const currency = dealer.currency as SupportedCurrency | undefined;
  if (!currency || currency === 'USD' || !currencyOptions.includes(currency)) return null;
  return currency;
}

function getOriginalCurrency(row: { originalCurrency?: string }) {
  return row.originalCurrency || 'USD';
}

function formatSecondaryCurrencyAmount(amount: number, currency: SupportedCurrency) {
  return `≈ ${formatCurrencyAmount(amount, currency)} ${currency}`;
}

function secondaryText(value: { amount: number; hasEstimate: boolean } | null, currency: SupportedCurrency, primaryUsdValue = 0) {
  if (!value) {
    return Math.abs(primaryUsdValue) < 0.001 ? formatSecondaryCurrencyAmount(0, currency) : undefined;
  }
  if (!value.hasEstimate && Math.abs(primaryUsdValue) >= 0.001) return undefined;
  return formatSecondaryCurrencyAmount(value.amount, currency);
}

function getUsdEquivalent(row: { amount: number; usdAmount?: number }) {
  return row.usdAmount ?? row.amount;
}

function getStoredTargetCurrencyRate(
  rows: Array<{ originalCurrency?: string; originalAmount?: number; exchangeRateToUsd?: number; amount: number; usdAmount?: number }>,
  currency: SupportedCurrency,
) {
  const matching = rows.filter(
    (row) =>
      getOriginalCurrency(row) === currency &&
      (row.originalAmount ?? 0) > 0 &&
      (row.exchangeRateToUsd ?? 0) > 0,
  );
  if (matching.length === 0) return null;

  const totals = matching.reduce(
    (summary, row) => ({
      original: summary.original + (row.originalAmount ?? 0),
      usd: summary.usd + getUsdEquivalent(row),
    }),
    { original: 0, usd: 0 },
  );
  return totals.original > 0 ? totals.usd / totals.original : null;
}

function estimateRowInDealerCurrency(
  row: { originalCurrency?: string; originalAmount?: number; exchangeRateToUsd?: number; amount: number; usdAmount?: number },
  currency: SupportedCurrency,
  targetRateToUsd: number | null,
) {
  const originalCurrency = getOriginalCurrency(row);
  if (originalCurrency === currency) {
    if (row.originalAmount !== undefined) return row.originalAmount;
    const rate = row.exchangeRateToUsd ?? targetRateToUsd;
    return rate && rate > 0 ? getUsdEquivalent(row) / rate : null;
  }
  return targetRateToUsd && targetRateToUsd > 0 ? getUsdEquivalent(row) / targetRateToUsd : null;
}

function calculateOriginalStatementTotals(
  statement: Statement,
  dealer: Dealer,
  transactions: SettlementTransaction[],
  currency: SupportedCurrency,
) {
  const scoped = transactions.filter(
    (transaction) => transaction.statementId === statement.id && transaction.status === 'confirmed',
  );
  const dealerRows = transactions.filter(
    (transaction) => transaction.dealerId === dealer.id && transaction.status === 'confirmed',
  );
  const periodRate = getStoredTargetCurrencyRate(scoped, currency);
  const dealerRate = periodRate ?? getStoredTargetCurrencyRate(dealerRows, currency);

  const amountFor = (transaction: SettlementTransaction) =>
    estimateRowInDealerCurrency(transaction, currency, dealerRate);
  const sumType = (type: TransactionType) =>
    scoped
      .filter((transaction) => transaction.type === type)
      .reduce((total, transaction) => total + (amountFor(transaction) ?? 0), 0);
  const signedAdjustment = (scope: ManualAdjustmentScope) =>
    scoped
      .filter((transaction) => transaction.type === 'manual_adjustment' && transaction.adjustmentScope === scope)
      .reduce(
        (total, transaction) =>
          total +
          (transaction.adjustmentDirection === 'decrease'
            ? -(amountFor(transaction) ?? 0)
            : (amountFor(transaction) ?? 0)),
        0,
      );
  const hasEstimate = scoped.some((transaction) => amountFor(transaction) !== null);

  const totalBankPayouts = sumType('bank_payout');
  const totalStoreExpenses = sumType('store_expense');
  const totalPrintingCosts = sumType('printing_cost');
  const totalShippingCosts = sumType('shipping_cost');
  const shareableNet = totalBankPayouts - totalStoreExpenses + signedAdjustment('shareable_net');
  const dealerShare = shareableNet * dealer.dealerSharePercentage;
  const companyShare = shareableNet * dealer.companySharePercentage;
  const dealerReceivable =
    companyShare + totalPrintingCosts + totalShippingCosts + signedAdjustment('dealer_receivable_only');

  return { hasEstimate, totalBankPayouts, dealerShare, companyShare, dealerReceivable };
}

function getDealerPaymentSecondary(payments: DealerPayment[], currency: SupportedCurrency) {
  if (payments.length === 0) return { amount: 0, hasEstimate: true };
  const targetRate = getStoredTargetCurrencyRate(payments, currency);
  const amounts = payments
    .map((payment) => estimateRowInDealerCurrency(payment, currency, targetRate))
    .filter((amount): amount is number => amount !== null);
  return {
    amount: amounts.reduce((total, amount) => total + amount, 0),
    hasEstimate: amounts.length > 0,
  };
}

function getPaymentSecondary(payment: DealerPayment | undefined, currency: SupportedCurrency) {
  if (!payment) return { amount: 0, hasEstimate: true };
  const targetRate = getStoredTargetCurrencyRate([payment], currency);
  const amount = estimateRowInDealerCurrency(payment, currency, targetRate);
  return { amount: amount ?? 0, hasEstimate: amount !== null };
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

function formatOptionalCost(printing?: number | null, shipping?: number | null, currency = 'USD') {
  const parts = [
    printing !== null && printing !== undefined ? `Printing ${formatCurrencyAmount(printing, currency)}` : '',
    shipping !== null && shipping !== undefined ? `Shipping ${formatCurrencyAmount(shipping, currency)}` : '',
  ].filter(Boolean);
  return parts.join(' · ') || '-';
}

type PendingCostFilter = 'active' | 'resolved' | 'cancelled' | 'all';

function PendingOrderCostsPanel({
  role,
  dealer,
  statements,
  pendingOrderCosts,
  canCreate,
  defaultStatement,
  setFlash,
  onCreate,
  onUpdate,
  onCancel,
  onResolve,
}: {
  role: Role;
  dealer: Dealer;
  statements: Statement[];
  pendingOrderCosts: PendingOrderCost[];
  canCreate: boolean;
  defaultStatement?: Statement;
  setFlash: (value: string) => void;
  onCreate?: (input: PendingOrderCostInput) => Promise<void> | void;
  onUpdate?: (cost: PendingOrderCost, updates: PendingOrderCostUpdateInput) => Promise<void> | void;
  onCancel?: (cost: PendingOrderCost) => Promise<void> | void;
  onResolve?: (input: ResolvePendingOrderCostInput) => Promise<void> | void;
}) {
  const [filter, setFilter] = useState<PendingCostFilter>('active');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<PendingOrderCost | null>(null);
  const [resolving, setResolving] = useState<PendingOrderCost | null>(null);
  const [form, setForm] = useState({
    orderCode: '',
    costScope: 'both' as PendingOrderCostScope,
    estimatedPrintingCost: '',
    estimatedShippingCost: '',
    currency: 'USD' as SupportedCurrency,
    exchangeRateToUsd: '1',
    note: '',
  });
  const [resolveForm, setResolveForm] = useState({
    statementId: defaultStatement?.id || statements[0]?.id || '',
    finalPrintingCost: '',
    finalShippingCost: '',
    currency: 'USD' as SupportedCurrency,
    exchangeRateToUsd: '1',
  });
  const [error, setError] = useState('');
  const rateLookup = useExchangeRateAutofill({
    currency: form.currency,
    date: new Date().toISOString().slice(0, 10),
    setExchangeRateToUsd: (value) => setForm((previous) => ({ ...previous, exchangeRateToUsd: value })),
  });
  const resolveRateLookup = useExchangeRateAutofill({
    currency: resolveForm.currency,
    date: new Date().toISOString().slice(0, 10),
    setExchangeRateToUsd: (value) => setResolveForm((previous) => ({ ...previous, exchangeRateToUsd: value })),
  });

  const activeRows = pendingOrderCosts.filter((cost) =>
    ['pending', 'partially_resolved'].includes(cost.status),
  );
  const activeCountLabel = `${activeRows.length} pending order cost${activeRows.length === 1 ? '' : 's'}`;
  const rows = pendingOrderCosts.filter((cost) => {
    if (filter === 'all') return true;
    if (filter === 'active') return ['pending', 'partially_resolved'].includes(cost.status);
    return cost.status === filter;
  });

  const openCreate = () => {
    setError('');
    setEditing(null);
    setForm({
      orderCode: '',
      costScope: 'both',
      estimatedPrintingCost: '',
      estimatedShippingCost: '',
      currency: 'USD',
      exchangeRateToUsd: '1',
      note: '',
    });
    setShowCreate(true);
  };

  const openEdit = (cost: PendingOrderCost) => {
    setError('');
    setShowCreate(false);
    setEditing(cost);
    setForm({
      orderCode: cost.orderCode,
      costScope: cost.costScope,
      estimatedPrintingCost: cost.estimatedPrintingCost?.toString() ?? '',
      estimatedShippingCost: cost.estimatedShippingCost?.toString() ?? '',
      currency: (cost.currency as SupportedCurrency) || 'USD',
      exchangeRateToUsd: formatRateForInput(cost.exchangeRateToUsd),
      note: cost.note || '',
    });
  };

  const openResolve = (cost: PendingOrderCost) => {
    setError('');
    setResolving(cost);
    setResolveForm({
      statementId: defaultStatement?.id || cost.statementId || statements[0]?.id || '',
      finalPrintingCost: cost.finalPrintingCost?.toString() ?? '',
      finalShippingCost: cost.finalShippingCost?.toString() ?? '',
      currency: (cost.currency as SupportedCurrency) || 'USD',
      exchangeRateToUsd: formatRateForInput(cost.exchangeRateToUsd || 1),
    });
  };

  const validateCostForm = () => {
    const estimatedPrintingCost = parseOptionalNonNegativeNumber(form.estimatedPrintingCost);
    const estimatedShippingCost = parseOptionalNonNegativeNumber(form.estimatedShippingCost);
    const exchangeRateToUsd = getExchangeRateForSave(form.currency, form.exchangeRateToUsd);

    if (!form.orderCode.trim()) return { error: 'Order ID / Order Code is required.' };
    if (!form.costScope) return { error: 'Cost scope is required.' };
    if (estimatedPrintingCost === undefined || estimatedShippingCost === undefined) {
      return { error: 'Estimated costs must be zero or greater.' };
    }
    if (!exchangeRateToUsd) return { error: 'Exchange rate to USD must be greater than zero.' };

    return { estimatedPrintingCost, estimatedShippingCost, exchangeRateToUsd };
  };

  const saveCreate = async () => {
    const validated = validateCostForm();
    if ('error' in validated) {
      setError(validated.error || 'Pending order cost could not be saved.');
      return;
    }
    await onCreate?.({
      dealer,
      statement: defaultStatement ?? null,
      orderCode: form.orderCode.trim(),
      costScope: form.costScope,
      estimatedPrintingCost: validated.estimatedPrintingCost,
      estimatedShippingCost: validated.estimatedShippingCost,
      currency: form.currency,
      exchangeRateToUsd: validated.exchangeRateToUsd,
      note: form.note.trim() || null,
    });
    setShowCreate(false);
  };

  const saveEdit = async () => {
    if (!editing) return;
    const validated = validateCostForm();
    if ('error' in validated) {
      setError(validated.error || 'Pending order cost could not be saved.');
      return;
    }
    await onUpdate?.(editing, {
      orderCode: form.orderCode.trim(),
      costScope: form.costScope,
      estimatedPrintingCost: validated.estimatedPrintingCost,
      estimatedShippingCost: validated.estimatedShippingCost,
      currency: form.currency,
      exchangeRateToUsd: validated.exchangeRateToUsd,
      note: form.note.trim() || null,
    });
    setEditing(null);
  };

  const saveResolve = async () => {
    if (!resolving) return;
    const finalPrintingCost = parseOptionalNonNegativeNumber(resolveForm.finalPrintingCost);
    const finalShippingCost = parseOptionalNonNegativeNumber(resolveForm.finalShippingCost);
    const exchangeRateToUsd = getExchangeRateForSave(resolveForm.currency, resolveForm.exchangeRateToUsd);
    const targetStatement = statements.find((statement) => statement.id === resolveForm.statementId);
    const existingPrintingResolved = (resolving.finalPrintingCost ?? 0) > 0;
    const existingShippingResolved = (resolving.finalShippingCost ?? 0) > 0;
    const newPrintingCost = !existingPrintingResolved ? finalPrintingCost ?? 0 : 0;
    const newShippingCost = !existingShippingResolved ? finalShippingCost ?? 0 : 0;

    if (!targetStatement) {
      setError('No statement exists for this period. Create a statement before resolving this cost.');
      return;
    }
    if (finalPrintingCost === undefined || finalShippingCost === undefined) {
      setError('Final costs must be zero or greater.');
      return;
    }
    if (resolving.costScope === 'printing' && (finalPrintingCost ?? 0) <= 0) {
      setError('Final printing cost is required for a printing pending cost.');
      return;
    }
    if (resolving.costScope === 'shipping' && (finalShippingCost ?? 0) <= 0) {
      setError('Final shipping cost is required for a shipping pending cost.');
      return;
    }
    if ((newPrintingCost <= 0 && newShippingCost <= 0)) {
      setError('Enter at least one finalized cost before resolving.');
      return;
    }
    if (!exchangeRateToUsd) {
      setError('Exchange rate to USD must be greater than zero.');
      return;
    }

    await onResolve?.({
      pendingCost: resolving,
      dealer,
      statement: targetStatement,
      finalPrintingCost,
      finalShippingCost,
      currency: resolveForm.currency,
      exchangeRateToUsd,
    });
    setResolving(null);
  };

  const cancelCost = async (cost: PendingOrderCost) => {
    if (!window.confirm('Cancel this pending order cost?')) return;
    await onCancel?.(cost);
  };

  return (
    <>
      <SectionCard
        className={activeRows.length > 0 ? 'border-amber-200 bg-amber-50/30 shadow-amber-50' : ''}
        title="Pending Order Costs"
        subtitle="Track orders whose printing or shipping costs are not finalized yet."
        action={
          canCreate ? (
            <Button variant="primary" onClick={openCreate}>
              Add Pending Cost
            </Button>
          ) : undefined
        }
      >
        {activeRows.length > 0 && (
          <div className="border-b border-amber-200 bg-amber-50 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-amber-900">This dealer has unresolved order costs.</p>
                <p className="mt-1 text-sm text-amber-800">{activeCountLabel} need review before the related printing or shipping costs are forgotten.</p>
              </div>
              <Button onClick={() => setFilter('active')}>Review Pending Costs</Button>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <p className="text-sm text-slate-600">
            {activeCountLabel} for this dealer.
          </p>
          <select
            className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm shadow-sm"
            value={filter}
            onChange={(event) => setFilter(event.target.value as PendingCostFilter)}
          >
            <option value="active">Active</option>
            <option value="resolved">Resolved</option>
            <option value="cancelled">Cancelled</option>
            <option value="all">All</option>
          </select>
        </div>
        {rows.length === 0 ? (
          <EmptyState title={filter === 'active' ? 'No unresolved order costs.' : 'No pending order costs match this filter.'} />
        ) : (
          <DataTable>
            <thead className="bg-slate-100/70 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Order ID</th>
                <th className="px-4 py-3">Scope</th>
                <th className="px-4 py-3">Estimated Cost</th>
                <th className="px-4 py-3">Final Cost</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Note</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((cost) => (
                <tr key={cost.id} className="border-t border-slate-100 transition hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-950">{cost.orderCode}</td>
                  <td className="px-4 py-3 capitalize">{cost.costScope}</td>
                  <td className="px-4 py-3">{formatOptionalCost(cost.estimatedPrintingCost, cost.estimatedShippingCost, cost.currency)}</td>
                  <td className="px-4 py-3">{formatOptionalCost(cost.finalPrintingCost, cost.finalShippingCost, cost.currency)}</td>
                  <td className="px-4 py-3"><StatusBadge status={cost.status} /></td>
                  <td className="px-4 py-3 text-slate-600">{cost.note || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{cost.createdAt.slice(0, 10)}</td>
                  <td className="px-4 py-3 text-right">
                    {role === 'admin' && (
                      <div className="flex justify-end gap-2">
                        <Button onClick={() => openEdit(cost)}>Edit</Button>
                        {['pending', 'partially_resolved'].includes(cost.status) && (
                          <>
                            <Button variant="primary" onClick={() => openResolve(cost)}>Resolve</Button>
                            <Button variant="danger" onClick={() => cancelCost(cost)}>Cancel</Button>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
        <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          Pending costs are reminders only. Statement totals change only after resolving them into real printing or shipping transactions.
        </div>
      </SectionCard>

      {(showCreate || editing) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-base font-semibold text-slate-950">{editing ? 'Edit Pending Cost' : 'Add Pending Cost'}</h3>
              <p className="mt-1 text-sm text-slate-500">Pending costs do not affect statement totals until resolved.</p>
            </div>
            <div className="grid gap-3 p-5 md:grid-cols-2">
              <FormLabel label="Order ID / Order Code">
                <input className="h-10 w-full px-3" value={form.orderCode} onChange={(event) => setForm({ ...form, orderCode: event.target.value })} />
              </FormLabel>
              <FormLabel label="Cost Scope">
                <select className="h-10 w-full px-3" value={form.costScope} onChange={(event) => setForm({ ...form, costScope: event.target.value as PendingOrderCostScope })}>
                  <option value="printing">Printing</option>
                  <option value="shipping">Shipping</option>
                  <option value="both">Both</option>
                </select>
              </FormLabel>
              <FormLabel label="Estimated Printing Cost">
                <input className="h-10 w-full px-3" type="text" inputMode="decimal" value={form.estimatedPrintingCost} onChange={(event) => setForm({ ...form, estimatedPrintingCost: event.target.value })} />
              </FormLabel>
              <FormLabel label="Estimated Shipping Cost">
                <input className="h-10 w-full px-3" type="text" inputMode="decimal" value={form.estimatedShippingCost} onChange={(event) => setForm({ ...form, estimatedShippingCost: event.target.value })} />
              </FormLabel>
              <FormLabel label="Currency">
                <select className="h-10 w-full px-3" value={form.currency} onChange={(event) => setForm(handleCurrencyChange(form, event.target.value as SupportedCurrency))}>
                  {currencyOptions.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                </select>
              </FormLabel>
              <FormLabel label="Exchange Rate to USD">
                <input
                  className="h-10 w-full px-3"
                  type="text"
                  inputMode="decimal"
                  value={form.exchangeRateToUsd}
                  onChange={(event) => {
                    rateLookup.markManualOverride();
                    setForm({ ...form, exchangeRateToUsd: event.target.value });
                  }}
                />
              </FormLabel>
              <div className="md:col-span-2">
                <FormLabel label="Note">
                  <textarea className="min-h-20 w-full px-3 py-2" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
                </FormLabel>
              </div>
              <div className="md:col-span-2">
                <ExchangeRateLookupStatus lookup={rateLookup.lookup} />
              </div>
              {error && <p className="md:col-span-2 text-sm font-medium text-red-700">{error}</p>}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <Button onClick={() => { setShowCreate(false); setEditing(null); }}>Cancel</Button>
              <Button variant="primary" onClick={editing ? saveEdit : saveCreate}>{editing ? 'Save Pending Cost' : 'Create Pending Cost'}</Button>
            </div>
          </div>
        </div>
      )}

      {resolving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-base font-semibold text-slate-950">Resolve Pending Cost</h3>
              <p className="mt-1 text-sm text-slate-500">Resolution creates confirmed printing/shipping transactions on the selected statement.</p>
            </div>
            <div className="grid gap-3 p-5 md:grid-cols-2">
              <FormLabel label="Target Statement">
                <select className="h-10 w-full px-3" value={resolveForm.statementId} onChange={(event) => setResolveForm({ ...resolveForm, statementId: event.target.value })}>
                  {statements.map((statement) => <option key={statement.id} value={statement.id}>{statement.month}</option>)}
                </select>
              </FormLabel>
              <FormLabel label="Currency">
                <select className="h-10 w-full px-3" value={resolveForm.currency} onChange={(event) => setResolveForm(handleCurrencyChange(resolveForm, event.target.value as SupportedCurrency))}>
                  {currencyOptions.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                </select>
              </FormLabel>
              <FormLabel label="Final Printing Cost">
                <input className="h-10 w-full px-3" type="text" inputMode="decimal" value={resolveForm.finalPrintingCost} onChange={(event) => setResolveForm({ ...resolveForm, finalPrintingCost: event.target.value })} />
              </FormLabel>
              <FormLabel label="Final Shipping Cost">
                <input className="h-10 w-full px-3" type="text" inputMode="decimal" value={resolveForm.finalShippingCost} onChange={(event) => setResolveForm({ ...resolveForm, finalShippingCost: event.target.value })} />
              </FormLabel>
              <FormLabel label="Exchange Rate to USD">
                <input
                  className="h-10 w-full px-3"
                  type="text"
                  inputMode="decimal"
                  value={resolveForm.exchangeRateToUsd}
                  onChange={(event) => {
                    resolveRateLookup.markManualOverride();
                    setResolveForm({ ...resolveForm, exchangeRateToUsd: event.target.value });
                  }}
                />
              </FormLabel>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Order</p>
                <p className="mt-1 font-semibold text-slate-950">{resolving.orderCode}</p>
              </div>
              <div className="md:col-span-2">
                <ExchangeRateLookupStatus lookup={resolveRateLookup.lookup} />
              </div>
              {error && <p className="md:col-span-2 text-sm font-medium text-red-700">{error}</p>}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <Button onClick={() => setResolving(null)}>Cancel</Button>
              <Button variant="primary" onClick={saveResolve}>Resolve Cost</Button>
            </div>
          </div>
        </div>
      )}
    </>
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
    [`Dealer Share Amount (${formatPercent(dealer.dealerSharePercentage)})`, totals.dealer_share_amount],
    [`Company Share Amount (${formatPercent(dealer.companySharePercentage)})`, totals.company_share_amount],
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
        <InfoCallout>{platformPayoutHelper}</InfoCallout>
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

function OriginalCurrencySummary({ transactions }: { transactions: SettlementTransaction[] }) {
  const grouped = transactions
    .filter((transaction) => transaction.status === 'confirmed')
    .reduce<Record<string, number>>((summary, transaction) => {
      const currency = transaction.originalCurrency ?? 'USD';
      summary[currency] = (summary[currency] ?? 0) + (transaction.originalAmount ?? transaction.amount);
      return summary;
    }, {});
  const rows = Object.entries(grouped).sort(([currencyA], [currencyB]) => currencyA.localeCompare(currencyB));

  return (
    <SectionCard
      title="Original Currency Summary"
      subtitle="USD statement totals are calculated from converted transaction amounts."
    >
      {rows.length === 0 ? (
        <EmptyState title="No confirmed original-currency transactions yet." />
      ) : (
        <div className="grid gap-3 p-5 sm:grid-cols-3">
          {rows.map(([currency, amount]) => (
            <div key={currency} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{currency}</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">
                {formatCurrencyAmount(amount, currency)}
              </p>
            </div>
          ))}
        </div>
      )}
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
  pendingOrderCosts: PendingOrderCost[];
  onCreateStatement?: (dealer: Dealer, month: string) => Promise<void> | void;
  onUpdateStatementStatus?: (statement: Statement, status: Statement['status']) => Promise<void> | void;
  onRecordDealerPayment?: (input: RecordDealerPaymentInput) => Promise<void> | void;
  onDeleteStatement?: (statement: Statement) => Promise<boolean> | boolean;
  onCreatePendingOrderCost?: (input: PendingOrderCostInput) => Promise<void> | void;
  onUpdatePendingOrderCost?: (cost: PendingOrderCost, updates: PendingOrderCostUpdateInput) => Promise<void> | void;
  onCancelPendingOrderCost?: (cost: PendingOrderCost) => Promise<void> | void;
  onResolvePendingOrderCost?: (input: ResolvePendingOrderCostInput) => Promise<void> | void;
  onUpdateDealer?: (
    dealerId: string,
    updates: Pick<
      Dealer,
      | 'name'
      | 'storeName'
      | 'platform'
      | 'currency'
      | 'dealerSharePercentage'
      | 'companySharePercentage'
      | 'status'
      | 'notes'
    >,
  ) => Promise<void> | void;
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
  pendingOrderCosts,
  onCreateStatement,
  onUpdateStatementStatus,
  onRecordDealerPayment,
  onDeleteStatement,
  onCreatePendingOrderCost,
  onUpdatePendingOrderCost,
  onCancelPendingOrderCost,
  onResolvePendingOrderCost,
  onUpdateDealer,
}: DealerProfilePageProps) {
  const { dealerId } = useParams();
  const dealer = dealers.find((row) => row.id === dealerId);
  const [month, setMonth] = useState('2026-05');
  const [payForm, setPayForm] = useState({
    paymentDate: '2026-05-01',
    amount: '',
    currency: 'USD' as SupportedCurrency,
    exchangeRateToUsd: '1',
    description: '',
    mode: 'fifo' as 'fifo' | 'manual',
  });
  const [manual, setManual] = useState<Record<string, string>>({});
  const [editingAgreement, setEditingAgreement] = useState(false);
  const [agreementError, setAgreementError] = useState('');
  const [agreementSaving, setAgreementSaving] = useState(false);
  const [agreementForm, setAgreementForm] = useState({
    dealerName: dealer?.name || '',
    storeName: dealer?.storeName || dealer?.name || '',
    platform: dealer?.platform || '',
    currency: dealer?.currency || 'USD',
    dealerSharePercentage: formatPercentInput(dealer?.dealerSharePercentage ?? 0.25),
    companySharePercentage: formatPercentInput(dealer?.companySharePercentage ?? 0.75),
    status: dealer?.status ?? 'active',
    notes: dealer?.notes || '',
  });
  const statementMonthRef = useRef<HTMLInputElement>(null);
  const dealerPaymentRate = useExchangeRateAutofill({
    currency: payForm.currency,
    date: payForm.paymentDate,
    setExchangeRateToUsd: (value) => setPayForm((previous) => ({ ...previous, exchangeRateToUsd: value })),
  });

  if (!dealer) return <PageShell title="Dealer Profile" subtitle="Dealer not found" />;
  if (role === 'employee' && !assignedStoreIds.includes(dealer.storeId)) return <Navigate to="/dealers" replace />;
  const canAddDealerTransaction = role === 'admin' || addTransactionStoreIds.includes(dealer.storeId);

  const dealerStatements = sortStatementsByPeriod(
    statements.filter((statement) => statement.dealerId === dealer.id),
  );
  const dealerPendingOrderCosts = pendingOrderCosts.filter((cost) => cost.dealerId === dealer.id);
  const currentMonthStatement = dealerStatements.find(
    (statement) => statement.month === new Date().toISOString().slice(0, 7),
  );
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
  const dealerRetainedShare = dealerStatements.reduce((total, statement) => {
    const paid = getEffectiveStatementPaidAmount(statement, allocations);
    return total + calculateStatementTotals(statement, transactions, dealer, paid).dealer_share_amount;
  }, 0);
  const dealerPayments = payments.filter((payment) => payment.dealerId === dealer.id);
  const lastPayment = payments
    .filter((payment) => payment.dealerId === dealer.id)
    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))[0];
  const dealerSecondaryCurrency = getDealerSecondaryCurrency(dealer);
  const secondaryStatementTotals = dealerSecondaryCurrency
    ? dealerStatements.map((statement) =>
        calculateOriginalStatementTotals(statement, dealer, transactions, dealerSecondaryCurrency),
      )
    : [];
  const secondaryReceivableTotal = dealerSecondaryCurrency && secondaryStatementTotals.length > 0
    ? {
        amount: secondaryStatementTotals.reduce((total, row) => total + (row?.dealerReceivable ?? 0), 0),
        hasEstimate: secondaryStatementTotals.some((row) => row?.hasEstimate),
      }
    : null;
  const secondaryDealerRetainedShare = dealerSecondaryCurrency && secondaryStatementTotals.length > 0
    ? {
        amount: secondaryStatementTotals.reduce((total, row) => total + (row?.dealerShare ?? 0), 0),
        hasEstimate: secondaryStatementTotals.some((row) => row?.hasEstimate),
      }
    : null;
  const secondaryCurrentReceivable = dealerSecondaryCurrency && currentMonthStatement
    ? (() => {
        const current = calculateOriginalStatementTotals(currentMonthStatement, dealer, transactions, dealerSecondaryCurrency);
        if (!current) return null;
        return { amount: current.dealerReceivable, hasEstimate: current.hasEstimate };
      })()
    : null;
  const secondaryPaid = dealerSecondaryCurrency ? getDealerPaymentSecondary(dealerPayments, dealerSecondaryCurrency) : null;
  const secondaryOpenBalance = dealerSecondaryCurrency && secondaryReceivableTotal && secondaryPaid
    ? {
        amount: secondaryReceivableTotal.amount - secondaryPaid.amount,
        hasEstimate: secondaryReceivableTotal.hasEstimate || secondaryPaid.hasEstimate,
      }
    : secondaryReceivableTotal;
  const secondaryLastPayment = dealerSecondaryCurrency ? getPaymentSecondary(lastPayment, dealerSecondaryCurrency) : null;
  const paymentUsdPreview = calculateUsdPreview(payForm.amount, payForm.currency, payForm.exchangeRateToUsd);
  let running = 0;

  const createStatement = () => {
    const selectedMonth = statementMonthRef.current?.value || month;

    if (onCreateStatement) {
      void onCreateStatement(dealer, selectedMonth);
      return;
    }

    if (dealerStatements.some((statement) => statement.month === selectedMonth)) {
      setFlash('Error: duplicate statement month blocked.');
      return;
    }
    setStatements((previous) => [
      ...previous,
      {
        id: `st-${dealer.id}-${selectedMonth}`,
        dealerId: dealer.id,
        month: selectedMonth,
        status: 'draft',
        paidAmount: 0,
        createdAt: new Date().toISOString(),
      },
    ]);
    setFlash('Statement created.');
  };

  const openAgreementEditor = () => {
    setAgreementError('');
    setAgreementForm({
      dealerName: dealer.name,
      storeName: dealer.storeName || dealer.name,
      platform: dealer.platform || '',
      currency: dealer.currency || 'USD',
      dealerSharePercentage: formatPercentInput(dealer.dealerSharePercentage),
      companySharePercentage: formatPercentInput(dealer.companySharePercentage),
      status: dealer.status,
      notes: dealer.notes || '',
    });
    setEditingAgreement(true);
  };

  const saveAgreement = async () => {
    const dealerShare = Number(agreementForm.dealerSharePercentage);
    const companyShare = Number(agreementForm.companySharePercentage);

    if (!agreementForm.dealerName.trim() || !agreementForm.storeName.trim()) {
      setAgreementError('Dealer name and store name are required.');
      return;
    }

    if (
      !Number.isFinite(dealerShare) ||
      !Number.isFinite(companyShare) ||
      dealerShare < 0 ||
      dealerShare > 100 ||
      companyShare < 0 ||
      companyShare > 100
    ) {
      setAgreementError('Dealer share and company share must be numbers between 0 and 100.');
      return;
    }

    if (Math.abs(dealerShare + companyShare - 100) > 0.001) {
      setAgreementError('Dealer share and company share must add up to 100%.');
      return;
    }

    setAgreementSaving(true);
    setAgreementError('');

    try {
      await onUpdateDealer?.(dealer.id, {
        name: agreementForm.dealerName.trim(),
        storeName: agreementForm.storeName.trim(),
        platform: agreementForm.platform.trim() || null,
        currency: agreementForm.currency.trim() || 'USD',
        dealerSharePercentage: dealerShare / 100,
        companySharePercentage: companyShare / 100,
        status: agreementForm.status,
        notes: agreementForm.notes.trim() || null,
      });
      setEditingAgreement(false);
    } catch (error) {
      setAgreementError(error instanceof Error ? error.message : 'Dealer agreement could not be saved.');
    } finally {
      setAgreementSaving(false);
    }
  };

  const submitPayment = async () => {
    if (role !== 'admin') return;

    const originalAmount = parsePositiveNumber(payForm.amount);
    const exchangeRateToUsd = getExchangeRateForSave(payForm.currency, payForm.exchangeRateToUsd);
    if (!originalAmount) {
      setFlash('Payment original amount must be positive.');
      return;
    }
    if (!exchangeRateToUsd) {
      setFlash('Exchange rate to USD must be greater than zero.');
      return;
    }
    const usdAmount = roundUsdAmount(originalAmount * exchangeRateToUsd);

    let rows: { statementId: string; allocatedAmount: number }[] = [];
    if (payForm.mode === 'fifo') {
      rows = allocateDealerPaymentFIFO({ dealerId: dealer.id, amount: usdAmount, openStatements });
    } else {
      rows = Object.entries(manual)
        .filter(([, value]) => Number(value) > 0)
        .map(([statementId, value]) => ({ statementId, allocatedAmount: Number(value) }));
      const total = rows.reduce((sum, row) => sum + row.allocatedAmount, 0);
      if (Math.abs(total - usdAmount) > 0.001) {
        setFlash('Manual allocation must equal the USD equivalent payment amount.');
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
      amount: usdAmount,
      currency: payForm.currency,
      originalAmount,
      originalCurrency: payForm.currency,
      exchangeRateToUsd,
      usdAmount,
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
      allocatedUsdAmount: row.allocatedAmount,
    }));

    if (onRecordDealerPayment) {
      await onRecordDealerPayment({
        dealer,
        amount: usdAmount,
        originalAmount,
        originalCurrency: payForm.currency,
        exchangeRateToUsd,
        usdAmount,
        paymentDate: payForm.paymentDate,
        description: payForm.description || 'Dealer payment',
        allocationMode: payForm.mode,
        allocations: rows,
        statements,
      });
      return;
    }

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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          label="Open Balance"
          value={formatUsd(openBalance)}
          secondary={dealerSecondaryCurrency ? secondaryText(secondaryOpenBalance, dealerSecondaryCurrency, openBalance) : undefined}
          helper="Sum of statement remaining amounts."
        />
        <SummaryCard
          label="Current Month Receivable"
          value={formatUsd(currentMonthReceivable)}
          secondary={dealerSecondaryCurrency ? secondaryText(secondaryCurrentReceivable, dealerSecondaryCurrency, currentMonthReceivable) : undefined}
          helper="Current period: April 2026."
        />
        <SummaryCard
          label="Dealer Retained Share"
          value={formatUsd(dealerRetainedShare)}
          secondary={dealerSecondaryCurrency ? secondaryText(secondaryDealerRetainedShare, dealerSecondaryCurrency, dealerRetainedShare) : undefined}
          helper="Dealer portion based on the agreement share."
        />
        <SummaryCard
          label="Total Paid"
          value={formatUsd(totalPaid)}
          secondary={dealerSecondaryCurrency ? secondaryText(secondaryPaid, dealerSecondaryCurrency, totalPaid) : undefined}
          helper="Seed paid amount plus allocated payments."
        />
        <SummaryCard
          label="Last Payment"
          value={lastPayment ? formatUsd(lastPayment.amount) : formatUsd(0)}
          secondary={dealerSecondaryCurrency ? secondaryText(secondaryLastPayment, dealerSecondaryCurrency, lastPayment?.amount ?? 0) : undefined}
          helper={lastPayment ? lastPayment.paymentDate : 'No recorded dealer payment.'}
        />
      </div>

      <SectionCard
        title="Agreement"
        subtitle="Dealer agreement terms used by live statement calculations."
        action={
          role === 'admin' ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() =>
                  downloadDealerAccountStatementPdf({
                    dealer,
                    statements,
                    transactions,
                    payments,
                    allocations,
                    pendingOrderCosts: dealerPendingOrderCosts,
                  })
                }
              >
                Download Account Statement
              </Button>
              <Button variant="secondary" onClick={openAgreementEditor}>
                Edit Agreement
              </Button>
            </div>
          ) : undefined
        }
      >
        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Dealer Share</p>
            <p className="mt-1 text-lg font-semibold text-slate-950">{formatPercent(dealer.dealerSharePercentage)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Company Share</p>
            <p className="mt-1 text-lg font-semibold text-slate-950">{formatPercent(dealer.companySharePercentage)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Platform</p>
            <p className="mt-1 text-sm font-semibold text-slate-950">{dealer.platform || 'Not set'}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Default Currency</p>
            <p className="mt-1 text-sm font-semibold text-slate-950">{dealer.currency || 'USD'}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status</p>
            <div className="mt-1"><StatusBadge status={dealer.status} /></div>
          </div>
        </div>
        <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          Changing share rates may affect open statement calculations.
        </div>
      </SectionCard>

      <InfoCallout>{platformPayoutHelper}</InfoCallout>

      {role === 'employee' && (
        <InfoCallout>
          Statements are created by admins. Once a statement exists, you can submit transactions for review.
        </InfoCallout>
      )}

      {role === 'admin' && (
        <div className="grid gap-5 xl:grid-cols-3">
          <SectionCard title="New Statement" subtitle="Create a monthly statement for this dealer.">
            <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end">
              <FormLabel label="Statement month">
                <input
                  ref={statementMonthRef}
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
              <div className="grid gap-3 md:grid-cols-6">
                <FormLabel label="Payment date">
                  <input
                    type="date"
                    className="h-10 w-full px-3"
                    value={payForm.paymentDate}
                    onChange={(event) => setPayForm({ ...payForm, paymentDate: event.target.value })}
                  />
                </FormLabel>
                <FormLabel label="Original payment amount">
                  <input
                    placeholder="0.00"
                    type="text"
                    inputMode="decimal"
                    className="h-10 w-full px-3"
                    value={payForm.amount}
                    onChange={(event) => setPayForm({ ...payForm, amount: event.target.value })}
                  />
                </FormLabel>
                <FormLabel label="Payment currency">
                  <select
                    className="h-10 w-full px-3"
                    value={payForm.currency}
                    onChange={(event) =>
                      setPayForm(handleCurrencyChange(payForm, event.target.value as SupportedCurrency))
                    }
                  >
                    {currencyOptions.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </select>
                </FormLabel>
                <FormLabel label="Exchange rate to USD">
                  <input
                    placeholder="1.0000"
                    type="text"
                    inputMode="decimal"
                    className="h-10 w-full px-3"
                    value={payForm.exchangeRateToUsd}
                    onChange={(event) => {
                      dealerPaymentRate.markManualOverride();
                      setPayForm({ ...payForm, exchangeRateToUsd: event.target.value });
                    }}
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
              <MoneyConversionPreview
                amount={payForm.amount}
                currency={payForm.currency}
                exchangeRateToUsd={payForm.exchangeRateToUsd}
              />
              <p className="text-xs text-slate-500">
                Allocations are applied against USD statement balances using the USD equivalent.
              </p>
              <ExchangeRateLookupStatus lookup={dealerPaymentRate.lookup} />

              {payForm.mode === 'fifo' && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  <span className="font-semibold text-slate-700">FIFO preview: </span>
                  {allocateDealerPaymentFIFO({
                    dealerId: dealer.id,
                    amount: paymentUsdPreview,
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
                        type="text"
                        inputMode="decimal"
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

      <PendingOrderCostsPanel
        role={role}
        dealer={dealer}
        statements={dealerStatements}
        pendingOrderCosts={dealerPendingOrderCosts}
        canCreate={canAddDealerTransaction}
        defaultStatement={currentMonthStatement}
        setFlash={setFlash}
        onCreate={onCreatePendingOrderCost}
        onUpdate={onUpdatePendingOrderCost}
        onCancel={onCancelPendingOrderCost}
        onResolve={onResolvePendingOrderCost}
      />

      <SectionCard title="Statement Ledger" subtitle="Chronological receivable and payment activity for this dealer.">
        {ledger.length === 0 ? (
          <EmptyState title="No ledger activity yet." />
        ) : (
          <DataTable>
            <thead className="bg-slate-100/70 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-28 whitespace-nowrap px-4 py-3">Date</th>
                <th className="w-40 whitespace-nowrap px-4 py-3">Type</th>
                <th className="min-w-72 px-4 py-3">Description</th>
                <th className="w-32 whitespace-nowrap px-4 py-3 text-right">Amount</th>
                <th className="w-32 whitespace-nowrap px-4 py-3 text-right">Running</th>
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
                    <td className="whitespace-nowrap px-4 py-3.5 text-slate-600">{row.date}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 font-medium text-slate-900">
                      {row.kind}
                    </td>
                    <td className="max-w-xl px-4 py-3.5 text-slate-600">{row.description}</td>
                    <td className={isPayment ? 'whitespace-nowrap px-4 py-3.5 text-right font-semibold text-emerald-700' : 'whitespace-nowrap px-4 py-3.5 text-right font-semibold text-slate-950'}>
                      {formatUsd(row.amount)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right font-semibold text-slate-950">{formatUsd(running)}</td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </SectionCard>

      <SectionCard title="Statements" subtitle="Statement-level payout, receivable, payment, and remaining balance review.">
        {role === 'employee' && dealerStatements.length === 0 ? (
          <EmptyState
            title="No statement is available for this dealer yet."
            description="Please ask an admin to create the monthly statement before adding transactions."
          />
        ) : (
          <DataTable>
            <thead className="bg-slate-100/70 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-28 whitespace-nowrap px-4 py-3">Month</th>
                <th className="w-36 whitespace-nowrap px-4 py-3">Status</th>
                <th className="w-36 whitespace-nowrap px-4 py-3 text-right">Platform Payout</th>
                <th className="w-40 whitespace-nowrap px-4 py-3 text-right">Dealer Receivable</th>
                <th className="w-32 whitespace-nowrap px-4 py-3 text-right">Remaining</th>
                <th className="w-52 whitespace-nowrap px-4 py-3 text-right">Actions</th>
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
                  <td className="whitespace-nowrap px-4 py-3.5 font-medium tabular-nums text-slate-950">{statement.month}</td>
                  <td className="whitespace-nowrap px-4 py-3.5">
                    <StatusBadge status={statement.status} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums">{formatUsd(totals.total_bank_payouts)}</td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right font-semibold tabular-nums text-slate-950">{formatUsd(totals.dealer_receivable_amount)}</td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right font-semibold tabular-nums text-slate-950">{formatUsd(totals.remaining_amount)}</td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <Link className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold text-indigoBrand hover:bg-indigo-50" to={`/statements/${statement.id}`}>
                        View
                      </Link>
                      {role === 'employee' && canAddDealerTransaction && (
                        <Link className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold text-indigoBrand hover:bg-indigo-50" to={`/statements/${statement.id}#add-transaction`}>
                          Add Transaction
                        </Link>
                      )}
                      {role === 'admin' && (
                        <>
                          <button
                            className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            onClick={() =>
                              downloadStatementPdf({
                                dealer,
                                statement,
                                transactions,
                                payments,
                                allocations,
                                pendingOrderCosts: dealerPendingOrderCosts,
                              })
                            }
                          >
                            PDF
                          </button>
                          <button
                            className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold text-indigoBrand hover:bg-indigo-50"
                            onClick={() => {
                              if (onUpdateStatementStatus) {
                                void onUpdateStatementStatus(statement, 'closed');
                              } else {
                                setStatements((previous) =>
                                  previous.map((row) =>
                                    row.id === statement.id ? { ...row, status: 'closed' } : row,
                                  ),
                                );
                              }
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
                          <button
                            className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                            onClick={() => {
                              void onDeleteStatement?.(statement);
                            }}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            </tbody>
          </DataTable>
        )}
      </SectionCard>

      {editingAgreement && role === 'admin' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-base font-semibold text-slate-950">Edit Dealer Agreement</h3>
              <p className="mt-1 text-sm text-slate-500">
                Changing share rates may affect open statement calculations.
              </p>
            </div>
            <div className="grid gap-3 p-5 md:grid-cols-2">
              <FormLabel label="Dealer name">
                <input
                  className="h-10 w-full px-3"
                  value={agreementForm.dealerName}
                  onChange={(event) => setAgreementForm({ ...agreementForm, dealerName: event.target.value })}
                />
              </FormLabel>
              <FormLabel label="Store name">
                <input
                  className="h-10 w-full px-3"
                  value={agreementForm.storeName}
                  onChange={(event) => setAgreementForm({ ...agreementForm, storeName: event.target.value })}
                />
              </FormLabel>
              <FormLabel label="Platform">
                <input
                  className="h-10 w-full px-3"
                  value={agreementForm.platform}
                  onChange={(event) => setAgreementForm({ ...agreementForm, platform: event.target.value })}
                  placeholder="Etsy, Shopify, etc."
                />
              </FormLabel>
              <FormLabel label="Currency">
                <select
                  className="h-10 w-full px-3"
                  value={agreementForm.currency}
                  onChange={(event) => setAgreementForm({ ...agreementForm, currency: event.target.value })}
                >
                  {currencyOptions.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </FormLabel>
              <FormLabel label="Dealer share %">
                <input
                  className="h-10 w-full px-3"
                  inputMode="decimal"
                  value={agreementForm.dealerSharePercentage}
                  onChange={(event) => {
                    const nextDealerShare = event.target.value;
                    const numeric = Number(nextDealerShare);
                    setAgreementForm({
                      ...agreementForm,
                      dealerSharePercentage: nextDealerShare,
                      companySharePercentage: Number.isFinite(numeric)
                        ? formatPercentInput((100 - numeric) / 100)
                        : agreementForm.companySharePercentage,
                    });
                  }}
                />
              </FormLabel>
              <FormLabel label="Company share %">
                <input
                  className="h-10 w-full px-3"
                  inputMode="decimal"
                  value={agreementForm.companySharePercentage}
                  onChange={(event) =>
                    setAgreementForm({ ...agreementForm, companySharePercentage: event.target.value })
                  }
                />
              </FormLabel>
              <FormLabel label="Status">
                <select
                  className="h-10 w-full px-3"
                  value={agreementForm.status}
                  onChange={(event) =>
                    setAgreementForm({ ...agreementForm, status: event.target.value as Dealer['status'] })
                  }
                >
                  {dealerStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </FormLabel>
              <FormLabel label="Notes">
                <textarea
                  className="min-h-24 w-full px-3 py-2"
                  value={agreementForm.notes}
                  onChange={(event) => setAgreementForm({ ...agreementForm, notes: event.target.value })}
                  placeholder="Internal agreement notes"
                />
              </FormLabel>
            </div>
            {agreementError && (
              <div className="mx-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {agreementError}
              </div>
            )}
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <Button onClick={() => setEditingAgreement(false)}>Cancel</Button>
              <Button variant="primary" onClick={saveAgreement}>
                {agreementSaving ? 'Saving...' : 'Save Agreement'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

interface StatementDetailPageProps {
  role: Role;
  assignedStoreIds: string[];
  addTransactionStoreIds: string[];
  confirmedTransactionStoreIds: string[];
  editTransactionStoreIds: string[];
  deleteTransactionStoreIds: string[];
  currentUserId?: string;
  dealers: Dealer[];
  statements: Statement[];
  transactions: SettlementTransaction[];
  setTransactions: Dispatch<SetStateAction<SettlementTransaction[]>>;
  setFlash: (value: string) => void;
  payments: DealerPayment[];
  allocations: DealerPaymentAllocation[];
  employees: Employee[];
  pendingOrderCosts: PendingOrderCost[];
  onCreateTransaction?: (
    statement: Statement,
    dealer: Dealer,
    input: {
      date: string;
      type: TransactionType;
      amount: number;
      originalAmount?: number;
      originalCurrency?: string;
      exchangeRateToUsd?: number;
      usdAmount?: number;
      description?: string;
      orderCode?: string;
      adjustmentScope?: ManualAdjustmentScope;
      adjustmentDirection?: ManualAdjustmentDirection;
    },
  ) => Promise<void> | void;
  onUpdateTransaction?: (
    transaction: SettlementTransaction,
    patch: UpdateTransactionInput,
  ) => Promise<boolean> | boolean;
  onDeleteStatement?: (statement: Statement) => Promise<boolean> | boolean;
  onDeleteTransaction?: (transaction: SettlementTransaction) => Promise<boolean> | boolean;
  onCreatePendingOrderCost?: (input: PendingOrderCostInput) => Promise<void> | void;
  onUpdatePendingOrderCost?: (cost: PendingOrderCost, updates: PendingOrderCostUpdateInput) => Promise<void> | void;
  onCancelPendingOrderCost?: (cost: PendingOrderCost) => Promise<void> | void;
  onResolvePendingOrderCost?: (input: ResolvePendingOrderCostInput) => Promise<void> | void;
}

export function StatementDetailPage({
  role,
  assignedStoreIds,
  addTransactionStoreIds,
  confirmedTransactionStoreIds,
  editTransactionStoreIds,
  deleteTransactionStoreIds,
  currentUserId,
  dealers,
  statements,
  transactions,
  setTransactions,
  setFlash,
  payments,
  allocations,
  employees,
  pendingOrderCosts,
  onCreateTransaction,
  onUpdateTransaction,
  onDeleteStatement,
  onDeleteTransaction,
  onCreatePendingOrderCost,
  onUpdatePendingOrderCost,
  onCancelPendingOrderCost,
  onResolvePendingOrderCost,
}: StatementDetailPageProps) {
  const { statementId } = useParams();
  const navigate = useNavigate();
  const statement = statements.find((row) => row.id === statementId);
  const [form, setForm] = useState({
    date: '2026-04-15',
    type: 'bank_payout' as TransactionType,
    amount: '',
    currency: 'USD' as SupportedCurrency,
    exchangeRateToUsd: '1',
    description: '',
    orderCode: '',
    adjustmentScope: 'shareable_net' as ManualAdjustmentScope,
    adjustmentDirection: 'increase' as ManualAdjustmentDirection,
  });
  const [editingTransaction, setEditingTransaction] = useState<SettlementTransaction | null>(null);
  const [editForm, setEditForm] = useState({
    date: '',
    type: 'bank_payout' as TransactionType,
    amount: '',
    currency: 'USD' as SupportedCurrency,
    exchangeRateToUsd: '1',
    description: '',
    orderCode: '',
    adjustmentScope: 'shareable_net' as ManualAdjustmentScope,
    adjustmentDirection: 'increase' as ManualAdjustmentDirection,
  });
  const [transactionSaving, setTransactionSaving] = useState(false);
  const transactionRate = useExchangeRateAutofill({
    currency: form.currency,
    date: form.date,
    setExchangeRateToUsd: (value) => setForm((previous) => ({ ...previous, exchangeRateToUsd: value })),
  });

  if (!statement) return <PageShell title="Statement Detail" subtitle="Statement not found" />;
  const dealer = dealers.find((row) => row.id === statement.dealerId);
  if (!dealer) return <PageShell title="Statement Detail" subtitle="Dealer not found" />;
  if (role === 'employee' && !assignedStoreIds.includes(dealer.storeId)) return <Navigate to="/dealers" replace />;
  const canAddTransaction = role === 'admin' || addTransactionStoreIds.includes(dealer.storeId);
  const employeeCreatesConfirmed =
    role === 'employee' && confirmedTransactionStoreIds.includes(dealer.storeId);
  const canEditTransaction = (transaction: SettlementTransaction) =>
    role === 'admin' ||
    (editTransactionStoreIds.includes(dealer.storeId) &&
      (currentUserId ? transaction.createdBy === currentUserId : transaction.createdByRole === 'employee'));
  const canDeleteTransaction = (transaction: SettlementTransaction) =>
    role === 'admin' ||
    (deleteTransactionStoreIds.includes(dealer.storeId) &&
      (currentUserId ? transaction.createdBy === currentUserId : transaction.createdByRole === 'employee'));

  const txns = transactions.filter((transaction) => transaction.statementId === statement.id);
  const paid = getEffectiveStatementPaidAmount(statement, allocations);
  const totals = calculateStatementTotals(statement, transactions, dealer, paid);
  const statementAllocations = allocations.filter((allocation) => allocation.statementId === statement.id);
  const commissionPreviews = getCommissionPreviewsForStatement(statement, transactions, dealer, employees);
  const statementPendingOrderCosts = pendingOrderCosts.filter(
    (cost) => cost.statementId === statement.id || (!cost.statementId && cost.dealerId === dealer.id),
  );
  const addTransaction = async () => {
    if (transactionSaving) return;
    const originalAmount = parsePositiveNumber(form.amount);
    const exchangeRateToUsd = getExchangeRateForSave(form.currency, form.exchangeRateToUsd);
    if (!form.date || !form.type || !originalAmount) {
      setFlash('Error: required fields and positive original amount are required.');
      return;
    }
    if (!exchangeRateToUsd) {
      setFlash('Exchange rate to USD must be greater than zero.');
      return;
    }
    const usdAmount = roundUsdAmount(originalAmount * exchangeRateToUsd);
    const orderCode = form.orderCode.trim();
    const exactDuplicate = orderCode
      ? txns.some(
          (transaction) =>
            transaction.type === form.type &&
            transaction.orderCode === orderCode &&
            (transaction.originalCurrency ?? 'USD') === form.currency &&
            Math.abs((transaction.usdAmount ?? transaction.amount) - usdAmount) < 0.001,
        )
      : false;
    if (exactDuplicate) {
      setFlash('A similar transaction already exists for this statement.');
      return;
    }

    const input = {
      date: form.date,
      type: form.type,
      amount: usdAmount,
      originalAmount,
      originalCurrency: form.currency,
      exchangeRateToUsd,
      usdAmount,
      description: form.description,
      orderCode: orderCode || undefined,
      adjustmentScope: form.type === 'manual_adjustment' ? form.adjustmentScope : undefined,
      adjustmentDirection: form.type === 'manual_adjustment' ? form.adjustmentDirection : undefined,
    };

    setTransactionSaving(true);
    try {
      if (onCreateTransaction) {
        await onCreateTransaction(statement, dealer, input);
        setForm((previous) => ({ ...previous, amount: '', description: '', orderCode: '' }));
        return;
      }

      const status: TransactionStatus = role === 'admin' || employeeCreatesConfirmed ? 'confirmed' : 'pending_review';
      setTransactions((previous) => [
        ...previous,
        {
          id: `t-${Date.now()}`,
          dealerId: dealer.id,
          statementId: statement.id,
          date: input.date,
          type: input.type,
          amount: usdAmount,
          originalAmount,
          originalCurrency: form.currency,
          exchangeRateToUsd,
          usdAmount,
          status,
          description: input.description,
          orderCode: input.orderCode,
          adjustmentScope: input.adjustmentScope,
          adjustmentDirection: input.adjustmentDirection,
          createdByRole: role,
        },
      ]);
      setFlash(status === 'confirmed' ? 'Transaction added and confirmed.' : 'Transaction submitted for admin review.');
      setForm((previous) => ({ ...previous, amount: '', description: '', orderCode: '' }));
    } catch {
      // The caller sets the user-facing error message. Keep the form values for retry.
    } finally {
      setTransactionSaving(false);
    }
  };

  const openTransactionEditor = (transaction: SettlementTransaction) => {
    setEditingTransaction(transaction);
    setEditForm({
      date: transaction.date,
      type: transaction.type,
      amount: String(transaction.originalAmount ?? transaction.amount),
      currency: (transaction.originalCurrency as SupportedCurrency) || 'USD',
      exchangeRateToUsd: formatRateForInput(transaction.exchangeRateToUsd ?? 1),
      description: transaction.description || '',
      orderCode: transaction.orderCode || '',
      adjustmentScope: transaction.adjustmentScope || 'shareable_net',
      adjustmentDirection: transaction.adjustmentDirection || 'increase',
    });
  };

  const saveEditedTransaction = async () => {
    if (!editingTransaction) return;
    const originalAmount = parsePositiveNumber(editForm.amount);
    const exchangeRateToUsd = getExchangeRateForSave(editForm.currency, editForm.exchangeRateToUsd);
    if (!editForm.date || !editForm.type || !originalAmount) {
      setFlash('Error: required fields and positive original amount are required.');
      return;
    }
    if (!exchangeRateToUsd) {
      setFlash('Exchange rate to USD must be greater than zero.');
      return;
    }
    if (
      editingTransaction.status === 'confirmed' &&
      !window.confirm('Editing a confirmed transaction will update statement totals.')
    ) {
      return;
    }

    const usdAmount = roundUsdAmount(originalAmount * exchangeRateToUsd);
    const patch: UpdateTransactionInput = {
      date: editForm.date,
      type: editForm.type,
      amount: usdAmount,
      originalAmount,
      originalCurrency: editForm.currency,
      exchangeRateToUsd,
      usdAmount,
      description: editForm.description,
      orderCode: editForm.orderCode || undefined,
      adjustmentScope: editForm.type === 'manual_adjustment' ? editForm.adjustmentScope : undefined,
      adjustmentDirection: editForm.type === 'manual_adjustment' ? editForm.adjustmentDirection : undefined,
    };

    const saved = onUpdateTransaction
      ? await onUpdateTransaction(editingTransaction, patch)
      : (() => {
          setTransactions((previous) =>
            previous.map((transaction) =>
              transaction.id === editingTransaction.id ? { ...transaction, ...patch } : transaction,
            ),
          );
          setFlash('Transaction updated.');
          return true;
        })();
    if (saved) setEditingTransaction(null);
  };

  const deleteTransaction = (transaction: SettlementTransaction) => {
    if (onDeleteTransaction) {
      void onDeleteTransaction(transaction);
      return;
    }

    if (
      !window.confirm(
        'Delete this transaction? Statement totals will be recalculated. This action cannot be undone.',
      )
    ) {
      return;
    }
    setTransactions((previous) => previous.filter((row) => row.id !== transaction.id));
    setFlash('Transaction deleted.');
  };

  return (
    <PageShell title="Statement Detail" subtitle={`${dealer.name} · ${statement.month} financial review`}>
      {role === 'admin' && (
        <SectionCard
          title="Statement Actions"
          subtitle="Download a dealer-ready statement or remove statements created by mistake."
          action={
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                onClick={() =>
                  downloadStatementPdf({
                    dealer,
                    statement,
                    transactions,
                    payments,
                    allocations,
                    pendingOrderCosts: statementPendingOrderCosts,
                  })
                }
              >
                Download Statement PDF
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  const deleted = await onDeleteStatement?.(statement);
                  if (deleted) navigate(`/dealers/${dealer.id}`);
                }}
              >
                Delete Statement
              </Button>
            </div>
          }
        >
          <div className="p-5 text-sm text-slate-600">
            Use delete only for statements created by mistake. Related transactions and unpaid commission rows are removed with the statement.
          </div>
        </SectionCard>
      )}

      <StatementBreakdown statement={statement} dealer={dealer} transactions={transactions} allocations={allocations} />
      <OriginalCurrencySummary transactions={txns} />
      <PendingOrderCostsPanel
        role={role}
        dealer={dealer}
        statements={statements.filter((row) => row.dealerId === dealer.id)}
        pendingOrderCosts={statementPendingOrderCosts}
        canCreate={canAddTransaction}
        defaultStatement={statement}
        setFlash={setFlash}
        onCreate={onCreatePendingOrderCost}
        onUpdate={onUpdatePendingOrderCost}
        onCancel={onCancelPendingOrderCost}
        onResolve={onResolvePendingOrderCost}
      />

      {canAddTransaction ? (
        <SectionCard
          title="Add Transaction"
          subtitle={
            role === 'employee'
              ? employeeCreatesConfirmed
                ? 'This assignment allows confirmed employee transaction entry.'
                : 'Employee submissions enter the review queue.'
              : 'Admin-created transactions are confirmed immediately.'
          }
        >
          <div id="add-transaction" className="space-y-4 p-5">
            {role === 'employee' && employeeCreatesConfirmed ? (
              <InfoCallout>Your transaction will be added as confirmed and will affect statement totals immediately.</InfoCallout>
            ) : role === 'employee' ? (
              <InfoCallout>Your transaction will be submitted for admin review and will not affect totals until approved.</InfoCallout>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Admin-created transactions are confirmed immediately.
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
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
                    <option key={type} value={type}>
                      {formatTransactionType(type)}
                    </option>
                  ))}
                </select>
              </FormLabel>
              <FormLabel label="Original amount">
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(event) => setForm({ ...form, amount: event.target.value })}
                  className="h-10 w-full px-3"
                  placeholder="0.00"
                />
              </FormLabel>
              <FormLabel label="Currency">
                <select
                  aria-label="Transaction currency"
                  value={form.currency}
                  onChange={(event) =>
                    setForm(handleCurrencyChange(form, event.target.value as SupportedCurrency))
                  }
                  className="h-10 w-full px-3"
                >
                  {currencyOptions.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </FormLabel>
              <FormLabel label="Exchange rate to USD">
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.exchangeRateToUsd}
                  onChange={(event) => {
                    transactionRate.markManualOverride();
                    setForm({ ...form, exchangeRateToUsd: event.target.value });
                  }}
                  className="h-10 w-full px-3"
                  placeholder="1.0000"
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
            <div className="grid gap-3 md:grid-cols-[minmax(0,240px)_1fr]">
              <MoneyConversionPreview
                amount={form.amount}
                currency={form.currency}
                exchangeRateToUsd={form.exchangeRateToUsd}
              />
              <InfoCallout>
                Statement totals use the USD equivalent. Keep the exchange rate used for this transaction date.
              </InfoCallout>
            </div>
            <ExchangeRateLookupStatus lookup={transactionRate.lookup} />
            <Button variant="primary" onClick={() => void addTransaction()} disabled={transactionSaving}>
              {transactionSaving ? 'Saving...' : 'Add Transaction'}
            </Button>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Transaction Ledger" subtitle="Pending and rejected rows are separated visually from confirmed activity.">
        <DataTable>
          <thead className="bg-slate-100/70 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-28 whitespace-nowrap px-4 py-3">Date</th>
              <th className="w-48 whitespace-nowrap px-4 py-3">Type</th>
              <th className="w-36 whitespace-nowrap px-4 py-3">Status</th>
              <th className="w-48 whitespace-nowrap px-4 py-3 text-right">Amount</th>
              <th className="min-w-64 px-4 py-3">Order / Description</th>
              {(role === 'admin' || editTransactionStoreIds.includes(dealer.storeId) || deleteTransactionStoreIds.includes(dealer.storeId)) && (
                <th className="w-36 whitespace-nowrap px-4 py-3 text-right">Actions</th>
              )}
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
                <td className="whitespace-nowrap px-4 py-3">{transaction.date}</td>
                <td className="whitespace-nowrap px-4 py-3 font-medium">{formatTransactionType(transaction.type)}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <StatusBadge status={transaction.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <p className="font-semibold text-slate-950">{formatUsd(transaction.usdAmount ?? transaction.amount)}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatOriginalMoney(transaction)} @ {formatExchangeRate(transaction.exchangeRateToUsd)}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{transaction.orderCode || '-'}</p>
                  <p className="mt-1 text-xs text-slate-500">{transaction.description || '-'}</p>
                </td>
                {(role === 'admin' || canEditTransaction(transaction) || canDeleteTransaction(transaction)) && (
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {canEditTransaction(transaction) && (
                        <Button onClick={() => openTransactionEditor(transaction)}>
                          Edit
                        </Button>
                      )}
                      {canDeleteTransaction(transaction) && (
                        <Button variant="danger" onClick={() => deleteTransaction(transaction)}>
                          Delete
                        </Button>
                      )}
                    </div>
                  </td>
                )}
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
                  <span className="font-semibold text-emerald-700">
                    {formatUsd(allocation.allocatedUsdAmount ?? allocation.allocatedAmount)}
                  </span>
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

      {editingTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-base font-semibold text-slate-950">Edit Transaction</h3>
              <p className="mt-1 text-sm text-slate-500">
                Confirmed transaction edits update statement totals.
              </p>
            </div>
            <div className="grid gap-3 p-5 md:grid-cols-3">
              <FormLabel label="Date">
                <input
                  type="date"
                  className="h-10 w-full px-3"
                  value={editForm.date}
                  onChange={(event) => setEditForm({ ...editForm, date: event.target.value })}
                />
              </FormLabel>
              <FormLabel label="Type">
                <select
                  className="h-10 w-full px-3"
                  value={editForm.type}
                  onChange={(event) => setEditForm({ ...editForm, type: event.target.value as TransactionType })}
                >
                  {transactionTypes.map((type) => (
                    <option key={type} value={type}>
                      {formatTransactionType(type)}
                    </option>
                  ))}
                </select>
              </FormLabel>
              <FormLabel label="Original amount">
                <input
                  className="h-10 w-full px-3"
                  inputMode="decimal"
                  value={editForm.amount}
                  onChange={(event) => setEditForm({ ...editForm, amount: event.target.value })}
                />
              </FormLabel>
              <FormLabel label="Currency">
                <select
                  className="h-10 w-full px-3"
                  value={editForm.currency}
                  onChange={(event) =>
                    setEditForm(handleCurrencyChange(editForm, event.target.value as SupportedCurrency))
                  }
                >
                  {currencyOptions.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </FormLabel>
              <FormLabel label="Exchange rate to USD">
                <input
                  className="h-10 w-full px-3"
                  inputMode="decimal"
                  value={editForm.exchangeRateToUsd}
                  onChange={(event) => setEditForm({ ...editForm, exchangeRateToUsd: event.target.value })}
                />
              </FormLabel>
              <FormLabel label="Description">
                <input
                  className="h-10 w-full px-3"
                  value={editForm.description}
                  onChange={(event) => setEditForm({ ...editForm, description: event.target.value })}
                />
              </FormLabel>
              <FormLabel label="Order code">
                <input
                  className="h-10 w-full px-3"
                  value={editForm.orderCode}
                  onChange={(event) => setEditForm({ ...editForm, orderCode: event.target.value })}
                />
              </FormLabel>
              {editForm.type === 'manual_adjustment' && (
                <>
                  <FormLabel label="Adjustment scope">
                    <select
                      className="h-10 w-full px-3"
                      value={editForm.adjustmentScope}
                      onChange={(event) =>
                        setEditForm({ ...editForm, adjustmentScope: event.target.value as ManualAdjustmentScope })
                      }
                    >
                      {adjustmentScopes.map((scope) => (
                        <option key={scope}>{scope}</option>
                      ))}
                    </select>
                  </FormLabel>
                  <FormLabel label="Direction">
                    <select
                      className="h-10 w-full px-3"
                      value={editForm.adjustmentDirection}
                      onChange={(event) =>
                        setEditForm({ ...editForm, adjustmentDirection: event.target.value as ManualAdjustmentDirection })
                      }
                    >
                      {adjustmentDirections.map((direction) => (
                        <option key={direction}>{direction}</option>
                      ))}
                    </select>
                  </FormLabel>
                </>
              )}
              <div className="md:col-span-3">
                <MoneyConversionPreview
                  amount={editForm.amount}
                  currency={editForm.currency}
                  exchangeRateToUsd={editForm.exchangeRateToUsd}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <Button onClick={() => setEditingTransaction(null)}>Cancel</Button>
              <Button variant="primary" onClick={() => void saveEditedTransaction()}>
                Save Transaction
              </Button>
            </div>
          </div>
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
  onUpdateTransactionStatus?: (transactionId: string, status: TransactionStatus) => Promise<void> | void;
  onDeleteTransaction?: (transaction: SettlementTransaction) => Promise<boolean> | boolean;
}

export function TransactionsPage({
  role,
  assignedStoreIds,
  dealers,
  transactions,
  setTransactions,
  setFlash,
  onUpdateTransactionStatus,
  onDeleteTransaction,
}: TransactionsPageProps) {
  const [filters, setFilters] = useState({ dealerId: '', type: '', status: '', q: '' });
  const [selectedPendingIds, setSelectedPendingIds] = useState<Set<string>>(() => new Set());
  const [showPendingInLedger, setShowPendingInLedger] = useState(false);
  const visibleDealers = role === 'admin' ? dealers : dealers.filter((dealer) => assignedStoreIds.includes(dealer.storeId));
  const visibleIds = useMemo(() => new Set(visibleDealers.map((dealer) => dealer.id)), [visibleDealers]);
  const rows = useMemo(
    () =>
      transactions
        .filter((transaction) => role === 'admin' || visibleIds.has(transaction.dealerId))
        .filter((transaction) => !filters.dealerId || transaction.dealerId === filters.dealerId)
        .filter((transaction) => !filters.type || transaction.type === filters.type)
        .filter((transaction) => !filters.status || transaction.status === filters.status)
        .filter(
          (transaction) =>
            !filters.q ||
            (transaction.orderCode || '').includes(filters.q) ||
            (transaction.description || '').toLowerCase().includes(filters.q.toLowerCase()),
        ),
    [transactions, visibleIds, filters, role],
  );

  useEffect(() => {
    setSelectedPendingIds((current) => {
      const validPendingIds = new Set(
        transactions
          .filter((transaction) => transaction.status === 'pending_review')
          .map((transaction) => transaction.id),
      );
      return new Set([...current].filter((id) => validPendingIds.has(id)));
    });
  }, [transactions]);

  const updateStatus = (transactionId: string, status: TransactionStatus) => {
    if (onUpdateTransactionStatus) {
      void onUpdateTransactionStatus(transactionId, status);
      return;
    }

    setTransactions((previous) =>
      previous.map((transaction) => (transaction.id === transactionId ? { ...transaction, status } : transaction)),
    );
    setFlash(status === 'confirmed' ? 'Transaction approved.' : 'Transaction rejected.');
  };
  const deleteTransaction = (transaction: SettlementTransaction) => {
    if (onDeleteTransaction) {
      void onDeleteTransaction(transaction);
      return;
    }

    if (
      !window.confirm(
        'Delete this transaction? Statement totals will be recalculated. This action cannot be undone.',
      )
    ) {
      return;
    }
    setTransactions((previous) => previous.filter((row) => row.id !== transaction.id));
    setFlash('Transaction deleted.');
  };
  const pendingRows = rows.filter((transaction) => transaction.status === 'pending_review');
  const ledgerRows = showPendingInLedger
    ? rows
    : rows.filter((transaction) => transaction.status !== 'pending_review');
  const selectedVisiblePendingRows = pendingRows.filter((transaction) => selectedPendingIds.has(transaction.id));
  const allVisiblePendingSelected =
    pendingRows.length > 0 && pendingRows.every((transaction) => selectedPendingIds.has(transaction.id));
  const togglePendingSelection = (transactionId: string) => {
    setSelectedPendingIds((current) => {
      const next = new Set(current);
      if (next.has(transactionId)) next.delete(transactionId);
      else next.add(transactionId);
      return next;
    });
  };
  const toggleAllVisiblePending = () => {
    setSelectedPendingIds((current) => {
      const next = new Set(current);
      if (allVisiblePendingSelected) {
        pendingRows.forEach((transaction) => next.delete(transaction.id));
      } else {
        pendingRows.forEach((transaction) => next.add(transaction.id));
      }
      return next;
    });
  };
  const approveSelected = async () => {
    if (role !== 'admin' || selectedVisiblePendingRows.length === 0) return;
    if (
      !window.confirm(
        'Approve selected pending transactions? Confirmed transactions will affect statement totals.',
      )
    ) {
      return;
    }

    if (onUpdateTransactionStatus) {
      await Promise.all(
        selectedVisiblePendingRows.map((transaction) =>
          onUpdateTransactionStatus(transaction.id, 'confirmed'),
        ),
      );
    } else {
      const selectedIds = new Set(selectedVisiblePendingRows.map((transaction) => transaction.id));
      setTransactions((previous) =>
        previous.map((transaction) =>
          selectedIds.has(transaction.id) ? { ...transaction, status: 'confirmed' } : transaction,
        ),
      );
    }
    setSelectedPendingIds(new Set());
    setFlash(`${selectedVisiblePendingRows.length} pending transactions approved.`);
  };

  return (
    <PageShell title="Transactions" subtitle="Global transaction management and approval queue">
      <SectionCard
        title="Transaction Filters"
        subtitle="Narrow the approval and ledger views without changing source data."
        action={
          role === 'admin' && selectedVisiblePendingRows.length > 0 ? (
            <Button variant="primary" onClick={() => void approveSelected()}>
              Approve Selected ({selectedVisiblePendingRows.length})
            </Button>
          ) : undefined
        }
      >
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
                <option key={type} value={type}>
                  {formatTransactionType(type)}
                </option>
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
        <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-3">
          <button
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
            onClick={() => setFilters({ ...filters, status: 'pending_review' })}
          >
            Pending Review
          </button>
          <button
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            onClick={() => setFilters({ ...filters, status: '' })}
          >
            All Status
          </button>
        </div>
      </SectionCard>

      <SectionCard className="border-amber-200 shadow-amber-50" title="Approval Queue" subtitle="Employee-submitted transactions waiting for admin review.">
        {pendingRows.length === 0 ? (
          <EmptyState title="No transactions are waiting for review." />
        ) : (
          <DataTable>
            <thead className="bg-amber-50/80 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">
                  <input
                    aria-label="Select all pending transactions"
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-indigoBrand"
                    checked={allVisiblePendingSelected}
                    onChange={toggleAllVisiblePending}
                  />
                </th>
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
                  <td className="px-4 py-3">
                    <input
                      aria-label={`Select pending transaction ${transaction.id}`}
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-indigoBrand"
                      checked={selectedPendingIds.has(transaction.id)}
                      onChange={() => togglePendingSelection(transaction.id)}
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{transaction.date}</td>
                  <td className="px-4 py-3 font-medium text-slate-950">{dealers.find((dealer) => dealer.id === transaction.dealerId)?.name}</td>
                  <td className="whitespace-nowrap px-4 py-3">{formatTransactionType(transaction.type)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <p className="font-semibold text-slate-950">{formatUsd(transaction.usdAmount ?? transaction.amount)}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatOriginalMoney(transaction)} @ {formatExchangeRate(transaction.exchangeRateToUsd)}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{transaction.createdByRole || 'admin'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="primary" onClick={() => updateStatus(transaction.id, 'confirmed')}>
                        Approve
                      </Button>
                      <Button variant="danger" onClick={() => updateStatus(transaction.id, 'rejected')}>
                        Reject
                      </Button>
                      <Button variant="danger" onClick={() => deleteTransaction(transaction)}>
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </SectionCard>

      <SectionCard
        title="Transaction Ledger"
        subtitle={
          showPendingInLedger
            ? 'All visible transactions matching the current filters.'
            : 'Pending transactions are shown above in Approval Queue.'
        }
        action={
          role === 'admin' ? (
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-indigoBrand"
                checked={showPendingInLedger}
                onChange={(event) => setShowPendingInLedger(event.target.checked)}
              />
              Show pending in ledger
            </label>
          ) : undefined
        }
      >
        {ledgerRows.length === 0 ? (
          <EmptyState title="No transactions match the current filters." />
        ) : (
          <DataTable>
            <thead className="bg-slate-100/70 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {role === 'admin' && <th className="px-4 py-3">Select</th>}
                <th className="px-4 py-3">Dealer</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {ledgerRows.map((transaction) => (
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
                  {role === 'admin' && (
                    <td className="px-4 py-3">
                      {transaction.status === 'pending_review' ? (
                        <input
                          aria-label={`Select transaction ${transaction.id}`}
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-indigoBrand"
                          checked={selectedPendingIds.has(transaction.id)}
                          onChange={() => togglePendingSelection(transaction.id)}
                        />
                      ) : (
                        <span className="text-xs text-slate-300">-</span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 font-medium text-slate-950">{dealers.find((dealer) => dealer.id === transaction.dealerId)?.name}</td>
                  <td className="whitespace-nowrap px-4 py-3">{formatTransactionType(transaction.type)}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <StatusBadge status={transaction.status} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <p className="font-semibold text-slate-950">{formatUsd(transaction.usdAmount ?? transaction.amount)}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatOriginalMoney(transaction)} @ {formatExchangeRate(transaction.exchangeRateToUsd)}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{transaction.orderCode || '-'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {role === 'admin' && (
                      <div className="flex justify-end gap-2">
                        {transaction.status === 'pending_review' && (
                          <>
                            <Button variant="primary" onClick={() => updateStatus(transaction.id, 'confirmed')}>
                              Approve
                            </Button>
                            <Button variant="danger" onClick={() => updateStatus(transaction.id, 'rejected')}>
                              Reject
                            </Button>
                          </>
                        )}
                        <Button variant="danger" onClick={() => deleteTransaction(transaction)}>
                          Delete
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
                    .map((assignment) => {
                      const dealer = dealers.find((row) => row.storeId === assignment.storeId);
                      return `${dealer?.storeName || dealer?.name || assignment.storeId} (${assignment.commissionRatePct}%)`;
                    })
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
  dealers,
  transactions,
  commissions,
  payments,
  allocations,
  setPayments,
  setAllocations,
  setCommissions,
  setFlash,
  onRecordEmployeePayment,
  onRecalculateCommissions,
}: {
  role: Role;
  employees: Employee[];
  dealers: Dealer[];
  transactions: SettlementTransaction[];
  commissions: EmployeeCommission[];
  payments: EmployeePayment[];
  allocations: EmployeePaymentAllocation[];
  setPayments: Dispatch<SetStateAction<EmployeePayment[]>>;
  setAllocations: Dispatch<SetStateAction<EmployeePaymentAllocation[]>>;
  setCommissions: Dispatch<SetStateAction<EmployeeCommission[]>>;
  setFlash: (value: string) => void;
  onRecordEmployeePayment?: (input: RecordEmployeePaymentInput) => Promise<void> | void;
  onRecalculateCommissions?: (employee: Employee) => Promise<void> | void;
}) {
  const { employeeId } = useParams();
  const [form, setForm] = useState({
    paymentDate: '2026-05-01',
    amount: '',
    currency: 'TRY' as SupportedCurrency,
    exchangeRateToUsd: '',
    description: '',
    mode: 'fifo' as 'fifo' | 'manual',
  });
  const [manual, setManual] = useState<Record<string, string>>({});
  const [showZeroCommissionRows, setShowZeroCommissionRows] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const employeePaymentRate = useExchangeRateAutofill({
    currency: form.currency,
    date: form.paymentDate,
    setExchangeRateToUsd: (value) => setForm((previous) => ({ ...previous, exchangeRateToUsd: value })),
  });

  if (role !== 'admin') return <Navigate to="/" replace />;
  const employee = employees.find((row) => row.id === employeeId);
  if (!employee) return <PageShell title="Employee Profile" subtitle="Not found" />;

  const employeeCommissions = commissions.filter((commission) => commission.employeeId === employee.id);
  const openCommissions = getOpenCommissionsForEmployee(employee.id, commissions, allocations);
  const rows = getEmployeeCommissionLedgerRows(employee.id, commissions, payments);
  const ledgerRows = rows.filter(
    (row) => !row.commission || showZeroCommissionRows || !isZeroCommissionRow(row.commission),
  );
  const activeAssignedStoreIds = new Set(
    employee.assignments
      .filter((assignment) => assignment.status === 'active')
      .map((assignment) => assignment.storeId),
  );
  const assignedDealerIds = new Set(
    dealers
      .filter((dealer) => activeAssignedStoreIds.has(dealer.storeId))
      .map((dealer) => dealer.id),
  );
  const pendingAssignedTransactions = transactions.filter(
    (transaction) => transaction.status === 'pending_review' && assignedDealerIds.has(transaction.dealerId),
  );
  const pendingAssignedStoreNames = Array.from(
    new Set(
      pendingAssignedTransactions.map((transaction) => {
        const dealer = dealers.find((row) => row.id === transaction.dealerId);
        return dealer?.storeName || dealer?.name || transaction.dealerId;
      }),
    ),
  );
  const paymentUsdPreview = calculateUsdPreview(form.amount, form.currency, form.exchangeRateToUsd);
  let running = 0;

  const recalculateCommissions = async () => {
    if (!onRecalculateCommissions) return;
    setRecalculating(true);
    try {
      await onRecalculateCommissions(employee);
    } finally {
      setRecalculating(false);
    }
  };

  const submit = async () => {
    const originalAmount = parsePositiveNumber(form.amount);
    const exchangeRateToUsd = getExchangeRateForSave(form.currency, form.exchangeRateToUsd);
    if (!originalAmount) {
      setFlash('Employee payment original amount must be positive.');
      return;
    }
    if (!exchangeRateToUsd) {
      setFlash('Exchange rate to USD must be greater than zero.');
      return;
    }
    const usdAmount = roundUsdAmount(originalAmount * exchangeRateToUsd);
    const openBalance = openCommissions.reduce((total, row) => total + row.remaining, 0);
    if (usdAmount > openBalance + 0.001) {
      setFlash('Payment USD equivalent cannot exceed open commission balance.');
      return;
    }

    let allocationRows: { commissionId: string; allocatedAmount: number }[] = [];
    if (form.mode === 'fifo') {
      let left = usdAmount;
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
      if (Math.abs(total - usdAmount) > 0.001) {
        setFlash('Manual allocation must equal the USD equivalent payment amount.');
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

    if (onRecordEmployeePayment) {
      await onRecordEmployeePayment({
        employee,
        amount: usdAmount,
        originalAmount,
        originalCurrency: form.currency,
        exchangeRateToUsd,
        usdAmount,
        paymentDate: form.paymentDate,
        description: form.description || 'Commission payment',
        allocationMode: form.mode,
        allocations: allocationRows,
        commissions,
        existingAllocations: allocations,
      });
      return;
    }

    const paymentId = `ep-${Date.now()}`;
    setPayments((previous) => [
      ...previous,
      {
        id: paymentId,
        employeeId: employee.id,
        amount: usdAmount,
        currency: form.currency,
        originalAmount,
        originalCurrency: form.currency,
        exchangeRateToUsd,
        usdAmount,
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
      allocatedUsdAmount: row.allocatedAmount,
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

      <SectionCard
        title="Commission Controls"
        subtitle="Refresh open commission rows from current confirmed transactions and assignment rates."
        action={
          <Button variant="primary" onClick={() => void recalculateCommissions()} disabled={recalculating}>
            {recalculating ? 'Recalculating...' : 'Recalculate Commissions'}
          </Button>
        }
      >
        <div className="space-y-3 p-5">
          <InfoCallout>
            Recalculation uses current confirmed transactions and current store assignment rates. Paid or partially paid
            commission rows are preserved.
          </InfoCallout>
          {pendingAssignedTransactions.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold">
                {pendingAssignedTransactions.length} pending transaction
                {pendingAssignedTransactions.length === 1 ? '' : 's'} for assigned stores are not included in commission totals.
              </p>
              <p className="mt-1 text-xs text-amber-800">
                Pending review rows become eligible only after admin approval. Stores: {pendingAssignedStoreNames.join(', ')}.
              </p>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Record Employee Payment" subtitle="Allocate commission payments with FIFO or manual controls.">
        <div className="space-y-4 p-5">
          <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
            <FormLabel label="Payment date">
              <input
                type="date"
                className="h-10 w-full px-3"
                value={form.paymentDate}
                onChange={(event) => setForm({ ...form, paymentDate: event.target.value })}
              />
            </FormLabel>
            <FormLabel label="Original payment amount">
              <input
                type="text"
                inputMode="decimal"
                className="h-10 w-full px-3"
                value={form.amount}
                onChange={(event) => setForm({ ...form, amount: event.target.value })}
                placeholder="0.00"
              />
            </FormLabel>
            <FormLabel label="Payment currency">
              <select
                className="h-10 w-full px-3"
                value={form.currency}
                onChange={(event) => setForm(handleCurrencyChange(form, event.target.value as SupportedCurrency))}
              >
                {employeePaymentCurrencyOptions.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </FormLabel>
            <FormLabel label="Exchange rate to USD">
              <input
                type="text"
                inputMode="decimal"
                className="h-10 w-full px-3"
                value={form.exchangeRateToUsd}
                onChange={(event) => {
                  employeePaymentRate.markManualOverride();
                  setForm({ ...form, exchangeRateToUsd: event.target.value });
                }}
                placeholder="0.0300"
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
          <div className="grid gap-3 md:grid-cols-[minmax(0,240px)_1fr]">
            <MoneyConversionPreview
              amount={form.amount}
              currency={form.currency}
              exchangeRateToUsd={form.exchangeRateToUsd}
            />
            <InfoCallout>
              Employee commissions are owed in USD. This payment will be allocated using its USD equivalent.
            </InfoCallout>
          </div>
          <ExchangeRateLookupStatus lookup={employeePaymentRate.lookup} />

          {form.mode === 'fifo' && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              FIFO applies {formatUsd(paymentUsdPreview)} to the oldest open commission rows first.
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
                    type="text"
                    inputMode="decimal"
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

      <SectionCard
        title="Commission Breakdown"
        subtitle="Detailed commission rows are calculated from each statement's company share minus costs, multiplied by the assigned store rate."
      >
        <CommissionBreakdownTable
          commissions={employeeCommissions}
          dealers={dealers}
          allocations={allocations}
          showZeroRows={showZeroCommissionRows}
          onToggleZeroRows={() => setShowZeroCommissionRows((value) => !value)}
        />
      </SectionCard>

      <SectionCard title="Commission Ledger" subtitle="Commission accruals and employee payment activity.">
        {ledgerRows.length === 0 ? (
          <EmptyState title="No commission or payment records yet." />
        ) : (
          <DataTable>
            <thead className="bg-slate-100/70 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Details</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right">Running</th>
              </tr>
            </thead>
            <tbody>
              {ledgerRows.map((row, index) => {
                running += row.amount;
                const isPayment = row.amount < 0;
                return (
                  <tr
                    key={row.commission?.id || row.payment?.id || `${row.date}-${index}`}
                    className={isPayment ? 'border-t border-slate-100 bg-emerald-50/40' : 'border-t border-slate-100 transition hover:bg-slate-50'}
                  >
                    <td className="px-4 py-3 text-slate-600">{row.date}</td>
                    <td className="px-4 py-3 font-medium text-slate-950">{row.kind}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {row.commission ? getCommissionLedgerDetails(row.commission, dealers) : row.description || '-'}
                    </td>
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
  onCreateAssignment,
}: {
  employees: Employee[];
  dealers: Dealer[];
  onUpdateAssignment: (employeeId: string, assignment: Assignment) => Promise<void> | void;
  onCreateAssignment: (employeeId: string, assignment: Assignment) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState<null | {
    employeeId: string;
    employeeName: string;
    storeName: string;
    assignment: Assignment;
    rate: string;
  }>(null);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    employeeId: '',
    dealerId: '',
    rate: '',
    canViewTransactions: true,
    canAddTransactions: true,
    canEditTransactions: false,
    canDeleteTransactions: false,
    canViewCommission: true,
    transactionApprovalMode: 'pending_review' as Assignment['transactionApprovalMode'],
    status: 'active' as AssignmentStatus,
  });
  const [error, setError] = useState('');
  const [createError, setCreateError] = useState('');
  const [saving, setSaving] = useState(false);
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
      storeName: row.store?.name || row.dealer?.storeName || row.dealer?.name || row.assignment.storeId,
      assignment: { ...row.assignment },
      rate: String(row.assignment.commissionRatePct),
    });
  };

  const openCreateAssignment = () => {
    setCreateError('');
    setCreateForm({
      employeeId: employees[0]?.id || '',
      dealerId: '',
      rate: '',
      canViewTransactions: true,
      canAddTransactions: true,
      canEditTransactions: false,
      canDeleteTransactions: false,
      canViewCommission: true,
      transactionApprovalMode: 'pending_review',
      status: 'active',
    });
    setCreating(true);
  };

  const updateEditingAssignment = (patch: Partial<Assignment>) => {
    setEditing((current) =>
      current ? { ...current, assignment: { ...current.assignment, ...patch } } : current,
    );
  };

  const saveAssignment = async () => {
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

    setSaving(true);
    setError('');

    try {
      await onUpdateAssignment(editing.employeeId, {
        ...editing.assignment,
        commissionRatePct,
      });
      setEditing(null);
    } catch (saveError) {
      const maybe = saveError as { message?: string };
      setError(maybe?.message || 'Assignment could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const saveNewAssignment = async () => {
    const employee = employees.find((row) => row.id === createForm.employeeId);
    const dealer = dealers.find((row) => row.id === createForm.dealerId);
    const trimmedRate = createForm.rate.trim();

    if (!employee) {
      setCreateError('Employee is required.');
      return;
    }
    if (!dealer) {
      setCreateError('Store / dealer is required.');
      return;
    }
    if (!trimmedRate) {
      setCreateError('Commission rate is required.');
      return;
    }

    const commissionRatePct = Number(trimmedRate);
    if (!Number.isFinite(commissionRatePct) || commissionRatePct < 0 || commissionRatePct > 100) {
      setCreateError('Commission rate must be a number between 0 and 100.');
      return;
    }

    const duplicate = employee.assignments.some(
      (assignment) => assignment.storeId === dealer.storeId || assignment.dealerId === dealer.id,
    );
    if (duplicate) {
      setCreateError('This employee is already assigned to this store.');
      return;
    }

    setSaving(true);
    setCreateError('');

    try {
      await onCreateAssignment(employee.id, {
        storeId: dealer.storeId,
        dealerId: dealer.id,
        commissionRatePct,
        canViewTransactions: createForm.canViewTransactions,
        canAddTransactions: createForm.canAddTransactions,
        canEditTransactions: createForm.canEditTransactions,
        canDeleteTransactions: createForm.canDeleteTransactions,
        canViewCommission: createForm.canViewCommission,
        transactionApprovalMode: createForm.transactionApprovalMode,
        status: createForm.status,
      });
      setCreating(false);
    } catch (saveError) {
      const maybe = saveError as { message?: string };
      setCreateError(maybe?.message || 'Assignment could not be created.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell title="Assignments" subtitle="Store access, transaction permissions, and commission assignments">
      <SectionCard
        title="Assignment Matrix"
        subtitle="Rate changes apply to future generated commissions only; existing commission rows are not regenerated automatically."
        action={
          <Button variant="primary" onClick={openCreateAssignment}>
            New Assignment
          </Button>
        }
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
              <th className="px-4 py-3">Delete Transactions</th>
              <th className="px-4 py-3">Employee Transaction Approval</th>
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
                <td className="px-4 py-3 font-medium text-slate-900">{row.store?.name || row.dealer?.storeName || row.dealer?.name || row.assignment.storeId}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-950">{row.assignment.commissionRatePct}%</td>
                <td className="px-4 py-3"><PermissionBadge enabled={row.assignment.canViewTransactions} /></td>
                <td className="px-4 py-3"><PermissionBadge enabled={row.assignment.canAddTransactions} /></td>
                <td className="px-4 py-3"><PermissionBadge enabled={row.assignment.canEditTransactions} /></td>
                <td className="px-4 py-3"><PermissionBadge enabled={row.assignment.canDeleteTransactions} /></td>
                <td className="px-4 py-3">
                  <span className="inline-flex rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-100">
                    {row.assignment.transactionApprovalMode === 'confirmed' ? 'Confirmed Immediately' : 'Pending Review'}
                  </span>
                </td>
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

      {creating && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/30 px-4 py-6">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="border-b border-slate-200 bg-gradient-to-b from-white to-slate-50 px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigoBrand">
                Assignment Management
              </p>
              <h3 className="mt-1 text-lg font-semibold text-slate-950">New Assignment</h3>
              <p className="mt-1 text-sm text-slate-500">
                Assign an employee to a dealer/store with commission and transaction permissions.
              </p>
            </div>

            <div className="space-y-5 p-5">
              {createError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {createError}
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <FormLabel label="Employee">
                  <select
                    aria-label="Employee"
                    className="h-10 w-full px-3"
                    value={createForm.employeeId}
                    onChange={(event) => setCreateForm({ ...createForm, employeeId: event.target.value })}
                  >
                    <option value="">Select employee</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.name}
                      </option>
                    ))}
                  </select>
                </FormLabel>

                <FormLabel label="Store / dealer">
                  <select
                    aria-label="Store / dealer"
                    className="h-10 w-full px-3"
                    value={createForm.dealerId}
                    onChange={(event) => setCreateForm({ ...createForm, dealerId: event.target.value })}
                  >
                    <option value="">Select store</option>
                    {dealers.map((dealer) => (
                      <option key={dealer.id} value={dealer.id}>
                        {dealer.storeName || dealer.name}
                      </option>
                    ))}
                  </select>
                </FormLabel>

                <FormLabel label="Commission rate">
                  <input
                    aria-label="New assignment commission rate"
                    className="h-10 w-full px-3"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={createForm.rate}
                    onChange={(event) => setCreateForm({ ...createForm, rate: event.target.value })}
                  />
                </FormLabel>

                <FormLabel label="Status">
                  <select
                    aria-label="New assignment status"
                    className="h-10 w-full px-3"
                    value={createForm.status}
                    onChange={(event) =>
                      setCreateForm({ ...createForm, status: event.target.value as AssignmentStatus })
                    }
                  >
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                  </select>
                </FormLabel>

                <FormLabel label="Employee Transaction Approval">
                  <select
                    aria-label="New assignment employee transaction approval"
                    className="h-10 w-full px-3"
                    value={createForm.transactionApprovalMode}
                    onChange={(event) =>
                      setCreateForm({
                        ...createForm,
                        transactionApprovalMode: event.target.value as Assignment['transactionApprovalMode'],
                      })
                    }
                  >
                    <option value="pending_review">Pending Review</option>
                    <option value="confirmed">Confirmed Immediately</option>
                  </select>
                </FormLabel>
              </div>

              <InfoCallout>
                When set to Confirmed Immediately, employee-created transactions affect statement totals as soon as they are submitted.
              </InfoCallout>

              <div className="grid gap-3 md:grid-cols-2">
                {[
                  ['Can view transactions', 'canViewTransactions'],
                  ['Can add transactions', 'canAddTransactions'],
                  ['Can edit transactions', 'canEditTransactions'],
                  ['Can delete transactions', 'canDeleteTransactions'],
                  ['Can view commission', 'canViewCommission'],
                ].map(([label, key]) => (
                  <label
                    key={key}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700"
                  >
                    <span>{label}</span>
                    <input
                      aria-label={`New assignment ${label}`}
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-indigoBrand"
                      checked={Boolean(createForm[key as keyof typeof createForm])}
                      onChange={(event) =>
                        setCreateForm({ ...createForm, [key]: event.target.checked })
                      }
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <Button onClick={() => setCreating(false)}>Cancel</Button>
              <Button variant="primary" onClick={saveNewAssignment}>
                {saving ? 'Creating...' : 'Create Assignment'}
              </Button>
            </div>
          </div>
        </div>
      )}

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

                <FormLabel label="Employee Transaction Approval">
                  <select
                    aria-label="Assignment employee transaction approval"
                    className="h-10 w-full px-3"
                    value={editing.assignment.transactionApprovalMode}
                    onChange={(event) =>
                      updateEditingAssignment({
                        transactionApprovalMode: event.target.value as Assignment['transactionApprovalMode'],
                      })
                    }
                  >
                    <option value="pending_review">Pending Review</option>
                    <option value="confirmed">Confirmed Immediately</option>
                  </select>
                </FormLabel>
              </div>

              <InfoCallout>
                When set to Confirmed Immediately, employee-created transactions affect statement totals as soon as they are submitted.
              </InfoCallout>

              <div className="grid gap-3 md:grid-cols-2">
                {[
                  ['Can view transactions', 'canViewTransactions'],
                  ['Can add transactions', 'canAddTransactions'],
                  ['Can edit transactions', 'canEditTransactions'],
                  ['Can delete transactions', 'canDeleteTransactions'],
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
                {saving ? 'Saving...' : 'Save Assignment'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

export function SettingsPage({
  onResetDemoData,
  dataModeLabel,
  commissionSyncStatus = 'not_run',
}: {
  onResetDemoData: () => void;
  dataModeLabel: string;
  commissionSyncStatus?: 'not_run' | 'ok' | 'failed';
}) {
  const commissionSyncLabel =
    commissionSyncStatus === 'failed'
      ? 'Last commission sync: failed'
      : commissionSyncStatus === 'ok'
        ? 'Last commission sync: completed'
        : 'Last commission sync: not run';

  return (
    <PageShell title="Settings" subtitle="Demo environment controls">
      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard title="System Status" subtitle="Current data source and runtime mode.">
          <div className="space-y-5 p-5">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Data source</p>
              <p className="text-sm font-medium text-slate-900">{dataModeLabel}</p>
            </div>
            <div className="space-y-2 border-t border-slate-200 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Commission sync</p>
              <p className={commissionSyncStatus === 'failed' ? 'text-sm font-medium text-amber-700' : 'text-sm font-medium text-slate-900'}>
                {commissionSyncLabel}
              </p>
              {commissionSyncStatus === 'failed' && (
                <p className="text-xs text-slate-500">View the browser console for technical details.</p>
              )}
            </div>
          </div>
        </SectionCard>
        <SectionCard title="Demo Data" subtitle="Local browser persistence controls.">
          <div className="p-5">
            <p className="mb-3 text-sm text-slate-600">Local demo data is persisted in your browser storage.</p>
            <Button variant="danger" onClick={onResetDemoData}>
              Reset Demo Data
            </Button>
          </div>
        </SectionCard>
      </div>
    </PageShell>
  );
}

export function MyCommissionsPage({
  role,
  employee,
  dealers,
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
  const [showZeroCommissionRows, setShowZeroCommissionRows] = useState(false);

  if (role !== 'employee') {
    return <PageShell title="My Commissions" subtitle="Switch to employee role to view this page" />;
  }

  const rows = getEmployeeCommissionLedgerRows(employee.id, commissions, payments);
  const ledgerRows = rows.filter(
    (row) => !row.commission || showZeroCommissionRows || !isZeroCommissionRow(row.commission),
  );

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
      <SectionCard
        title="Commission Breakdown"
        subtitle="Detailed commission rows are calculated from each statement's company share minus costs, multiplied by the assigned store rate."
      >
        <CommissionBreakdownTable
          commissions={commissions}
          dealers={dealers}
          allocations={allocations}
          showZeroRows={showZeroCommissionRows}
          onToggleZeroRows={() => setShowZeroCommissionRows((value) => !value)}
        />
      </SectionCard>

      <SectionCard title="Commission Ledger" subtitle="Commission accruals and payment activity.">
        {ledgerRows.length === 0 ? (
          <EmptyState title="No commission or payment records yet." />
        ) : (
          <DataTable>
            <thead className="bg-slate-100/70 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Details</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {ledgerRows.map((row, index) => {
                const isPayment = row.amount < 0;
                return (
                  <tr
                    key={row.commission?.id || row.payment?.id || `${row.date}-${index}`}
                    className={isPayment ? 'border-t border-slate-100 bg-emerald-50/40' : 'border-t border-slate-100 transition hover:bg-slate-50'}
                  >
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{row.date}</td>
                    <td className="px-4 py-3 font-medium text-slate-950 whitespace-nowrap">{row.kind}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {row.commission ? getCommissionLedgerDetails(row.commission, dealers) : row.description || '-'}
                    </td>
                    <td className={isPayment ? 'px-4 py-3 text-right font-semibold text-emerald-700 whitespace-nowrap' : 'px-4 py-3 text-right font-semibold text-slate-950 whitespace-nowrap'}>
                      {formatUsd(row.amount)}
                    </td>
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
