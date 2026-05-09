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
  date: string;
  order_code: string | null;
  description: string | null;
  adjustment_scope: ManualAdjustmentScope | null;
  adjustment_direction: ManualAdjustmentDirection | null;
  created_by_role: Role | null;
  status: TransactionStatus;
  created_at: string | null;
}

interface DealerPaymentRow {
  id: string;
  dealer_id: string;
  amount: number | string;
  currency: 'USD' | string | null;
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
  created_at: string | null;
}

interface EmployeePaymentRow {
  id: string;
  employee_id: string;
  amount: number | string;
  currency: 'USD' | string | null;
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
  created_at: string | null;
}

export interface CreateTransactionInput {
  date: string;
  type: TransactionType;
  amount: number;
  description?: string;
  orderCode?: string;
  adjustmentScope?: ManualAdjustmentScope;
  adjustmentDirection?: ManualAdjustmentDirection;
}

export interface RecordDealerPaymentInput {
  dealer: Dealer;
  amount: number;
  paymentDate: string;
  description?: string;
  allocationMode: PaymentAllocationMode;
  allocations: { statementId: string; allocatedAmount: number }[];
  statements: Statement[];
}

export interface RecordEmployeePaymentInput {
  employee: Employee;
  amount: number;
  paymentDate: string;
  description?: string;
  allocationMode: PaymentAllocationMode;
  allocations: { commissionId: string; allocatedAmount: number }[];
  commissions: EmployeeCommission[];
  existingAllocations: EmployeePaymentAllocation[];
}

const toNumber = (value: number | string | null | undefined) => Number(value ?? 0);

const dealerBySupabaseId = (dealers: Dealer[]) =>
  new Map(dealers.map((dealer) => [dealer.supabaseId ?? dealer.id, dealer]));

const employeeBySupabaseId = (employees: Employee[]) =>
  new Map(employees.map((employee) => [employee.supabaseId ?? employee.id, employee]));

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

function mapTransaction(row: TransactionRow, dealers: Dealer[]): SettlementTransaction {
  const dealer = dealerBySupabaseId(dealers).get(row.dealer_id);
  return {
    id: row.id,
    supabaseId: row.id,
    dealerId: dealer?.id ?? row.dealer_id,
    statementId: row.statement_id,
    date: row.date,
    type: row.type,
    status: row.status,
    amount: toNumber(row.amount),
    description: row.description ?? undefined,
    orderCode: row.order_code ?? undefined,
    adjustmentScope: row.adjustment_scope ?? undefined,
    adjustmentDirection: row.adjustment_direction ?? undefined,
    createdByRole: row.created_by_role ?? undefined,
  };
}

function mapDealerPayment(row: DealerPaymentRow, dealers: Dealer[]): DealerPayment {
  const dealer = dealerBySupabaseId(dealers).get(row.dealer_id);
  return {
    id: row.id,
    dealerId: dealer?.id ?? row.dealer_id,
    amount: toNumber(row.amount),
    currency: 'USD',
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
    allocatedAmount: toNumber(row.allocated_amount),
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
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

function mapEmployeePayment(row: EmployeePaymentRow, employees: Employee[] = []): EmployeePayment {
  const employee = employeeBySupabaseId(employees).get(row.employee_id);
  return {
    id: row.id,
    supabaseId: row.id,
    employeeId: employee?.id ?? row.employee_id,
    amount: toNumber(row.amount),
    currency: 'USD',
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
    allocatedAmount: toNumber(row.allocated_amount),
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
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false });

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

export async function fetchTransactions(dealers: Dealer[]): Promise<SettlementTransaction[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('transactions')
    .select(
      'id,dealer_id,statement_id,type,amount,date,order_code,description,adjustment_scope,adjustment_direction,created_by_role,status,created_at',
    )
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as TransactionRow[]).map((row) => mapTransaction(row, dealers));
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
  const status: TransactionStatus = role === 'admin' ? 'confirmed' : 'pending_review';

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      dealer_id: dealer.supabaseId ?? dealer.id,
      statement_id: statement.supabaseId ?? statement.id,
      type: input.type,
      amount: input.amount,
      currency: dealer.currency ?? 'USD',
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
      'id,dealer_id,statement_id,type,amount,date,order_code,description,adjustment_scope,adjustment_direction,created_by_role,status,created_at',
    )
    .single();

  if (error) throw error;
  return mapTransaction(data as TransactionRow, [dealer]);
}

