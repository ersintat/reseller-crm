import { supabase } from './supabaseClient';
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
  PaymentAllocationMode,
  PendingOrderCost,
  PendingOrderCostScope,
  PendingOrderCostStatus,
  Role,
  SettlementTransaction,
  Statement,
  StatementStatus,
  TransactionStatus,
  TransactionType,
} from '../types';

interface StatementRow {
  id: string;
  dealer_id: string;
  period_month: number;
  period_year: number;
  status: StatementStatus;
  paid_amount: number | string | null;
  created_at: string | null;
}

interface TransactionRow {
  id: string;
  dealer_id: string;
  statement_id: string;
  type: TransactionType;
  amount: number | string;
  currency: string | null;
  original_amount: number | string | null;
  original_currency: string | null;
  exchange_rate_to_usd: number | string | null;
  usd_amount: number | string | null;
  date: string;
  order_code: string | null;
  description: string | null;
  adjustment_scope: ManualAdjustmentScope | null;
  adjustment_direction: ManualAdjustmentDirection | null;
  created_by: string | null;
  created_by_role: Role | null;
  status: TransactionStatus;
  created_at: string | null;
}

interface DealerPaymentRow {
  id: string;
  dealer_id: string;
  amount: number | string;
  currency: 'USD' | string | null;
  original_amount: number | string | null;
  original_currency: string | null;
  exchange_rate_to_usd: number | string | null;
  usd_amount: number | string | null;
  payment_date: string;
  description: string | null;
  allocation_mode: PaymentAllocationMode;
  created_at: string | null;
}

interface DealerPaymentAllocationRow {
  id: string;
  payment_id: string;
  statement_id: string;
  allocated_amount: number | string;
  allocated_usd_amount: number | string | null;
  created_at: string | null;
}

interface EmployeeCommissionRow {
  id: string;
  employee_id: string;
  dealer_id: string;
  statement_id: string;
  period_month: number;
  period_year: number;
  company_share_amount: number | string;
  printing_costs: number | string;
  shipping_costs: number | string;
  commission_base_adjustments: number | string;
  commission_base: number | string;
  commission_rate: number | string;
  commission_amount: number | string;
  paid_amount: number | string;
  remaining_amount: number | string;
  status: EmployeeCommission['status'];
  currency: string | null;
  created_at: string | null;
}

interface EmployeePaymentRow {
  id: string;
  employee_id: string;
  amount: number | string;
  currency: 'USD' | string | null;
  original_amount: number | string | null;
  original_currency: string | null;
  exchange_rate_to_usd: number | string | null;
  usd_amount: number | string | null;
  payment_date: string;
  description: string | null;
  allocation_mode: PaymentAllocationMode;
  created_at: string | null;
}

interface EmployeePaymentAllocationRow {
  id: string;
  payment_id: string;
  commission_id: string;
  allocated_amount: number | string;
  allocated_usd_amount: number | string | null;
  created_at: string | null;
}

