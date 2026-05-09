export type Role = 'admin' | 'employee';
export type TransactionType = 'bank_payout' | 'store_expense' | 'printing_cost' | 'shipping_cost' | 'manual_adjustment';
export type TransactionStatus = 'confirmed' | 'pending_review' | 'rejected';
export type ManualAdjustmentScope = 'dealer_receivable_only' | 'shareable_net' | 'employee_commission_base';
export type ManualAdjustmentDirection = 'increase' | 'decrease';
export type StatementStatus = 'draft' | 'ready_to_close' | 'open' | 'partially_paid' | 'carried_forward' | 'closed';
export type PaymentAllocationMode = 'fifo' | 'manual';
export type CommissionStatus = 'open' | 'partially_paid' | 'paid' | 'closed';

export interface Store { id: string; name: string }
export interface Dealer { id: string; name: string; storeId: string; status: 'active' | 'review' | 'inactive'; dealerSharePercentage: number; companySharePercentage: number }
export interface Statement { id: string; dealerId: string; month: string; status: StatementStatus; paidAmount: number; createdAt?: string }
export interface SettlementTransaction { id: string; dealerId: string; statementId: string; date: string; type: TransactionType; status: TransactionStatus; amount: number; description?: string; orderCode?: string; adjustmentScope?: ManualAdjustmentScope; adjustmentDirection?: ManualAdjustmentDirection; notes?: string; createdByRole?: Role }
export interface DealerPayment { id: string; dealerId: string; amount: number; currency: 'USD'; paymentDate: string; description: string; allocationMode: PaymentAllocationMode; createdBy: Role; createdAt: string }
export interface DealerPaymentAllocation { id: string; paymentId: string; statementId: string; allocatedAmount: number }
export interface EmployeeCommission { id: string; employeeId: string; dealerId: string; statementId: string; periodMonth: number; periodYear: number; companyShareAmount: number; printingCosts: number; shippingCosts: number; commissionBaseAdjustments: number; commissionBase: number; commissionRate: number; commissionAmount: number; paidAmount: number; remainingAmount: number; status: CommissionStatus; createdAt: string }
export interface EmployeePayment { id: string; employeeId: string; amount: number; currency: 'USD'; paymentDate: string; description: string; allocationMode: PaymentAllocationMode; createdBy: Role; createdAt: string }
export interface EmployeePaymentAllocation { id: string; paymentId: string; commissionId: string; allocatedAmount: number }
export type AssignmentStatus = 'active' | 'inactive';
export interface Assignment { storeId: string; commissionRatePct: number; canViewTransactions: boolean; canAddTransactions: boolean; canEditTransactions: boolean; canViewCommission: boolean; status: AssignmentStatus }
export interface Employee { id: string; name: string; roleTitle: string; assignments: Assignment[] }
