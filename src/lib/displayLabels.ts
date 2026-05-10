import { TransactionType } from '../types';

const transactionTypeLabels: Record<TransactionType, string> = {
  bank_payout: 'Platform Payout to Dealer Bank',
  store_expense: 'Store Expense',
  printing_cost: 'Printing Cost',
  shipping_cost: 'Shipping Cost',
  manual_adjustment: 'Manual Adjustment',
};

export const platformPayoutHelper =
  "Platform payout is the money deposited into the dealer's bank account by Etsy, Shopify, or another sales platform. It is used to calculate the statement; it is not a payment from the dealer to us.";

export function formatTransactionType(type: TransactionType) {
  return transactionTypeLabels[type] ?? type;
}