interface PendingOrderCostRow {
  id: string;
  dealer_id: string;
  statement_id: string | null;
  order_code: string;
  cost_scope: PendingOrderCostScope;
  estimated_printing_cost: number | string | null;
  estimated_shipping_cost: number | string | null;
  final_printing_cost: number | string | null;
  final_shipping_cost: number | string | null;
  currency: string;
  exchange_rate_to_usd: number | string;
  note: string | null;
  status: PendingOrderCostStatus;
  created_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface CreateTransactionInput {
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
  status?: TransactionStatus;
}

export type UpdateTransactionInput = Partial<
  Pick<
    SettlementTransaction,
    | 'date'
    | 'type'
    | 'amount'
    | 'originalAmount'
    | 'originalCurrency'
    | 'exchangeRateToUsd'
    | 'usdAmount'
    | 'description'
    | 'orderCode'
    | 'adjustmentScope'
    | 'adjustmentDirection'
    | 'status'
  >
>;

export interface RecordDealerPaymentInput {
  dealer: Dealer;
  amount: number;
  originalAmount?: number;
  originalCurrency?: string;
  exchangeRateToUsd?: number;
  usdAmount?: number;
  paymentDate: string;
  description?: string;
  allocationMode: PaymentAllocationMode;
  allocations: { statementId: string; allocatedAmount: number }[];
  statements: Statement[];
}

export interface RecordEmployeePaymentInput {
  employee: Employee;
  amount: number;
  originalAmount?: number;
  originalCurrency?: string;
  exchangeRateToUsd?: number;
  usdAmount?: number;
  paymentDate: string;
  description?: string;
  allocationMode: PaymentAllocationMode;
  allocations: { commissionId: string; allocatedAmount: number }[];
  commissions: EmployeeCommission[];
  existingAllocations: EmployeePaymentAllocation[];
}

export interface PendingOrderCostInput {
  dealer: Dealer;
  statement?: Statement | null;
  orderCode: string;
  costScope: PendingOrderCostScope;
  estimatedPrintingCost?: number | null;
  estimatedShippingCost?: number | null;
  currency: string;
  exchangeRateToUsd: number;
  note?: string | null;
}

export interface PendingOrderCostUpdateInput {
  orderCode?: string;
  costScope?: PendingOrderCostScope;
  estimatedPrintingCost?: number | null;
  estimatedShippingCost?: number | null;
  finalPrintingCost?: number | null;
  finalShippingCost?: number | null;
  currency?: string;
  exchangeRateToUsd?: number;
  note?: string | null;
  status?: PendingOrderCostStatus;
  resolvedAt?: string | null;
}

export interface ResolvePendingOrderCostInput {
  pendingCost: PendingOrderCost;
  dealer: Dealer;
  statement: Statement;
  finalPrintingCost?: number | null;
  finalShippingCost?: number | null;
  currency: string;
  exchangeRateToUsd: number;
}

const toNumber = (value: number | string | null | undefined) => Number(value ?? 0);
const toOptionalNumber = (value: number | string | null | undefined) =>
  value === null || value === undefined ? undefined : Number(value);
const reportingCurrency = 'USD';
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function normalizeMoneyFields(input: {
  amount: number;
  originalAmount?: number;
  originalCurrency?: string;
  exchangeRateToUsd?: number;
  usdAmount?: number;
}) {
  const usdAmount = roundMoney(input.usdAmount ?? input.amount);
  return {
    usdAmount,
    originalAmount: input.originalAmount ?? input.amount,
    originalCurrency: input.originalCurrency ?? reportingCurrency,
    exchangeRateToUsd: input.exchangeRateToUsd ?? 1,
  };
}

const dealerBySupabaseId = (dealers: Dealer[]) =>
  new Map(dealers.map((dealer) => [dealer.supabaseId ?? dealer.id, dealer]));

const employeeBySupabaseId = (employees: Employee[]) =>
  new Map(employees.map((employee) => [employee.supabaseId ?? employee.id, employee]));

const statementBySupabaseId = (statements: Statement[]) =>
  new Map(statements.map((statement) => [statement.supabaseId ?? statement.id, statement]));

function mapStatement(row: StatementRow, dealers: Dealer[]): Statement {
  const dealer = dealerBySupabaseId(dealers).get(row.dealer_id);
  return {
    id: row.id,
    supabaseId: row.id,
    dealerId: dealer?.id ?? row.dealer_id,
    month: `${row.period_year}-${String(row.period_month).padStart(2, '0')}`,
    status: row.status,
    paidAmount: toNumber(row.paid_amount),
    createdAt: row.created_at ?? undefined,
  };
}

function mapTransaction(row: TransactionRow, dealers: Dealer[], statements: Statement[] = []): SettlementTransaction {
  const statement = statementBySupabaseId(statements).get(row.statement_id);
  const dealerFromStatement = statement
    ? dealers.find((candidate) => candidate.id === statement.dealerId)
    : undefined;
  const dealer = dealerBySupabaseId(dealers).get(row.dealer_id) ?? dealerFromStatement;
  const usdAmount = toNumber(row.usd_amount ?? row.amount);
  return {
    id: row.id,
    supabaseId: row.id,
    dealerId: dealer?.id ?? statement?.dealerId ?? row.dealer_id,
    statementId: statement?.id ?? row.statement_id,
    date: row.date,
    type: row.type,
    status: row.status,
    amount: usdAmount,
    originalAmount: toOptionalNumber(row.original_amount ?? row.amount),
    originalCurrency: row.original_currency ?? row.currency ?? 'USD',
    exchangeRateToUsd: toNumber(row.exchange_rate_to_usd ?? 1),
    usdAmount,
    description: row.description ?? undefined,
    orderCode: row.order_code ?? undefined,
    adjustmentScope: row.adjustment_scope ?? undefined,
    adjustmentDirection: row.adjustment_direction ?? undefined,
    createdBy: row.created_by,
    createdByRole: row.created_by_role ?? undefined,
  };
}

function mapDealerPayment(row: DealerPaymentRow, dealers: Dealer[]): DealerPayment {
  const dealer = dealerBySupabaseId(dealers).get(row.dealer_id);
  const usdAmount = toNumber(row.usd_amount ?? row.amount);
  return {
    id: row.id,
    dealerId: dealer?.id ?? row.dealer_id,
    amount: usdAmount,
    currency: row.currency ?? 'USD',
    originalAmount: toOptionalNumber(row.original_amount ?? row.amount),
    originalCurrency: row.original_currency ?? row.currency ?? 'USD',
    exchangeRateToUsd: toNumber(row.exchange_rate_to_usd ?? 1),
    usdAmount,
    paymentDate: row.payment_date,
    description: row.description ?? 'Dealer payment',
    allocationMode: row.allocation_mode,
    createdBy: 'admin',
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

function mapDealerPaymentAllocation(
  row: DealerPaymentAllocationRow,
  statements: Statement[] = [],
): DealerPaymentAllocation {
  const statement = statements.find((item) => (item.supabaseId ?? item.id) === row.statement_id);
  return {
    id: row.id,
    paymentId: row.payment_id,
    statementId: statement?.id ?? row.statement_id,
    allocatedAmount: toNumber(row.allocated_usd_amount ?? row.allocated_amount),
    allocatedUsdAmount: toOptionalNumber(row.allocated_usd_amount ?? row.allocated_amount),
  };
}

function mapEmployeeCommission(
  row: EmployeeCommissionRow,
  employees: Employee[] = [],
  dealers: Dealer[] = [],
  statements: Statement[] = [],
): EmployeeCommission {
  const employee = employeeBySupabaseId(employees).get(row.employee_id);
  const dealer = dealerBySupabaseId(dealers).get(row.dealer_id);
  const statement = statements.find((item) => (item.supabaseId ?? item.id) === row.statement_id);
  return {
    id: row.id,
    supabaseId: row.id,
    employeeId: employee?.id ?? row.employee_id,
    dealerId: dealer?.id ?? row.dealer_id,
    statementId: statement?.id ?? row.statement_id,
    periodMonth: row.period_month,
    periodYear: row.period_year,
    companyShareAmount: toNumber(row.company_share_amount),
    printingCosts: toNumber(row.printing_costs),
    shippingCosts: toNumber(row.shipping_costs),
    commissionBaseAdjustments: toNumber(row.commission_base_adjustments),
    commissionBase: toNumber(row.commission_base),
    commissionRate: toNumber(row.commission_rate),
    commissionAmount: toNumber(row.commission_amount),
    paidAmount: toNumber(row.paid_amount),
    remainingAmount: toNumber(row.remaining_amount),
    status: row.status,
    currency: row.currency ?? 'USD',
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

function mapEmployeePayment(row: EmployeePaymentRow, employees: Employee[] = []): EmployeePayment {
  const employee = employeeBySupabaseId(employees).get(row.employee_id);
  const usdAmount = toNumber(row.usd_amount ?? row.amount);
  return {
    id: row.id,
    supabaseId: row.id,
    employeeId: employee?.id ?? row.employee_id,
    amount: usdAmount,
    currency: row.currency ?? 'USD',
    originalAmount: toOptionalNumber(row.original_amount ?? row.amount),
    originalCurrency: row.original_currency ?? row.currency ?? 'USD',
    exchangeRateToUsd: toNumber(row.exchange_rate_to_usd ?? 1),
    usdAmount,
    paymentDate: row.payment_date,
    description: row.description ?? 'Commission payment',
    allocationMode: row.allocation_mode,
    createdBy: 'admin',
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

function mapEmployeePaymentAllocation(
  row: EmployeePaymentAllocationRow,
  commissions: EmployeeCommission[] = [],
): EmployeePaymentAllocation {
  const commission = commissions.find((item) => (item.supabaseId ?? item.id) === row.commission_id);
  return {
    id: row.id,
    supabaseId: row.id,
    paymentId: row.payment_id,
    commissionId: commission?.id ?? row.commission_id,
    allocatedAmount: toNumber(row.allocated_usd_amount ?? row.allocated_amount),
    allocatedUsdAmount: toOptionalNumber(row.allocated_usd_amount ?? row.allocated_amount),
  };
}

function mapPendingOrderCost(
  row: PendingOrderCostRow,
  dealers: Dealer[] = [],
  statements: Statement[] = [],
): PendingOrderCost {
  const dealer = dealerBySupabaseId(dealers).get(row.dealer_id);
  const statement = row.statement_id
    ? statements.find((item) => (item.supabaseId ?? item.id) === row.statement_id)
    : null;

  return {
    id: row.id,
    supabaseId: row.id,
    dealerId: dealer?.id ?? row.dealer_id,
    statementId: row.statement_id ? statement?.id ?? row.statement_id : null,
    orderCode: row.order_code,
    costScope: row.cost_scope,
    estimatedPrintingCost: toOptionalNumber(row.estimated_printing_cost),
    estimatedShippingCost: toOptionalNumber(row.estimated_shipping_cost),
    finalPrintingCost: toOptionalNumber(row.final_printing_cost),
    finalShippingCost: toOptionalNumber(row.final_shipping_cost),
    currency: row.currency,
    exchangeRateToUsd: toNumber(row.exchange_rate_to_usd),
    note: row.note,
    status: row.status,
    createdBy: row.created_by,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function currentUserId() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user?.id ?? null;
}

export async function fetchStatements(dealers: Dealer[]): Promise<Statement[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('statements')
    .select('id,dealer_id,period_month,period_year,status,paid_amount,created_at')
    .order('period_year', { ascending: true })
    .order('period_month', { ascending: true });

  if (error) throw error;
  return ((data ?? []) as StatementRow[]).map((row) => mapStatement(row, dealers));
}

export async function createStatement(dealer: Dealer, month: string): Promise<Statement> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const [periodYear, periodMonth] = month.split('-').map(Number);
  const dealerId = dealer.supabaseId ?? dealer.id;

  const { data, error } = await supabase
    .from('statements')
    .insert({
      dealer_id: dealerId,
      period_month: periodMonth,
      period_year: periodYear,
      status: 'draft',
      paid_amount: 0,
      remaining_amount: 0,
    })
    .select('id,dealer_id,period_month,period_year,status,paid_amount,created_at')
    .single();

  if (error) throw error;
  return mapStatement(data as StatementRow, [dealer]);
}

export async function updateStatementStatus(statementId: string, status: StatementStatus): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { error } = await supabase
    .from('statements')
    .update({
      status,
      closed_at: status === 'closed' ? new Date().toISOString() : null,
    })
    .eq('id', statementId);

  if (error) throw error;
}

export async function deleteStatementSafely(statementId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { count: dealerAllocationCount, error: dealerAllocationError } = await supabase
    .from('dealer_payment_allocations')
    .select('id', { count: 'exact', head: true })
    .eq('statement_id', statementId);

  if (dealerAllocationError) throw dealerAllocationError;
  if ((dealerAllocationCount ?? 0) > 0) {
    throw new Error('This statement has dealer payment allocations and cannot be deleted. Remove related payment allocations first.');
  }

  const { data: commissions, error: commissionError } = await supabase
    .from('employee_commissions')
    .select('id,status,paid_amount')
    .eq('statement_id', statementId);

  if (commissionError) throw commissionError;

  const commissionRows = (commissions ?? []) as Pick<EmployeeCommissionRow, 'id' | 'status' | 'paid_amount'>[];
  const commissionIds = commissionRows.map((commission) => commission.id);

  if (commissionIds.length > 0) {
    const { count: employeeAllocationCount, error: employeeAllocationError } = await supabase
      .from('employee_payment_allocations')
      .select('id', { count: 'exact', head: true })
      .in('commission_id', commissionIds);

    if (employeeAllocationError) throw employeeAllocationError;
    if ((employeeAllocationCount ?? 0) > 0) {
      throw new Error('This statement has paid employee commissions and cannot be deleted.');
    }
  }

  const hasPaidCommission = commissionRows.some(
    (commission) =>
      ['paid', 'partially_paid'].includes(commission.status) || toNumber(commission.paid_amount) > 0,
  );
  if (hasPaidCommission) {
    throw new Error('This statement has paid employee commissions and cannot be deleted.');
  }

  if (commissionIds.length > 0) {
    const { error } = await supabase.from('employee_commissions').delete().in('id', commissionIds);
    if (error) throw error;
  }

  const { error: transactionError } = await supabase
    .from('transactions')
    .delete()
    .eq('statement_id', statementId);
  if (transactionError) throw transactionError;

  const { error: statementError } = await supabase.from('statements').delete().eq('id', statementId);
  if (statementError) throw statementError;
}

export async function fetchTransactions(dealers: Dealer[], statements: Statement[] = []): Promise<SettlementTransaction[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('transactions')
    .select(
      'id,dealer_id,statement_id,type,amount,currency,original_amount,original_currency,exchange_rate_to_usd,usd_amount,date,order_code,description,adjustment_scope,adjustment_direction,created_by,created_by_role,status,created_at',
    )
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as TransactionRow[]).map((row) => mapTransaction(row, dealers, statements));
}

const pendingOrderCostSelect =
  'id,dealer_id,statement_id,order_code,cost_scope,estimated_printing_cost,estimated_shipping_cost,final_printing_cost,final_shipping_cost,currency,exchange_rate_to_usd,note,status,created_by,resolved_at,created_at,updated_at';

const pendingOrderCostPatch = (updates: PendingOrderCostUpdateInput) => ({
  ...(updates.orderCode !== undefined ? { order_code: updates.orderCode } : {}),
  ...(updates.costScope !== undefined ? { cost_scope: updates.costScope } : {}),
  ...(updates.estimatedPrintingCost !== undefined ? { estimated_printing_cost: updates.estimatedPrintingCost } : {}),
  ...(updates.estimatedShippingCost !== undefined ? { estimated_shipping_cost: updates.estimatedShippingCost } : {}),
  ...(updates.finalPrintingCost !== undefined ? { final_printing_cost: updates.finalPrintingCost } : {}),
  ...(updates.finalShippingCost !== undefined ? { final_shipping_cost: updates.finalShippingCost } : {}),
  ...(updates.currency !== undefined ? { currency: updates.currency } : {}),
  ...(updates.exchangeRateToUsd !== undefined ? { exchange_rate_to_usd: updates.exchangeRateToUsd } : {}),
  ...(updates.note !== undefined ? { note: updates.note } : {}),
  ...(updates.status !== undefined ? { status: updates.status } : {}),
  ...(updates.resolvedAt !== undefined ? { resolved_at: updates.resolvedAt } : {}),
});

export async function fetchPendingOrderCosts(
  dealers: Dealer[],
  statements: Statement[] = [],
): Promise<PendingOrderCost[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('pending_order_costs')
    .select(pendingOrderCostSelect)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return ((data ?? []) as PendingOrderCostRow[]).map((row) => mapPendingOrderCost(row, dealers, statements));
}

export async function createPendingOrderCost(input: PendingOrderCostInput): Promise<PendingOrderCost> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const userId = await currentUserId();

  const { data, error } = await supabase
    .from('pending_order_costs')
    .insert({
      dealer_id: input.dealer.supabaseId ?? input.dealer.id,
      statement_id: input.statement ? input.statement.supabaseId ?? input.statement.id : null,
      order_code: input.orderCode,
      cost_scope: input.costScope,
      estimated_printing_cost: input.estimatedPrintingCost ?? null,
      estimated_shipping_cost: input.estimatedShippingCost ?? null,
      currency: input.currency,
      exchange_rate_to_usd: input.exchangeRateToUsd,
      note: input.note || null,
      status: 'pending',
      created_by: userId,
    })
    .select(pendingOrderCostSelect)
    .single();

  if (error) throw error;
  return mapPendingOrderCost(data as PendingOrderCostRow, [input.dealer], input.statement ? [input.statement] : []);
}

export async function updatePendingOrderCost(
  pendingCostId: string,
  updates: PendingOrderCostUpdateInput,
  dealers: Dealer[] = [],
  statements: Statement[] = [],
): Promise<PendingOrderCost> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { data, error } = await supabase
    .from('pending_order_costs')
    .update(pendingOrderCostPatch(updates))
    .eq('id', pendingCostId)
    .select(pendingOrderCostSelect)
    .single();

  if (error) throw error;
  return mapPendingOrderCost(data as PendingOrderCostRow, dealers, statements);
}

export const cancelPendingOrderCost = (
  pendingCostId: string,
  dealers: Dealer[] = [],
  statements: Statement[] = [],
) => updatePendingOrderCost(pendingCostId, { status: 'cancelled' }, dealers, statements);

const getResolvedStatus = (
  scope: PendingOrderCostScope,
  finalPrintingCost?: number | null,
  finalShippingCost?: number | null,
): PendingOrderCostStatus => {
  const printingResolved = (finalPrintingCost ?? 0) > 0;
  const shippingResolved = (finalShippingCost ?? 0) > 0;

  if (scope === 'printing') return printingResolved ? 'resolved' : 'pending';
  if (scope === 'shipping') return shippingResolved ? 'resolved' : 'pending';
  if (printingResolved && shippingResolved) return 'resolved';
  if (printingResolved || shippingResolved) return 'partially_resolved';
  return 'pending';
};

export async function resolvePendingOrderCost({
  pendingCost,
  dealer,
  statement,
  finalPrintingCost,
  finalShippingCost,
  currency,
  exchangeRateToUsd,
}: ResolvePendingOrderCostInput): Promise<{
  pendingCost: PendingOrderCost;
  transactions: SettlementTransaction[];
}> {
  const createdTransactions: SettlementTransaction[] = [];
  const transactionDate = new Date().toISOString().slice(0, 10);
  const existingPrintingResolved = (pendingCost.finalPrintingCost ?? 0) > 0;
  const existingShippingResolved = (pendingCost.finalShippingCost ?? 0) > 0;
  const nextPrintingCost = finalPrintingCost ?? pendingCost.finalPrintingCost ?? null;
  const nextShippingCost = finalShippingCost ?? pendingCost.finalShippingCost ?? null;

  if (!existingPrintingResolved && (nextPrintingCost ?? 0) > 0) {
    const usdAmount = roundMoney((nextPrintingCost ?? 0) * exchangeRateToUsd);
    createdTransactions.push(
      await createTransaction({
        dealer,
        statement,
        role: 'admin',
        input: {
          date: transactionDate,
          type: 'printing_cost',
          amount: usdAmount,
          originalAmount: nextPrintingCost ?? 0,
          originalCurrency: currency,
          exchangeRateToUsd,
          usdAmount,
          orderCode: pendingCost.orderCode,
          description: `Resolved pending printing cost for ${pendingCost.orderCode}`,
        },
      }),
    );
  }

  if (!existingShippingResolved && (nextShippingCost ?? 0) > 0) {
    const usdAmount = roundMoney((nextShippingCost ?? 0) * exchangeRateToUsd);
    createdTransactions.push(
      await createTransaction({
        dealer,
        statement,
        role: 'admin',
        input: {
          date: transactionDate,
          type: 'shipping_cost',
          amount: usdAmount,
          originalAmount: nextShippingCost ?? 0,
          originalCurrency: currency,
          exchangeRateToUsd,
          usdAmount,
          orderCode: pendingCost.orderCode,
          description: `Resolved pending shipping cost for ${pendingCost.orderCode}`,
        },
      }),
    );
  }

  const status = getResolvedStatus(pendingCost.costScope, nextPrintingCost, nextShippingCost);
  const updated = await updatePendingOrderCost(
    pendingCost.supabaseId ?? pendingCost.id,
    {
      finalPrintingCost: nextPrintingCost,
      finalShippingCost: nextShippingCost,
      currency,
      exchangeRateToUsd,
      status,
      resolvedAt: status === 'resolved' ? new Date().toISOString() : null,
    },
    [dealer],
    [statement],
  );

  return { pendingCost: updated, transactions: createdTransactions };
}

export async function createTransaction({
  dealer,
  statement,
  input,
  role,
}: {
  dealer: Dealer;
  statement: Statement;
  input: CreateTransactionInput;
  role: Role;
}): Promise<SettlementTransaction> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const userId = await currentUserId();
  const status: TransactionStatus = role === 'admin' ? 'confirmed' : input.status ?? 'pending_review';
  const money = normalizeMoneyFields(input);

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      dealer_id: dealer.supabaseId ?? dealer.id,
      statement_id: statement.supabaseId ?? statement.id,
      type: input.type,
      amount: money.usdAmount,
      currency: money.originalCurrency,
      original_amount: money.originalAmount,
      original_currency: money.originalCurrency,
      exchange_rate_to_usd: money.exchangeRateToUsd,
      usd_amount: money.usdAmount,
      date: input.date,
      order_code: input.orderCode || null,
      description: input.description || null,
      adjustment_scope: input.type === 'manual_adjustment' ? input.adjustmentScope : null,
      adjustment_direction: input.type === 'manual_adjustment' ? input.adjustmentDirection : null,
      created_by: userId,
      created_by_role: role,
      status,
    })
    .select(
      'id,dealer_id,statement_id,type,amount,currency,original_amount,original_currency,exchange_rate_to_usd,usd_amount,date,order_code,description,adjustment_scope,adjustment_direction,created_by,created_by_role,status,created_at',
    )
    .single();

