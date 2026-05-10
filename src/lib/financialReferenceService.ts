import { dealers as mockDealers, employees as mockEmployees } from '../data/mockData';
import { supabase } from './supabaseClient';
import { Assignment, Dealer, Employee } from '../types';

export type EmployeeAssignmentState = Record<string, Assignment[]>;

interface DealerRow {
  id: string;
  dealer_name: string;
  store_name: string;
  platform: string | null;
  dealer_share_percentage: number | string;
  company_share_percentage: number | string;
  currency: string | null;
  status: Dealer['status'];
  notes: string | null;
}

interface EmployeeRow {
  id: string;
  name: string;
  email: string | null;
  status: 'active' | 'inactive';
}

interface AssignmentRow {
  id: string;
  employee_id: string;
  dealer_id: string;
  commission_rate: number | string;
  can_view_transactions: boolean;
  can_add_transactions: boolean;
  can_edit_transactions: boolean;
  can_view_commission: boolean;
  status: 'active' | 'inactive';
}

export interface FinancialReferenceData {
  dealers: Dealer[];
  employees: Employee[];
  assignmentState: EmployeeAssignmentState;
}

type AssignmentUpdate = Pick<
  Assignment,
  | 'commissionRatePct'
  | 'canViewTransactions'
  | 'canAddTransactions'
  | 'canEditTransactions'
  | 'canViewCommission'
  | 'status'
>;

export type DealerUpdate = Pick<
  Dealer,
  | 'name'
  | 'storeName'
  | 'platform'
  | 'currency'
  | 'dealerSharePercentage'
  | 'companySharePercentage'
  | 'status'
  | 'notes'
>;

const normalizeName = (value: string) => value.trim().toLowerCase();

const findMockDealer = (row: Pick<DealerRow, 'dealer_name' | 'store_name'>) =>
  mockDealers.find(
    (dealer) =>
      normalizeName(dealer.name) === normalizeName(row.dealer_name) ||
      normalizeName(dealer.name) === normalizeName(row.store_name),
  );

const findMockEmployee = (row: Pick<EmployeeRow, 'name'>) =>
  mockEmployees.find((employee) => normalizeName(employee.name) === normalizeName(row.name));

const toNumber = (value: number | string | null | undefined) => Number(value ?? 0);

function mapDealer(row: DealerRow): Dealer {
  const mockDealer = findMockDealer(row);
  return {
    id: mockDealer?.id ?? row.id,
    name: row.dealer_name,
    storeId: mockDealer?.storeId ?? row.id,
    status: row.status,
    dealerSharePercentage: toNumber(row.dealer_share_percentage) / 100,
    companySharePercentage: toNumber(row.company_share_percentage) / 100,
    storeName: row.store_name,
    platform: row.platform,
    currency: row.currency ?? 'USD',
    notes: row.notes,
    supabaseId: row.id,
  };
}

function mapEmployee(row: EmployeeRow): Employee {
  const mockEmployee = findMockEmployee(row);
  return {
    id: mockEmployee?.id ?? row.id,
    name: row.name,
    roleTitle: row.name,
    assignments: [],
    email: row.email,
    status: row.status,
    supabaseId: row.id,
  };
}

export async function fetchFinancialDealers(): Promise<Dealer[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('dealers')
    .select(
      'id,dealer_name,store_name,platform,dealer_share_percentage,company_share_percentage,currency,status,notes',
    )
    .order('store_name', { ascending: true });

  if (error) throw error;
  return ((data ?? []) as DealerRow[]).map(mapDealer);
}

export async function fetchFinancialEmployees(): Promise<Employee[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('employees')
    .select('id,name,email,status')
    .order('name', { ascending: true });

  if (error) throw error;
  return ((data ?? []) as EmployeeRow[]).map(mapEmployee);
}

