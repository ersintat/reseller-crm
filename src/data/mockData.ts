import { Dealer, Employee, SettlementTransaction, Statement, Store } from '../types';

export const stores: Store[] = [
  { id: 's1', name: 'World of Wedding Co.' }, { id: 's2', name: 'Venture Invitations' }, { id: 's3', name: 'Nueva Invitations' },
  { id: 's4', name: 'Emirates and Weddings' }, { id: 's5', name: 'Astra Invitations' }, { id: 's6', name: 'LA Invitations' }, { id: 's7', name: 'Invitations Club' },
];
export const dealers: Dealer[] = stores.map((s, i) => ({ id: `d${i + 1}`, name: s.name, storeId: s.id, status: i === 2 ? 'review' : 'active', dealerSharePercentage: 0.25, companySharePercentage: 0.75 }));

export const initialStatements: Statement[] = [
  { id: 'st-ww-2026-04', dealerId: 'd1', month: '2026-04', status: 'open', paidAmount: 120 },
  { id: 'st-vi-2026-04', dealerId: 'd2', month: '2026-04', status: 'open', paidAmount: 0 },
  { id: 'st-ai-2026-04', dealerId: 'd5', month: '2026-04', status: 'open', paidAmount: 0 },
];

export const initialTransactions: SettlementTransaction[] = [
  { id: 't1', dealerId: 'd1', statementId: 'st-ww-2026-04', date: '2026-04-05', type: 'bank_payout', status: 'confirmed', amount: 800, createdByRole: 'admin' },
  { id: 't2', dealerId: 'd1', statementId: 'st-ww-2026-04', date: '2026-04-06', type: 'printing_cost', status: 'confirmed', amount: 25, createdByRole: 'admin' },
  { id: 't3', dealerId: 'd1', statementId: 'st-ww-2026-04', date: '2026-04-06', type: 'shipping_cost', status: 'confirmed', amount: 30, createdByRole: 'admin' },
  { id: 't4', dealerId: 'd1', statementId: 'st-ww-2026-04', date: '2026-04-07', type: 'store_expense', status: 'pending_review', amount: 50, createdByRole: 'employee' },
  { id: 't5', dealerId: 'd2', statementId: 'st-vi-2026-04', date: '2026-04-03', type: 'bank_payout', status: 'confirmed', amount: 800, createdByRole: 'admin' },
  { id: 't6', dealerId: 'd2', statementId: 'st-vi-2026-04', date: '2026-04-04', type: 'store_expense', status: 'confirmed', amount: 200, createdByRole: 'admin' },
  { id: 't7', dealerId: 'd2', statementId: 'st-vi-2026-04', date: '2026-04-04', type: 'printing_cost', status: 'confirmed', amount: 25, createdByRole: 'admin' },
  { id: 't8', dealerId: 'd2', statementId: 'st-vi-2026-04', date: '2026-04-04', type: 'shipping_cost', status: 'confirmed', amount: 30, createdByRole: 'admin' },
  { id: 't10', dealerId: 'd5', statementId: 'st-ai-2026-04', date: '2026-04-02', type: 'bank_payout', status: 'confirmed', amount: 520, notes: 'TODO multi-currency support; currently USD-only', createdByRole: 'admin' },
];

const defaultAssignmentPermissions = {
  canViewTransactions: true,
  canAddTransactions: true,
  canEditTransactions: false,
  canViewCommission: true,
  status: 'active' as const,
};

export const employees: Employee[] = [
  {
    id: 'e1',
    name: 'Graphic Designer',
    roleTitle: 'Graphic Designer',
    assignments: [
      { storeId: 's1', commissionRatePct: 2, ...defaultAssignmentPermissions },
      { storeId: 's2', commissionRatePct: 1.5, ...defaultAssignmentPermissions },
      { storeId: 's3', commissionRatePct: 3, ...defaultAssignmentPermissions },
    ],
  },
];
export const formatUsd = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