  if (error) throw error;
  return mapTransaction(data as TransactionRow, [dealer], [statement]);
}

export async function updateTransaction(
  transactionId: string,
  patch: UpdateTransactionInput,
  dealers: Dealer[] = [],
  statements: Statement[] = [],
): Promise<SettlementTransaction | void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const moneyPatch =
    patch.amount !== undefined || patch.usdAmount !== undefined
      ? normalizeMoneyFields({
          amount: patch.amount ?? patch.usdAmount ?? 0,
          originalAmount: patch.originalAmount,
          originalCurrency: patch.originalCurrency,
          exchangeRateToUsd: patch.exchangeRateToUsd,
          usdAmount: patch.usdAmount ?? patch.amount,
        })
      : null;

  const updatePatch = {
    ...(patch.date !== undefined ? { date: patch.date } : {}),
    ...(patch.type !== undefined ? { type: patch.type } : {}),
    ...(moneyPatch ? {
      amount: moneyPatch.usdAmount,
      currency: moneyPatch.originalCurrency,
      original_amount: moneyPatch.originalAmount,
      original_currency: moneyPatch.originalCurrency,
      exchange_rate_to_usd: moneyPatch.exchangeRateToUsd,
      usd_amount: moneyPatch.usdAmount,
    } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.orderCode !== undefined ? { order_code: patch.orderCode } : {}),
    ...(patch.type !== undefined && patch.type !== 'manual_adjustment'
      ? { adjustment_scope: null, adjustment_direction: null }
      : {}),
    ...(patch.adjustmentScope !== undefined
      ? { adjustment_scope: patch.type === 'manual_adjustment' ? patch.adjustmentScope : null }
      : {}),
    ...(patch.adjustmentDirection !== undefined
      ? { adjustment_direction: patch.type === 'manual_adjustment' ? patch.adjustmentDirection : null }
      : {}),
  };

  const { data, error } = await supabase
    .from('transactions')
    .update(updatePatch)
    .eq('id', transactionId)
    .select(
      'id,dealer_id,statement_id,type,amount,currency,original_amount,original_currency,exchange_rate_to_usd,usd_amount,date,order_code,description,adjustment_scope,adjustment_direction,created_by,created_by_role,status,created_at',
    )
    .single();

  if (error) throw error;
  return mapTransaction(data as TransactionRow, dealers, statements);
}