export async function updateTransaction(
  transactionId: string,
  patch: Partial<Pick<SettlementTransaction, 'status' | 'description' | 'orderCode'>>,
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { error } = await supabase
    .from('transactions')
    .update({
      status: patch.status,
      description: patch.description,
      order_code: patch.orderCode,
    })
    .eq('id', transactionId);

  if (error) throw error;
}

export const approveTransaction = (transactionId: string) =>
  updateTransaction(transactionId, { status: 'confirmed' });

export const rejectTransaction = (transactionId: string) =>
  updateTransaction(transactionId, { status: 'rejected' });

export async function fetchDealerPayments(dealers: Dealer[]): Promise<DealerPayment[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('dealer_payments')
    .select('id,dealer_id,amount,currency,payment_date,description,allocation_mode,created_at')
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
    .select('id,payment_id,statement_id,allocated_amount,created_at')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return ((data ?? []) as DealerPaymentAllocationRow[]).map((row) =>
    mapDealerPaymentAllocation(row, statements),
  );
}

export async function createDealerPayment({
  dealer,
  amount,
  paymentDate,
  description,
  allocationMode,
}: Omit<RecordDealerPaymentInput, 'allocations' | 'statements'>): Promise<DealerPayment> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const userId = await currentUserId();

  const { data, error } = await supabase
    .from('dealer_payments')
    .insert({
      dealer_id: dealer.supabaseId ?? dealer.id,
      amount,
      currency: dealer.currency ?? 'USD',
      payment_date: paymentDate,
      description: description || 'Dealer payment',
      allocation_mode: allocationMode,
      created_by: userId,
    })
    .select('id,dealer_id,amount,currency,payment_date,description,allocation_mode,created_at')
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
    };
  });

  const { data, error } = await supabase
    .from('dealer_payment_allocations')
    .insert(rows)
    .select('id,payment_id,statement_id,allocated_amount,created_at');

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

const commissionSelect =
  'id,employee_id,dealer_id,statement_id,period_month,period_year,company_share_amount,printing_costs,shipping_costs,commission_base_adjustments,commission_base,commission_rate,commission_amount,paid_amount,remaining_amount,status,created_at';

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

  const rows = commissions
    .map((commission) => {
      const employee = employeesById.get(commission.employeeId);
      const dealer = dealersById.get(commission.dealerId);
      const statement = statementsById.get(commission.statementId);
      if (!employee || !dealer || !statement) return null;

      return {
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
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (rows.length === 0) return [];

  const { data, error } = await supabase
    .from('employee_commissions')
    .upsert(rows, { onConflict: 'employee_id,statement_id' })
    .select(commissionSelect);

  if (error) throw error;
  return ((data ?? []) as EmployeeCommissionRow[]).map((row) =>
    mapEmployeeCommission(row, employees, dealers, statements),
  );
}

export async function fetchEmployeePayments(employees: Employee[]): Promise<EmployeePayment[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('employee_payments')
    .select('id,employee_id,amount,currency,payment_date,description,allocation_mode,created_at')
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
    .select('id,payment_id,commission_id,allocated_amount,created_at')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return ((data ?? []) as EmployeePaymentAllocationRow[]).map((row) =>
    mapEmployeePaymentAllocation(row, commissions),
  );
}

export async function createEmployeePayment({
  employee,
  amount,
  paymentDate,
  description,
  allocationMode,
}: Omit<RecordEmployeePaymentInput, 'allocations' | 'commissions' | 'existingAllocations'>): Promise<EmployeePayment> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const userId = await currentUserId();

  const { data, error } = await supabase
    .from('employee_payments')
    .insert({
      employee_id: employee.supabaseId ?? employee.id,
      amount,
      currency: 'USD',
      payment_date: paymentDate,
      description: description || 'Commission payment',
      allocation_mode: allocationMode,
      created_by: userId,
    })
    .select('id,employee_id,amount,currency,payment_date,description,allocation_mode,created_at')
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
    };
  });

  const { data, error } = await supabase
    .from('employee_payment_allocations')
    .insert(rows)
    .select('id,payment_id,commission_id,allocated_amount,created_at');

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
