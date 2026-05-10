import {
  Assignment,
  Dealer,
  DealerPayment,
  DealerPaymentAllocation,
  Employee,
  EmployeeCommission,
  EmployeePayment,
  EmployeePaymentAllocation,
  SettlementTransaction,
  Statement,
} from '../types';

export interface StatementTotals {
  dealer_receivable_amount: number;
  remaining_amount: number;
  paid_amount: number;
  total_bank_payouts: number;
  total_store_expenses: number;
  total_printing_costs: number;
  total_shipping_costs: number;
  shareable_net_amount: number;
  dealer_share_amount: number;
  company_share_amount: number;
}

export interface CommissionPreview {
  employee: Employee;
  assignment: Assignment;
  commissionBase: number;
  commissionRate: number;
  estimatedCommission: number;
}

const isConfirmed = (transaction: SettlementTransaction) => transaction.status === 'confirmed';
const isCommissionEligibleAssignment = (assignment: Assignment) => assignment.status === 'active';

const sumConfirmed = (transactions: SettlementTransaction[], type: SettlementTransaction['type']) =>
  transactions
    .filter((transaction) => transaction.type === type && isConfirmed(transaction))
    .reduce((total, transaction) => total + transaction.amount, 0);

const signedAdjustment = (
  transactions: SettlementTransaction[],
  scope: 'shareable_net' | 'dealer_receivable_only' | 'employee_commission_base',
) =>
  transactions
    .filter(
      (transaction) =>
        transaction.type === 'manual_adjustment' &&
        transaction.adjustmentScope === scope &&
        isConfirmed(transaction),
    )
    .reduce(
      (total, transaction) =>
        total + (transaction.adjustmentDirection === 'decrease' ? -transaction.amount : transaction.amount),
      0,
    );

export function calculateStatementTotals(
  statement: Statement,
  transactions: SettlementTransaction[],
  dealer: Dealer,
  paidAmountOverride?: number,
): StatementTotals {
  const scoped = transactions.filter((transaction) => transaction.statementId === statement.id);
  const total_bank_payouts = sumConfirmed(scoped, 'bank_payout');
  const total_store_expenses = sumConfirmed(scoped, 'store_expense');
  const total_printing_costs = sumConfirmed(scoped, 'printing_cost');
  const total_shipping_costs = sumConfirmed(scoped, 'shipping_cost');
  const adj_shareable = signedAdjustment(scoped, 'shareable_net');
  const adj_receivable = signedAdjustment(scoped, 'dealer_receivable_only');
  const shareable_net_amount = total_bank_payouts - total_store_expenses + adj_shareable;
  const dealer_share_amount = shareable_net_amount * dealer.dealerSharePercentage;
  const company_share_amount = shareable_net_amount * dealer.companySharePercentage;
  const dealer_receivable_amount = company_share_amount + total_printing_costs + total_shipping_costs + adj_receivable;
  const paid = paidAmountOverride ?? statement.paidAmount;

  return {
    dealer_receivable_amount,
    remaining_amount: dealer_receivable_amount - paid,
    paid_amount: paid,
    total_bank_payouts,
    total_store_expenses,
    total_printing_costs,
    total_shipping_costs,
    shareable_net_amount,
    dealer_share_amount,
    company_share_amount,
  };
}

export const getStatementPaidAmount = (statementId: string, allocations: DealerPaymentAllocation[]) =>
  allocations
    .filter((allocation) => allocation.statementId === statementId)
    .reduce((total, allocation) => total + allocation.allocatedAmount, 0);

export function getEffectiveStatementPaidAmount(statement: Statement, allocations: DealerPaymentAllocation[]) {
  const allocationPaid = getStatementPaidAmount(statement.id, allocations);
  return Math.max(statement.paidAmount, allocationPaid);
}