export const approveTransaction = (transactionId: string) =>
  updateTransaction(transactionId, { status: 'confirmed' });

export const rejectTransaction = (transactionId: string) =>
  updateTransaction(transactionId, { status: 'rejected' });

export async function deleteTransactionSafely(transactionId: string, statementId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { data: commissions, error: commissionError } = await supabase
    .from('employee_commissions')
    .select('id,status,paid_amount')
    .eq('statement_id', statementId);

  if (commissionError) throw commissionError;

  const commissionRows = (commissions ?? []) as Pick<EmployeeCommissionRow, 'id' | 'status' | 'paid_amount'>[];
  const commissionIds = commissionRows.map((commission) => commission.id);

  if (commissionIds.length > 0) {
    const { count: employeeAllocationCount, error: employeeAllocationError } = await supabase
      .from('employee_payment_allocations')
      .select('id', { count: 'exact', head: true })
      .in('commission_id', commissionIds);

    if (employeeAllocationError) throw employeeAllocationError;
    if ((employeeAllocationCount ?? 0) > 0) {
      throw new Error('This transaction cannot be deleted because the statement has paid employee commissions.');
    }
  }

  const hasPaidCommission = commissionRows.some(
    (commission) =>
      ['paid', 'partially_paid'].includes(commission.status) || toNumber(commission.paid_amount) > 0,
  );
  if (hasPaidCommission) {
    throw new Error('This transaction cannot be deleted because the statement has paid employee commissions.');
  }

  if (commissionIds.length > 0) {
    const { error } = await supabase.from('employee_commissions').delete().in('id', commissionIds);
    if (error) throw error;
  }

  const { error: transactionError } = await supabase.from('transactions').delete().eq('id', transactionId);
  if (transactionError) throw transactionError;
}

