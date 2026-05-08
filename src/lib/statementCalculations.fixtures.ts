import { calculateStatementTotals } from './statementCalculations';
import { Dealer, SettlementTransaction, Statement } from '../types';

const dealer: Dealer = {
  id: 'fx1',
  name: 'Fixture Dealer',
  storeId: 's1',
  status: 'active',
  dealerSharePercentage: 0.25,
  companySharePercentage: 0.75,
};

const makeStatement = (): Statement => ({ id: 'sfx', dealerId: 'fx1', month: '2026-04', status: 'open', paidAmount: 0 });

/**
 * Documented validation fixtures:
 * A) 800 payout, 0 expense, 25 printing, 30 shipping => receivable 655
 * B) 800 payout, 200 expense, 25 printing, 30 shipping => receivable 505
 * C) pending_review must not affect totals
 * D) 520 payout only => company share 390, receivable 390
 */
export function runCalculationFixtures() {
  const scenarioA: SettlementTransaction[] = [
    { id: 'a1', dealerId: 'fx1', statementId: 'sfx', date: '2026-04-01', type: 'bank_payout', status: 'confirmed', amount: 800 },
    { id: 'a2', dealerId: 'fx1', statementId: 'sfx', date: '2026-04-01', type: 'printing_cost', status: 'confirmed', amount: 25 },
    { id: 'a3', dealerId: 'fx1', statementId: 'sfx', date: '2026-04-01', type: 'shipping_cost', status: 'confirmed', amount: 30 },
  ];

  const scenarioB: SettlementTransaction[] = [...scenarioA, { id: 'b1', dealerId: 'fx1', statementId: 'sfx', date: '2026-04-01', type: 'store_expense', status: 'confirmed', amount: 200 }];
  const scenarioC: SettlementTransaction[] = [...scenarioA, { id: 'c1', dealerId: 'fx1', statementId: 'sfx', date: '2026-04-01', type: 'store_expense', status: 'pending_review', amount: 200 }];
  const scenarioD: SettlementTransaction[] = [{ id: 'd1', dealerId: 'fx1', statementId: 'sfx', date: '2026-04-01', type: 'bank_payout', status: 'confirmed', amount: 520 }];

  return {
    A: calculateStatementTotals(makeStatement(), scenarioA, dealer),
    B: calculateStatementTotals(makeStatement(), scenarioB, dealer),
    C: calculateStatementTotals(makeStatement(), scenarioC, dealer),
    D: calculateStatementTotals(makeStatement(), scenarioD, dealer),
  };
}