export const getStatementRemainingAmount = (
  statement: Statement,
  transactions: SettlementTransaction[],
  dealer: Dealer,
  allocations: DealerPaymentAllocation[],
) =>
  calculateStatementTotals(
    statement,
    transactions,
    dealer,
    getEffectiveStatementPaidAmount(statement, allocations),
  ).remaining_amount;

export const getOpenStatementsForDealer = (
  dealerId: string,
  statements: Statement[],
  transactions: SettlementTransaction[],
  dealers: Dealer[],
  allocations: DealerPaymentAllocation[],
) => {
  const dealer = dealers.find((row) => row.id === dealerId);
  if (!dealer) return [];

  return statements
    .filter((statement) => statement.dealerId === dealerId)
    .map((statement) => ({
      statement,
      remaining: getStatementRemainingAmount(statement, transactions, dealer, allocations),
    }))
    .filter((row) => row.remaining > 0);
};

export const getDealerOpenBalance = (
  dealerId: string,
  statements: Statement[],
  transactions: SettlementTransaction[],
  dealers: Dealer[],
  allocations: DealerPaymentAllocation[],
) =>
  getOpenStatementsForDealer(dealerId, statements, transactions, dealers, allocations).reduce(
    (total, row) => total + row.remaining,
    0,
  );

export const getCurrentMonthReceivable = (
  dealerId: string,
  statements: Statement[],
  transactions: SettlementTransaction[],
  dealers: Dealer[],
  allocations: DealerPaymentAllocation[],
  currentMonth = '2026-04',
) => {
  const dealer = dealers.find((row) => row.id === dealerId);
  if (!dealer) return 0;

  return statements
    .filter((statement) => statement.dealerId === dealerId && statement.month === currentMonth)
    .reduce(
      (total, statement) =>
        total +
        calculateStatementTotals(
          statement,
          transactions,
          dealer,
          getEffectiveStatementPaidAmount(statement, allocations),
        ).dealer_receivable_amount,
      0,
    );
};

export const getDashboardTotals = (
  statements: Statement[],
  transactions: SettlementTransaction[],
  dealers: Dealer[],
  allocations: DealerPaymentAllocation[],
) => ({
  openBalance: dealers.reduce(
    (total, dealer) => total + getDealerOpenBalance(dealer.id, statements, transactions, dealers, allocations),
    0,
  ),
  currentMonthReceivable: dealers.reduce(
    (total, dealer) =>
      total + getCurrentMonthReceivable(dealer.id, statements, transactions, dealers, allocations),
    0,
  ),
  pendingCount: transactions.filter((transaction) => transaction.status === 'pending_review').length,
});

export function allocateDealerPaymentFIFO({
  amount,
  openStatements,
}: {
  dealerId: string;
  amount: number;
  openStatements: { statement: Statement; remaining: number }[];
}) {
  const sorted = [...openStatements].sort(
    (a, b) =>
      a.statement.month.localeCompare(b.statement.month) ||
      (a.statement.createdAt || '').localeCompare(b.statement.createdAt || ''),
  );
  let remainingPayment = amount;
  const allocations: { statementId: string; allocatedAmount: number }[] = [];

  for (const row of sorted) {
    if (remainingPayment <= 0) break;
    const applied = Math.min(remainingPayment, row.remaining);
    if (applied > 0) {
      allocations.push({ statementId: row.statement.id, allocatedAmount: applied });
      remainingPayment -= applied;
    }
  }

  return allocations;
}