export async function fetchDealerPayments(dealers: Dealer[]): Promise<DealerPayment[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('dealer_payments')
    .select('id,dealer_id,amount,currency,original_amount,original_currency,exchange_rate_to_usd,usd_amount,payment_date,description,allocation_mode,created_at')
    .order('payment_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as DealerPaymentRow[]).map((row) => mapDealerPayment(row, dealers));
}

export async function fetchDealerPaymentAllocations(
  statements: Statement[] = [],
): Promise<DealerPaymentAllocation[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('dealer_payment_allocations')
    .select('id,payment_id,statement_id,allocated_amount,allocated_usd_amount,created_at')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return ((data ?? []) as DealerPaymentAllocationRow[]).map((row) =>
    mapDealerPaymentAllocation(row, statements),
  );
}

export async function createDealerPayment({
  dealer,
  amount,
  originalAmount,
  originalCurrency,
  exchangeRateToUsd,
  usdAmount,
  paymentDate,
  description,
  allocationMode,
}: Omit<RecordDealerPaymentInput, 'allocations' | 'statements'>): Promise<DealerPayment> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const userId = await currentUserId();
  const money = normalizeMoneyFields({ amount, originalAmount, originalCurrency, exchangeRateToUsd, usdAmount });

  const { data, error } = await supabase
    .from('dealer_payments')
    .insert({
      dealer_id: dealer.supabaseId ?? dealer.id,
      amount: money.usdAmount,
      currency: money.originalCurrency,
      original_amount: money.originalAmount,
      original_currency: money.originalCurrency,
      exchange_rate_to_usd: money.exchangeRateToUsd,
      usd_amount: money.usdAmount,
      payment_date: paymentDate,
      description: description || 'Dealer payment',
      allocation_mode: allocationMode,
      created_by: userId,
    })
    .select('id,dealer_id,amount,currency,original_amount,original_currency,exchange_rate_to_usd,usd_amount,payment_date,description,allocation_mode,created_at')
    .single();

  if (error) throw error;
  return mapDealerPayment(data as DealerPaymentRow, [dealer]);
}

