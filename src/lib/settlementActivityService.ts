import { supabase } from './supabaseClient';
import {
  Dealer,
  ManualAdjustmentDirection,
  ManualAdjustmentScope,
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

export interface CreateTransactionInput {
  date: string;
  type: TransactionType;
  amount: number;
  description?: string;
  orderCode?: string;
  adjustmentScope?: ManualAdjustmentScope;
  adjustmentDirection?: ManualAdjustmentDirection;
}

const toNumber = (value: number | string | null | undefined) => Number(value ?? 0);

const dealerBySupabaseId = (dealers: Dealer[]) =>
  new Map(dealers.map((dealer) => [dealer.supabaseId ?? dealer.id, dealer]));

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