export async function fetchEmployeeStoreAssignments(
  dealers: Dealer[],
  employees: Employee[],
): Promise<EmployeeAssignmentState> {
  if (!supabase) return {};

  const { data, error } = await supabase
    .from('employee_store_assignments')
    .select(
      'id,employee_id,dealer_id,commission_rate,can_view_transactions,can_add_transactions,can_edit_transactions,can_view_commission,status',
    )
    .order('created_at', { ascending: true });

  if (error) throw error;

  const dealerBySupabaseId = new Map(dealers.map((dealer) => [dealer.supabaseId ?? dealer.id, dealer]));
  const employeeBySupabaseId = new Map(employees.map((employee) => [employee.supabaseId ?? employee.id, employee]));

  return ((data ?? []) as AssignmentRow[]).reduce<EmployeeAssignmentState>((output, row) => {
    const employee = employeeBySupabaseId.get(row.employee_id);
    const dealer = dealerBySupabaseId.get(row.dealer_id);
    if (!employee || !dealer) return output;

    output[employee.id] = [
      ...(output[employee.id] ?? []),
      {
        storeId: dealer.storeId,
        dealerId: dealer.id,
        commissionRatePct: toNumber(row.commission_rate),
        canViewTransactions: row.can_view_transactions,
        canAddTransactions: row.can_add_transactions,
        canEditTransactions: row.can_edit_transactions,
        canViewCommission: row.can_view_commission,
        status: row.status,
        supabaseId: row.id,
      },
    ];

    return output;
  }, {});
}

export async function fetchFinancialReferenceData(): Promise<FinancialReferenceData> {
  const dealers = await fetchFinancialDealers();
  const employees = await fetchFinancialEmployees();
  const assignmentState = await fetchEmployeeStoreAssignments(dealers, employees);

  return {
    dealers,
    employees,
    assignmentState,
  };
}

export async function updateEmployeeStoreAssignment(
  assignmentId: string,
  updates: Partial<AssignmentUpdate>,
): Promise<Assignment> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const patch: Partial<AssignmentRow> = {};
  if (updates.commissionRatePct !== undefined) patch.commission_rate = updates.commissionRatePct;
  if (updates.canViewTransactions !== undefined) patch.can_view_transactions = updates.canViewTransactions;
  if (updates.canAddTransactions !== undefined) patch.can_add_transactions = updates.canAddTransactions;
  if (updates.canEditTransactions !== undefined) patch.can_edit_transactions = updates.canEditTransactions;
  if (updates.canViewCommission !== undefined) patch.can_view_commission = updates.canViewCommission;
  if (updates.status !== undefined) patch.status = updates.status;

  const { data, error } = await supabase
    .from('employee_store_assignments')
    .update(patch)
    .eq('id', assignmentId)
    .select(
      'id,employee_id,dealer_id,commission_rate,can_view_transactions,can_add_transactions,can_edit_transactions,can_view_commission,status',
    )
    .single();

  if (error) throw error;

  const row = data as AssignmentRow;
  return {
    storeId: row.dealer_id,
    dealerId: row.dealer_id,
    commissionRatePct: toNumber(row.commission_rate),
    canViewTransactions: row.can_view_transactions,
    canAddTransactions: row.can_add_transactions,
    canEditTransactions: row.can_edit_transactions,
    canViewCommission: row.can_view_commission,
    status: row.status,
    supabaseId: row.id,
  };
}

export async function updateFinancialDealer(dealerId: string, updates: DealerUpdate): Promise<Dealer> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const patch = {
    dealer_name: updates.name,
    store_name: updates.storeName || updates.name,
    platform: updates.platform || null,
    currency: updates.currency || 'USD',
    dealer_share_percentage: updates.dealerSharePercentage * 100,
    company_share_percentage: updates.companySharePercentage * 100,
    status: updates.status,
    notes: updates.notes || null,
  };

  const { data, error } = await supabase
    .from('dealers')
    .update(patch)
    .eq('id', dealerId)
    .select(
      'id,dealer_name,store_name,platform,dealer_share_percentage,company_share_percentage,currency,status,notes',
    )
    .single();

  if (error) throw error;
  return mapDealer(data as DealerRow);
}