export function getDealerLedgerRows(
  dealerId: string,
  statements: Statement[],
  transactions: SettlementTransaction[],
  dealers: Dealer[],
  payments: DealerPayment[],
  allocations: DealerPaymentAllocation[],
) {
  const dealer = dealers.find((row) => row.id === dealerId);
  if (!dealer) return [];

  const rows: { date: string; kind: string; description: string; amount: number }[] = [];
  statements
    .filter((statement) => statement.dealerId === dealerId)
    .forEach((statement) => {
      const totals = calculateStatementTotals(
        statement,
        transactions,
        dealer,
        getEffectiveStatementPaidAmount(statement, allocations),
      );
      rows.push({
        date: statement.month,
        kind: 'Statement',
        description: `${statement.month} settlement`,
        amount: totals.dealer_receivable_amount,
      });
    });

  payments
    .filter((payment) => payment.dealerId === dealerId)
    .forEach((payment) =>
      rows.push({
        date: payment.paymentDate,
        kind: 'Payment Received from Dealer',
        description: payment.description || 'Dealer payment',
        amount: -payment.amount,
      }),
    );

  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

const getEmployeeCommissionBaseAdjustment = (transactions: SettlementTransaction[], statementId: string) =>
  signedAdjustment(
    transactions.filter((transaction) => transaction.statementId === statementId),
    'employee_commission_base',
  );

export function getCommissionPreviewForStatement(
  statement: Statement,
  transactions: SettlementTransaction[],
  dealer: Dealer,
  employee: Employee,
  assignment: Assignment,
) {
  const totals = calculateStatementTotals(statement, transactions, dealer);
  const adjustment = getEmployeeCommissionBaseAdjustment(transactions, statement.id);
  const commissionBase = Math.max(
    totals.company_share_amount - totals.total_printing_costs - totals.total_shipping_costs + adjustment,
    0,
  );
  const commissionRate = assignment.commissionRatePct / 100;

  return {
    employee,
    assignment,
    commissionBase,
    commissionRate,
    estimatedCommission: Math.max(commissionBase * commissionRate, 0),
  };
}

export function getCommissionPreviewsForStatement(
  statement: Statement,
  transactions: SettlementTransaction[],
  dealer: Dealer,
  employees: Employee[],
): CommissionPreview[] {
  return employees
    .map((employee) => {
      const assignment = employee.assignments.find(
        (row) => row.storeId === dealer.storeId && isCommissionEligibleAssignment(row),
      );
      if (!assignment) return null;
      return getCommissionPreviewForStatement(statement, transactions, dealer, employee, assignment);
    })
    .filter((preview): preview is CommissionPreview => Boolean(preview));
}

export function calculateEmployeeCommissionForStatement(
  statement: Statement,
  transactions: SettlementTransaction[],
  dealer: Dealer,
  assignment: Assignment,
  employeeId: string,
): EmployeeCommission {
  const preview = getCommissionPreviewForStatement(
    statement,
    transactions,
    dealer,
    { id: employeeId, name: '', roleTitle: '', assignments: [assignment] },
    assignment,
  );
  const [periodYear, periodMonth] = statement.month.split('-').map(Number);
  const totals = calculateStatementTotals(statement, transactions, dealer);
  const adjustment = getEmployeeCommissionBaseAdjustment(transactions, statement.id);

  return {
    id: `ec-${employeeId}-${statement.id}`,
    employeeId,
    dealerId: dealer.id,
    statementId: statement.id,
    periodMonth,
    periodYear,
    companyShareAmount: totals.company_share_amount,
    printingCosts: totals.total_printing_costs,
    shippingCosts: totals.total_shipping_costs,
    commissionBaseAdjustments: adjustment,
    commissionBase: preview.commissionBase,
    commissionRate: preview.commissionRate,
    commissionAmount: preview.estimatedCommission,
    paidAmount: 0,
    remainingAmount: preview.estimatedCommission,
    status: preview.estimatedCommission > 0 ? 'open' : 'closed',
    createdAt: new Date().toISOString(),
  };
}

export function generateEmployeeCommissionsForStatement(
  statement: Statement,
  dealers: Dealer[],
  employees: Employee[],
  transactions: SettlementTransaction[],
  existing: EmployeeCommission[],
) {
  const dealer = dealers.find((row) => row.id === statement.dealerId);
  if (!dealer) return existing;

  const output = [...existing];
  for (const employee of employees) {
    const assignment = employee.assignments.find(
      (row) => row.storeId === dealer.storeId && isCommissionEligibleAssignment(row),
    );
    if (!assignment) continue;

    const calculated = calculateEmployeeCommissionForStatement(
      statement,
      transactions,
      dealer,
      assignment,
      employee.id,
    );
    const existingIndex = output.findIndex(
      (commission) => commission.employeeId === employee.id && commission.statementId === statement.id,
    );

    if (existingIndex < 0) {
      output.push(calculated);
      continue;
    }

    if (!['paid', 'partially_paid'].includes(output[existingIndex].status)) {
      const paidAmount = output[existingIndex].paidAmount;
      output[existingIndex] = {
        ...calculated,
        paidAmount,
        remainingAmount: Math.max(calculated.commissionAmount - paidAmount, 0),
        status: paidAmount > 0 ? 'partially_paid' : calculated.status,
      };
    }
  }

  return output;
}

export function generateEmployeeCommissionsForStatements(
  statements: Statement[],
  dealers: Dealer[],
  employees: Employee[],
  transactions: SettlementTransaction[],
  existing: EmployeeCommission[] = [],
) {
  return statements.reduce(
    (commissions, statement) =>
      generateEmployeeCommissionsForStatement(statement, dealers, employees, transactions, commissions),
    existing,
  );
}

export const getEmployeeCommissionPaidAmount = (
  commissionId: string,
  allocations: EmployeePaymentAllocation[],
) =>
  allocations
    .filter((allocation) => allocation.commissionId === commissionId)
    .reduce((total, allocation) => total + allocation.allocatedAmount, 0);

export const getEmployeeCommissionRemainingAmount = (
  commission: EmployeeCommission,
  allocations: EmployeePaymentAllocation[],
) => Math.max(commission.commissionAmount - getEmployeeCommissionPaidAmount(commission.id, allocations), 0);

export const getOpenCommissionsForEmployee = (
  employeeId: string,
  commissions: EmployeeCommission[],
  allocations: EmployeePaymentAllocation[],
) =>
  commissions
    .filter((commission) => commission.employeeId === employeeId)
    .map((commission) => ({
      commission,
      remaining: getEmployeeCommissionRemainingAmount(commission, allocations),
    }))
    .filter((row) => row.remaining > 0);

export const getEmployeeOpenCommissionBalance = (
  employeeId: string,
  commissions: EmployeeCommission[],
  allocations: EmployeePaymentAllocation[],
) =>
  getOpenCommissionsForEmployee(employeeId, commissions, allocations).reduce(
    (total, row) => total + row.remaining,
    0,
  );

export const getCurrentMonthEmployeeCommission = (
  employeeId: string,
  commissions: EmployeeCommission[],
  year = 2026,
  month = 4,
) =>
  commissions
    .filter(
      (commission) =>
        commission.employeeId === employeeId &&
        commission.periodYear === year &&
        commission.periodMonth === month,
    )
    .reduce((total, commission) => total + commission.commissionAmount, 0);

export const getEmployeeCommissionLedgerRows = (
  employeeId: string,
  commissions: EmployeeCommission[],
  payments: EmployeePayment[],
) => {
  const rows: {
    date: string;
    kind: string;
    amount: number;
    commission?: EmployeeCommission;
    payment?: EmployeePayment;
  }[] = [];

  commissions
    .filter((commission) => commission.employeeId === employeeId)
    .forEach((commission) =>
      rows.push({
        date: `${commission.periodYear}-${String(commission.periodMonth).padStart(2, '0')}`,
        kind: 'Commission',
        amount: commission.commissionAmount,
        commission,
      }),
    );

  payments
    .filter((payment) => payment.employeeId === employeeId)
    .forEach((payment) =>
      rows.push({
        date: payment.paymentDate,
        kind: 'Payment',
        amount: -payment.amount,
        payment,
      }),
    );

  return rows.sort((a, b) => a.date.localeCompare(b.date));
};