export async function createDealerPaymentAllocations({
  paymentId,
  allocations,
  statements,
}: {
  paymentId: string;
  allocations: { statementId: string; allocatedAmount: number }[];
  statements: Statement[];
}): Promise<DealerPaymentAllocation[]> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const statementById = new Map(statements.map((statement) => [statement.id, statement]));

  const rows = allocations.map((allocation) => {
    const statement = statementById.get(allocation.statementId);
    return {
      payment_id: paymentId,
      statement_id: statement?.supabaseId ?? allocation.statementId,
      allocated_amount: allocation.allocatedAmount,
      allocated_usd_amount: allocation.allocatedAmount,
    };
  });

  const { data, error } = await supabase
    .from('dealer_payment_allocations')
    .insert(rows)
    .select('id,payment_id,statement_id,allocated_amount,allocated_usd_amount,created_at');

  if (error) throw error;
  return ((data ?? []) as DealerPaymentAllocationRow[]).map((row) =>
    mapDealerPaymentAllocation(row, statements),
  );
}

export async function recordDealerPaymentWithAllocations(
  input: RecordDealerPaymentInput,
): Promise<{ payment: DealerPayment; allocations: DealerPaymentAllocation[] }> {
  const payment = await createDealerPayment(input);
  let allocations: DealerPaymentAllocation[] = [];

  try {
    allocations = await createDealerPaymentAllocations({
      paymentId: payment.id,
      allocations: input.allocations,
      statements: input.statements,
    });
  } catch (error) {
    if (supabase) {
      await supabase.from('dealer_payments').delete().eq('id', payment.id);
    }
    throw error;
  }

  return { payment, allocations };
}

