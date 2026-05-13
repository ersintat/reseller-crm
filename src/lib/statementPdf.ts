import {
  Dealer,
  DealerPayment,
  DealerPaymentAllocation,
  PendingOrderCost,
  SettlementTransaction,
  Statement,
} from '../types';
import {
  calculateStatementTotals,
  getAllocatedUsdAmount,
  getEffectiveStatementPaidAmount,
  getUsdAmount,
} from './statementCalculations';
import { formatExchangeRate, formatTransactionType } from './displayLabels';

interface StatementPdfInput {
  dealer: Dealer;
  statement: Statement;
  transactions: SettlementTransaction[];
  payments: DealerPayment[];
  allocations: DealerPaymentAllocation[];
  pendingOrderCosts: PendingOrderCost[];
}

const usd = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const money = (amount: number | undefined, currency = 'USD') =>
  `${currency} ${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount ?? 0)}`;

const ascii = (value: string) => value.replace(/[^\x20-\x7E]/g, '');

const escapePdf = (value: string) =>
  ascii(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

class PdfDocument {
  private pages: string[][] = [[]];
  private y = 760;

  private current() {
    return this.pages[this.pages.length - 1];
  }

  private ensureSpace(height = 18) {
    if (this.y - height < 56) {
      this.pages.push([]);
      this.y = 760;
    }
  }

  text(value: string, x = 50, size = 10, bold = false) {
    this.ensureSpace(size + 8);
    const font = bold ? 'F2' : 'F1';
    this.current().push(`BT /${font} ${size} Tf ${x} ${this.y} Td (${escapePdf(value)}) Tj ET`);
    this.y -= size + 6;
  }

  gap(size = 8) {
    this.y -= size;
  }

  rule() {
    this.ensureSpace(12);
    this.current().push(`0.85 0.87 0.91 RG 50 ${this.y} m 545 ${this.y} l S`);
    this.y -= 12;
  }

  wrapped(value: string, x = 50, size = 9, maxChars = 96) {
    const words = value.split(/\s+/);
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > maxChars) {
        if (line) this.text(line, x, size);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) this.text(line, x, size);
  }

  section(title: string) {
    this.gap(4);
    this.text(title, 50, 12, true);
    this.rule();
  }

  keyValues(rows: [string, string][]) {
    rows.forEach(([label, value]) => {
      this.wrapped(`${label}: ${value}`, 60, 9, 88);
    });
  }

  table(headers: string[], rows: string[][]) {
    this.wrapped(headers.join(' | '), 60, 8, 110);
    this.current().push(`0.9 0.91 0.94 RG 60 ${this.y + 4} m 535 ${this.y + 4} l S`);
    rows.forEach((row) => this.wrapped(row.join(' | '), 60, 8, 112));
  }

  output() {
    const objects: string[] = [];
    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    const kids = this.pages.map((_, index) => `${5 + index * 2} 0 R`).join(' ');
    objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${this.pages.length} >>`);
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

    this.pages.forEach((commands, index) => {
      const pageObject = 5 + index * 2;
      const contentObject = pageObject + 1;
      const stream = commands.join('\n');
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObject} 0 R >>`,
      );
      objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    });

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(pdf.length);
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach((offset) => {
      pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
    });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return pdf;
  }
}

export function downloadStatementPdf({
  dealer,
  statement,
  transactions,
  payments,
  allocations,
  pendingOrderCosts,
}: StatementPdfInput) {
  const statementTransactions = transactions.filter((transaction) => transaction.statementId === statement.id);
  const paid = getEffectiveStatementPaidAmount(statement, allocations);
  const totals = calculateStatementTotals(statement, transactions, dealer, paid);
  const statementAllocations = allocations.filter((allocation) => allocation.statementId === statement.id);
  const paymentsById = new Map(payments.map((payment) => [payment.id, payment]));
  const statementPendingCosts = pendingOrderCosts.filter(
    (cost) => cost.statementId === statement.id || (!cost.statementId && cost.dealerId === dealer.id),
  );
  const generatedAt = new Date();
  const pdf = new PdfDocument();

  pdf.text('Dealer Settlement Statement', 50, 18, true);
  pdf.text(dealer.storeName || dealer.name, 50, 12, true);
  pdf.keyValues([
    ['Dealer', dealer.name],
    ['Statement period', statement.month],
    ['Generated date', generatedAt.toLocaleDateString()],
    ['Reporting currency', 'USD'],
    ['Dealer default currency', dealer.currency || 'USD'],
  ]);

  pdf.section('Agreement');
  pdf.keyValues([
    ['Dealer share', `${(dealer.dealerSharePercentage * 100).toFixed(2)}%`],
    ['Company share', `${(dealer.companySharePercentage * 100).toFixed(2)}%`],
  ]);

  pdf.section('Summary');
  pdf.keyValues([
    ['Platform payouts', usd(totals.total_bank_payouts)],
    ['Store expenses', usd(totals.total_store_expenses)],
    ['Dealer share', usd(totals.dealer_share_amount)],
    ['Company share', usd(totals.company_share_amount)],
    ['Printing costs', usd(totals.total_printing_costs)],
    ['Shipping costs', usd(totals.total_shipping_costs)],
    ['Dealer receivable', usd(totals.dealer_receivable_amount)],
    ['Paid', usd(totals.paid_amount)],
    ['Remaining', usd(totals.remaining_amount)],
  ]);

  pdf.section('Transactions');
  if (statementTransactions.length === 0) {
    pdf.text('No transaction rows.', 60, 9);
  } else {
    pdf.table(
      ['Date', 'Type', 'Order', 'Original', 'Rate', 'USD', 'Status', 'Description'],
      statementTransactions.map((transaction) => [
        transaction.date,
        formatTransactionType(transaction.type),
        transaction.orderCode || '-',
        money(transaction.originalAmount ?? transaction.amount, transaction.originalCurrency ?? 'USD'),
        formatExchangeRate(transaction.exchangeRateToUsd),
        usd(getUsdAmount(transaction)),
        transaction.status,
        transaction.description || '-',
      ]),
    );
  }

  pdf.section('Payment Allocations');
  if (statementAllocations.length === 0) {
    pdf.text('No dealer payment allocations.', 60, 9);
  } else {
    pdf.table(
      ['Payment date', 'Original payment', 'Applied USD', 'Description'],
      statementAllocations.map((allocation) => {
        const payment = paymentsById.get(allocation.paymentId);
        return [
          payment?.paymentDate || '-',
          payment ? money(payment.originalAmount ?? payment.amount, payment.originalCurrency ?? payment.currency) : '-',
          usd(getAllocatedUsdAmount(allocation)),
          payment?.description || '-',
        ];
      }),
    );
  }

  pdf.section('Pending Order Costs');
  if (statementPendingCosts.length === 0) {
    pdf.text('No pending order cost reminders.', 60, 9);
  } else {
    pdf.table(
      ['Order', 'Scope', 'Status', 'Note'],
      statementPendingCosts.map((cost) => [
        cost.orderCode,
        cost.costScope,
        cost.status,
        cost.note || '-',
      ]),
    );
  }

  pdf.gap(8);
  pdf.rule();
  pdf.wrapped('Generated by Dealer Settlement Manager. This statement is based on confirmed transactions.', 50, 8);

  const blob = new Blob([pdf.output()], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${(dealer.storeName || dealer.name).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${statement.month}-statement.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
