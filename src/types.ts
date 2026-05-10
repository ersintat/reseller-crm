export type Role = 'admin' | 'employee';
export type TransactionType = 'bank_payout' | 'store_expense' | 'printing_cost' | 'shipping_cost' | 'manual_adjustment';
export type TransactionStatus = 'confirmed' | 'pending_review' | 'rejected';
export type ManualAdjustmentScope = 'dealer_receivable_only' | 'shareable_net' | 'employee_commission_base';
export type ManualAdjustmentDirection = 'increase' | 'decrease';
export type StatementStatus = 'draft' | 'ready_to_close' | 'open' | 'partially_paid' | 'carried_forward' | 'closed';
export type PaymentAllocationMode = 'fifo' | 'manual';
export type CommissionStatus = 'open' | 'partially_paid' | 'paid' | 'closed';

export interface Store { id: string; name: string }
export interface Dealer {
  id: string;
  name: string;
  storeId: string;
  status: 'active' | 'review' | 'inactive';
  dealerSharePercentage: number;
  companySharePercentage: number;
  storeName?: string;
  platform?: string | null;
  currency?: string;
  notes?: string | null;
  supabaseId?: string;
}
export interface Statement { id: string; dealerId: string; month: string; status: StatementStatus; paidAmount: number; createdAt?: string; supabaseId?: string }
export interface MoneyInUsd {
  amount: number;
  originalAmount?: number;
  originalCurrency?: string;
  exchangeRateToUsd?: number;
  usdAmount?: number;
}
export interface SettlementTransaction extends MoneyInUsd { id: string; dealerId: string; statementId: string; date: string; type: TransactionType; status: TransactionStatus; description?: string; orderCode?: string; adjustmentScope?: ManualAdjustmentScope; adjustmentDirection?: ManualAdjustmentDirection; notes?: string; createdByRole?: Role; supabaseId?: string }
export interface DealerPayment extends MoneyInUsd { id: string; dealerId: string; currency: string; paymentDate: string; description: string; allocationMode: PaymentAllocationMode; createdBy: Role; createdAt: string }
export interface DealerPaymentAllocation { id: string; paymentId: string; statementId: string; allocatedAmount: number; allocatedUsdAmount?: number }
export interface EmployeeCommission { id: string; employeeId: string; dealerId: string; statementId: string; periodMonth: number; periodYear: number; companyShareAmount: number; printingCosts: number; shippingCosts: number; commissionBaseAdjustments: number; commissionBase: number; commissionRate: number; commissionAmount: number; paidAmount: number; remainingAmount: number; status: CommissionStatus; createdAt: string; currency?: string; supabaseId?: string }
export interface EmployeePayment extends MoneyInUsd { id: string; employeeId: string; currency: string; paymentDate: string; description: string; allocationMode: PaymentAllocationMode; createdBy: Role; createdAt: string; supabaseId?: string }
export interface EmployeePaymentAllocation { id: string; paymentId: string; commissionId: string; allocatedAmount: number; allocatedUsdAmount?: number; supabaseId?: string }
export type AssignmentStatus = 'active' | 'inactive';
export interface Assignment { storeId: string; commissionRatePct: number; canViewTransactions: boolean; canAddTransactions: boolean; canEditTransactions: boolean; canViewCommission: boolean; status: AssignmentStatus; supabaseId?: string; dealerId?: string }
export interface Employee { id: string; name: string; roleTitle: string; assignments: Assignment[]; email?: string | null; status?: 'active' | 'inactive'; supabaseId?: string }