export async function deleteDealerPayment(paymentId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { error: allocationError } = await supabase
    .from('dealer_payment_allocations')
    .delete()
    .eq('payment_id', paymentId);
  if (allocationError) throw allocationError;

  const { error: paymentError } = await supabase.from('dealer_payments').delete().eq('id', paymentId);
  if (paymentError) throw paymentError;
}

const commissionSelect =
  'id,employee_id,dealer_id,statement_id,period_month,period_year,company_share_amount,printing_costs,shipping_costs,commission_base_adjustments,commission_base,commission_rate,commission_amount,paid_amount,remaining_amount,status,currency,created_at';

const serializeSupabaseError = (error: unknown) => {
  const maybe = error as { code?: string; message?: string; details?: string; hint?: string };
  return {
    code: maybe?.code,
    message: maybe?.message,
    details: maybe?.details,
    hint: maybe?.hint,
  };
};

export async function fetchEmployeeCommissions({
  employees,
  dealers,
  statements,
}: {
  employees: Employee[];
  dealers: Dealer[];
  statements: Statement[];
}): Promise<EmployeeCommission[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('employee_commissions')
    .select(commissionSelect)
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as EmployeeCommissionRow[]).map((row) =>
    mapEmployeeCommission(row, employees, dealers, statements),
  );
}

