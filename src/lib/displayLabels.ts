import { MoneyInUsd, TransactionType } from '../types';

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

export const currencyOptions = ['USD', 'TRY', 'AUD'] as const;
export type SupportedCurrency = (typeof currencyOptions)[number];

const decimalFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export const MONEY_DISPLAY_TOLERANCE = 0.01;

export const normalizeMoneyDisplay = (amount: number) =>
  Math.abs(amount) <= MONEY_DISPLAY_TOLERANCE ? 0 : amount;

export const roundUsdAmount = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export const formatCurrencyAmount = (amount: number, currency: string) =>
  `${currency} ${decimalFormatter.format(amount)}`;

export const formatUsdAmount = (amount: number) => usdFormatter.format(normalizeMoneyDisplay(amount));

export const getMoneyOriginalAmount = (row: MoneyInUsd) => row.originalAmount ?? row.amount;

export const getMoneyOriginalCurrency = (row: MoneyInUsd) => row.originalCurrency ?? 'USD';

export const getMoneyUsdAmount = (row: MoneyInUsd) => row.usdAmount ?? row.amount;

export const formatExchangeRate = (rate?: number) => Number(rate ?? 1).toFixed(4);

export const formatOriginalMoney = (row: MoneyInUsd) =>
  formatCurrencyAmount(getMoneyOriginalAmount(row), getMoneyOriginalCurrency(row));

export const describeMoneyConversion = (row: MoneyInUsd) =>
  `${formatOriginalMoney(row)} @ ${formatExchangeRate(row.exchangeRateToUsd)} -> ${formatUsdAmount(
    getMoneyUsdAmount(row),
  )}`;