export async function createOrUpdateEmployeeCommissions({
  commissions,
  employees,
  dealers,
  statements,
}: {
  commissions: EmployeeCommission[];
  employees: Employee[];
  dealers: Dealer[];
  statements: Statement[];
}): Promise<EmployeeCommission[]> {
  if (!supabase) throw new Error('Supabase is not configured.');
  if (commissions.length === 0) return [];

  const employeesById = new Map(employees.map((employee) => [employee.id, employee]));
  const dealersById = new Map(dealers.map((dealer) => [dealer.id, dealer]));
  const statementsById = new Map(statements.map((statement) => [statement.id, statement]));
  const debugRows: {
    employeeId: string;
    employeeSupabaseId?: string;
    dealerId: string;
    dealerSupabaseId?: string;
    statementId: string;
    statementSupabaseId?: string;
    period: string;
    payload?: unknown;
    skipped?: string;
  }[] = [];

  const rows = commissions
    .map((commission) => {
      const employee = employeesById.get(commission.employeeId);
      const dealer = dealersById.get(commission.dealerId);
      const statement = statementsById.get(commission.statementId);
      const context = {
        employeeId: commission.employeeId,
        employeeSupabaseId: employee?.supabaseId,
        dealerId: commission.dealerId,
        dealerSupabaseId: dealer?.supabaseId,
        statementId: commission.statementId,
        statementSupabaseId: statement?.supabaseId,
        period: `${commission.periodYear}-${String(commission.periodMonth).padStart(2, '0')}`,
      };
      if (!employee || !dealer || !statement) {
        debugRows.push({
          ...context,
          skipped: !employee ? 'missing employee mapping' : !dealer ? 'missing dealer mapping' : 'missing statement mapping',
        });
        return null;
      }

      const row = {
        employee_id: employee.supabaseId ?? employee.id,
        dealer_id: dealer.supabaseId ?? dealer.id,
        statement_id: statement.supabaseId ?? statement.id,
        period_month: commission.periodMonth,
        period_year: commission.periodYear,
        company_share_amount: commission.companyShareAmount,
        printing_costs: commission.printingCosts,
        shipping_costs: commission.shippingCosts,
        commission_base_adjustments: commission.commissionBaseAdjustments,
        commission_base: commission.commissionBase,
        commission_rate: commission.commissionRate,
        commission_amount: commission.commissionAmount,
        paid_amount: commission.paidAmount,
        remaining_amount: commission.remainingAmount,
        status: commission.status,
        currency: commission.currency ?? reportingCurrency,
      };
      debugRows.push({ ...context, payload: row });
      return row;
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (rows.length === 0) return [];

  const invalidRows = rows.filter((row) =>
    [
      row.period_month,
      row.period_year,
      row.company_share_amount,
      row.printing_costs,
      row.shipping_costs,
      row.commission_base_adjustments,
      row.commission_base,
      row.commission_rate,
      row.commission_amount,
      row.paid_amount,
      row.remaining_amount,
    ].some((value) => !Number.isFinite(Number(value))),
  );
  if (invalidRows.length > 0) {
    console.error('Invalid employee commission recalculation payload.', {
      invalidRows,
      debugRows,
    });
    throw new Error('Invalid employee commission recalculation payload.');
  }

  const { data, error } = await supabase
    .from('employee_commissions')
    .upsert(rows, { onConflict: 'employee_id,statement_id' })
    .select(commissionSelect);

  if (error) {
    console.error('Supabase employee commission upsert failed.', {
      error: serializeSupabaseError(error),
      rows,
      debugRows,
    });
    throw error;
  }
  return ((data ?? []) as EmployeeCommissionRow[]).map((row) =>
    mapEmployeeCommission(row, employees, dealers, statements),
  );
}

export async function fetchEmployeePayments(employees: Employee[]): Promise<EmployeePayment[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('employee_payments')
    .select('id,employee_id,amount,currency,original_amount,original_currency,exchange_rate_to_usd,usd_amount,payment_date,description,allocation_mode,created_at')
    .order('payment_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as EmployeePaymentRow[]).map((row) => mapEmployeePayment(row, employees));
}

export async function fetchEmployeePaymentAllocations(
  commissions: EmployeeCommission[] = [],
): Promise<EmployeePaymentAllocation[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('employee_payment_allocations')
    .select('id,payment_id,commission_id,allocated_amount,allocated_usd_amount,created_at')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return ((data ?? []) as EmployeePaymentAllocationRow[]).map((row) =>
    mapEmployeePaymentAllocation(row, commissions),
  );
}

export async function createEmployeePayment({
  employee,
  amount,
  originalAmount,
  originalCurrency,
  exchangeRateToUsd,
  usdAmount,
  paymentDate,
  description,
  allocationMode,
}: Omit<RecordEmployeePaymentInput, 'allocations' | 'commissions' | 'existingAllocations'>): Promise<EmployeePayment> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const userId = await currentUserId();
  const money = normalizeMoneyFields({ amount, originalAmount, originalCurrency, exchangeRateToUsd, usdAmount });

  const { data, error } = await supabase
    .from('employee_payments')
    .insert({
      employee_id: employee.supabaseId ?? employee.id,
      amount: money.usdAmount,
      currency: money.originalCurrency,
      original_amount: money.originalAmount,
      original_currency: money.originalCurrency,
      exchange_rate_to_usd: money.exchangeRateToUsd,
      usd_amount: money.usdAmount,
      payment_date: paymentDate,
      description: description || 'Commission payment',
      allocation_mode: allocationMode,
      created_by: userId,
    })
    .select('id,employee_id,amount,currency,original_amount,original_currency,exchange_rate_to_usd,usd_amount,payment_date,description,allocation_mode,created_at')
    .single();

  if (error) throw error;
  return mapEmployeePayment(data as EmployeePaymentRow, [employee]);
}

export async function createEmployeePaymentAllocations({
  paymentId,
  allocations,
  commissions,
}: {
  paymentId: string;
  allocations: { commissionId: string; allocatedAmount: number }[];
  commissions: EmployeeCommission[];
}): Promise<EmployeePaymentAllocation[]> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const commissionById = new Map(commissions.map((commission) => [commission.id, commission]));

  const rows = allocations.map((allocation) => {
    const commission = commissionById.get(allocation.commissionId);
    return {
      payment_id: paymentId,
      commission_id: commission?.supabaseId ?? allocation.commissionId,
      allocated_amount: allocation.allocatedAmount,
      allocated_usd_amount: allocation.allocatedAmount,
    };
  });

  const { data, error } = await supabase
    .from('employee_payment_allocations')
    .insert(rows)
    .select('id,payment_id,commission_id,allocated_amount,allocated_usd_amount,created_at');

  if (error) throw error;
  return ((data ?? []) as EmployeePaymentAllocationRow[]).map((row) =>
    mapEmployeePaymentAllocation(row, commissions),
  );
}

async function updateEmployeeCommissionPaymentStates({
  commissions,
  existingAllocations,
  newAllocations,
}: {
  commissions: EmployeeCommission[];
  existingAllocations: EmployeePaymentAllocation[];
  newAllocations: EmployeePaymentAllocation[];
}): Promise<EmployeeCommission[]> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const db = supabase;

  const touchedIds = new Set(newAllocations.map((allocation) => allocation.commissionId));
  const updates = commissions
    .filter((commission) => touchedIds.has(commission.id))
    .map((commission) => {
      const paidAmount = [...existingAllocations, ...newAllocations]
        .filter((allocation) => allocation.commissionId === commission.id)
        .reduce((total, allocation) => total + allocation.allocatedAmount, 0);
      const remainingAmount = Math.max(commission.commissionAmount - paidAmount, 0);
      return {
        commission,
        id: commission.supabaseId ?? commission.id,
        paid_amount: paidAmount,
        remaining_amount: remainingAmount,
        status: (remainingAmount === 0 ? 'paid' : paidAmount > 0 ? 'partially_paid' : 'open') as EmployeeCommission['status'],
      };
    });

  if (updates.length === 0) return [];

  const results = await Promise.all(
    updates.map((update) =>
      db
        .from('employee_commissions')
        .update({
          paid_amount: update.paid_amount,
          remaining_amount: update.remaining_amount,
          status: update.status,
        })
        .eq('id', update.id)
        .select('id')
        .single(),
    ),
  );

  const error = results.find((result) => result.error)?.error;
  if (error) throw error;

  return updates.map((update) => ({
    ...update.commission,
    paidAmount: update.paid_amount,
    remainingAmount: update.remaining_amount,
    status: update.status,
  }));
}

export async function recordEmployeePaymentWithAllocations(
  input: RecordEmployeePaymentInput,
): Promise<{
  payment: EmployeePayment;
  allocations: EmployeePaymentAllocation[];
  commissions: EmployeeCommission[];
}> {
  const payment = await createEmployeePayment(input);
  let allocations: EmployeePaymentAllocation[] = [];

  try {
    allocations = await createEmployeePaymentAllocations({
      paymentId: payment.id,
      allocations: input.allocations,
      commissions: input.commissions,
    });
    const commissions = await updateEmployeeCommissionPaymentStates({
      commissions: input.commissions,
      existingAllocations: input.existingAllocations,
      newAllocations: allocations,
    });
    return { payment, allocations, commissions };
  } catch (error) {
    if (supabase) {
      await supabase.from('employee_payments').delete().eq('id', payment.id);
    }
    throw error;
  }
}
