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
  getDealerBalanceSummary,
  getAllocatedUsdAmount,
  getEffectiveStatementPaidAmount,
  getUsdAmount,
  sortStatementsByPeriod,
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

interface DealerAccountPdfInput {
  dealer: Dealer;
  statements: Statement[];
  transactions: SettlementTransaction[];
  payments: DealerPayment[];
  allocations: DealerPaymentAllocation[];
  pendingOrderCosts: PendingOrderCost[];
}

type Align = 'left' | 'right' | 'center';
type Tone = [number, number, number];
type PdfLogo = { data: string; width: number; height: number };

interface PdfColumn {
  header: string;
  width: number;
  align?: Align;
}

const pageWidth = 595;
const pageHeight = 842;
const margin = 36;
const contentWidth = pageWidth - margin * 2;
const bottomMargin = 52;

const color = {
  slate950: [0.06, 0.09, 0.16] as Tone,
  slate700: [0.2, 0.25, 0.33] as Tone,
  slate500: [0.39, 0.45, 0.55] as Tone,
  slate300: [0.8, 0.84, 0.89] as Tone,
  slate200: [0.9, 0.92, 0.94] as Tone,
  slate100: [0.95, 0.97, 0.99] as Tone,
  slate50: [0.98, 0.99, 1] as Tone,
  indigo: [0, 0.14, 0.33] as Tone,
  indigoSoft: [0.9, 0.92, 0.94] as Tone,
  orange: [0.93, 0.51, 0.22] as Tone,
  coral: [0.96, 0.38, 0.2] as Tone,
  warmSoft: [1, 0.96, 0.91] as Tone,
  emerald: [0.02, 0.48, 0.31] as Tone,
};

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

const tone = ([r, g, b]: Tone) => `${r} ${g} ${b}`;

const estimateTextWidth = (value: string, size: number) => ascii(value).length * size * 0.47;

const slug = (value: string) => value.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

const binaryStringToBytes = (value: string): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(new ArrayBuffer(value.length));
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index) & 0xff;
  }
  return bytes;
};

const arrayBufferToBinaryString = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.slice(index, index + chunkSize)));
  }
  return chunks.join('');
};

let logoPromise: Promise<PdfLogo | null> | null = null;

const loadPdfLogo = () => {
  logoPromise ??= fetch('/psns-logo-pdf.jpg')
    .then(async (response) => {
      if (!response.ok) return null;
      return {
        data: arrayBufferToBinaryString(await response.arrayBuffer()),
        width: 256,
        height: 256,
      };
    })
    .catch((error) => {
      console.warn('Statement PDF logo could not be loaded.', error);
      return null;
    });

  return logoPromise;
};

const pdfTransactionType = (type: SettlementTransaction['type']) => {
  const label = formatTransactionType(type);
  return label
    .replace('Platform Payout to Dealer Bank', 'Platform Payout')
    .replace('Printing Cost', 'Printing')
    .replace('Shipping Cost', 'Shipping')
    .replace('Manual Adjustment', 'Adjustment');
};

const wrapText = (value: string, width: number, size: number) => {
  const maxChars = Math.max(Math.floor(width / (size * 0.47)), 8);
  const words = ascii(value || '-').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
      continue;
    }
    if (word.length > maxChars) {
      if (line) lines.push(line);
      for (let index = 0; index < word.length; index += maxChars) {
        lines.push(word.slice(index, index + maxChars));
      }
      line = '';
      continue;
    }
    line = next;
  }

  if (line) lines.push(line);
  return lines.length > 0 ? lines : ['-'];
};

class PdfDocument {
  private pages: string[][] = [[]];
  private y = 790;

  constructor(private logo: PdfLogo | null = null) {}

  private current() {
    return this.pages[this.pages.length - 1];
  }

  private push(command: string) {
    this.current().push(command);
  }

  private newPage() {
    this.pages.push([]);
    this.y = 790;
  }

  pageBreak() {
    this.newPage();
  }

  private ensureSpace(height: number) {
    if (this.y - height < bottomMargin) this.newPage();
  }

  private fillRect(x: number, y: number, width: number, height: number, fill: Tone) {
    this.push(`${tone(fill)} rg ${x} ${y} ${width} ${height} re f`);
  }

  private strokeRect(x: number, y: number, width: number, height: number, stroke: Tone = color.slate200) {
    this.push(`${tone(stroke)} RG ${x} ${y} ${width} ${height} re S`);
  }

  private drawText(
    value: string,
    x: number,
    y: number,
    size = 8,
    bold = false,
    fill: Tone = color.slate700,
    align: Align = 'left',
    width = 0,
  ) {
    const font = bold ? 'F2' : 'F1';
    let tx = x;
    if (align === 'right') tx = x + width - estimateTextWidth(value, size);
    if (align === 'center') tx = x + (width - estimateTextWidth(value, size)) / 2;
    this.push(`${tone(fill)} rg BT /${font} ${size} Tf ${tx.toFixed(2)} ${y.toFixed(2)} Td (${escapePdf(value)}) Tj ET`);
  }

  private drawBrandMark(x: number, y: number) {
    this.fillRect(x, y, 34, 34, color.indigo);
    this.fillRect(x + 4, y + 5, 26, 3, color.coral);
    this.drawText('PSNS', x + 5, y + 18, 8.5, true, [1, 1, 1]);
  }

  private drawLogo(x: number, y: number, size: number) {
    if (!this.logo) {
      this.drawBrandMark(x, y);
      return;
    }

    this.fillRect(x - 2, y - 2, size + 4, size + 4, [1, 1, 1]);
    this.strokeRect(x - 2, y - 2, size + 4, size + 4, color.slate200);
    this.push(`q ${size} 0 0 ${size} ${x} ${y} cm /Logo Do Q`);
  }

  header({
    title,
    dealerName,
    meta,
  }: {
    title: string;
    dealerName: string;
    meta: string[];
  }) {
    this.fillRect(0, 784, pageWidth, 58, color.indigo);
    this.fillRect(0, 782, pageWidth, 3, color.orange);
    this.drawLogo(margin, 797, 36);
    this.drawText(title, margin + 44, 818, 14, true, [1, 1, 1]);
    this.drawText(dealerName, margin + 44, 802, 9.5, false, [0.88, 0.91, 1]);
    this.drawText('PSNS Reseller CRM', margin + 44, 790, 7.2, false, [0.9, 0.92, 1]);
    meta.forEach((row, index) => this.drawText(row, 376, 816 - index * 12, 7.5, false, [0.9, 0.92, 1]));
    this.y = 762;
  }

  section(title: string, subtitle?: string, options: { compact?: boolean } = {}) {
    const before = options.compact ? 7 : 11;
    const titleGap = options.compact ? 12 : 14;
    const subtitleGap = subtitle ? (options.compact ? 9 : 11) : 0;
    this.ensureSpace(before + titleGap + subtitleGap + 8);
    this.y -= before;
    this.drawText(title, margin, this.y, 10, true, color.slate950);
    this.fillRect(margin, this.y - 7, 34, 2, color.indigo);
    this.y -= titleGap;
    if (subtitle) {
      this.drawText(subtitle, margin, this.y, 7.2, false, color.slate500);
      this.y -= subtitleGap;
    }
  }

  compactInfo(items: { label: string; value: string }[]) {
    const rowHeight = 19;
    const colWidth = contentWidth / 4;
    const rows = Math.ceil(items.length / 4);
    this.ensureSpace(rows * rowHeight + 8);

    items.forEach((item, index) => {
      const col = index % 4;
      const row = Math.floor(index / 4);
      const x = margin + col * colWidth;
      const y = this.y - row * rowHeight;
      this.drawText(item.label.toUpperCase(), x, y, 6, true, color.slate500);
      this.drawText(item.value, x, y - 10, 8, true, color.slate950);
    });

    this.y -= rows * rowHeight + 6;
  }

  summaryTable(items: { label: string; value: string; accent?: boolean }[]) {
    const colWidth = contentWidth / 2;
    const rowHeight = 20;
    const rows = Math.ceil(items.length / 2);
    this.ensureSpace(rows * rowHeight + 12);

    items.forEach((item, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = margin + col * colWidth;
      const y = this.y - row * rowHeight;
      this.fillRect(x, y - rowHeight + 2, colWidth, rowHeight, item.accent ? color.indigoSoft : [1, 1, 1]);
      this.strokeRect(x, y - rowHeight + 2, colWidth, rowHeight, color.slate200);
      if (item.accent) this.fillRect(x, y - rowHeight + 2, 3, rowHeight, color.indigo);
      this.drawText(item.label, x + 8, y - 11, 7.5, false, color.slate700);
      this.drawText(item.value, x + 8, y - 11, 8, true, item.accent ? color.indigo : color.slate950, 'right', colWidth - 16);
    });

    this.y -= rows * rowHeight + 10;
  }

  note(value: string) {
    this.ensureSpace(18);
    this.drawText(value, margin, this.y, 7.1, false, color.slate500);
    this.y -= 12;
  }

  empty(message: string) {
    this.ensureSpace(24);
    this.fillRect(margin, this.y - 20, contentWidth, 20, color.slate50);
    this.strokeRect(margin, this.y - 20, contentWidth, 20);
    this.drawText(message, margin + 8, this.y - 13, 7.5, false, color.slate500);
    this.y -= 28;
  }

  warningSummary(title: string, lines: string[]) {
    const height = 50 + Math.max(lines.length - 1, 0) * 10;
    this.ensureSpace(height + 8);
    this.fillRect(margin, this.y - height, contentWidth, height, color.warmSoft);
    this.strokeRect(margin, this.y - height, contentWidth, height, color.orange);
    this.fillRect(margin, this.y - height, 4, height, color.coral);
    this.drawText(title, margin + 12, this.y - 16, 9, true, color.indigo);
    lines.forEach((line, index) => {
      this.drawText(line, margin + 12, this.y - 29 - index * 10, 7.2, false, color.slate700);
    });
    this.y -= height + 10;
  }

  table(columns: PdfColumn[], rows: string[][], options: { fontSize?: number; rowPadding?: number } = {}) {
    const fontSize = options.fontSize ?? 6.6;
    const rowPadding = options.rowPadding ?? 6;
    const headerHeight = 17;
    const lineHeight = fontSize + 2.2;

    const drawHeader = () => {
      this.fillRect(margin, this.y - headerHeight, contentWidth, headerHeight, color.slate100);
      this.strokeRect(margin, this.y - headerHeight, contentWidth, headerHeight);
      let x = margin;
      columns.forEach((column) => {
        this.drawText(
          column.header.toUpperCase(),
          x + 4,
          this.y - 11,
          6.1,
          true,
          color.slate500,
          column.align ?? 'left',
          column.width - 8,
        );
        x += column.width;
      });
      this.y -= headerHeight;
    };

    this.ensureSpace(38);
    drawHeader();

    rows.forEach((row, rowIndex) => {
      const cellLines = row.map((cell, index) => wrapText(cell, columns[index].width - 8, fontSize));
      const lineCount = Math.max(...cellLines.map((lines) => lines.length));
      const rowHeight = Math.max(18, lineCount * lineHeight + rowPadding);
      if (this.y - rowHeight < bottomMargin) {
        this.newPage();
        drawHeader();
      }

      this.fillRect(margin, this.y - rowHeight, contentWidth, rowHeight, rowIndex % 2 === 0 ? [1, 1, 1] : color.slate50);
      this.strokeRect(margin, this.y - rowHeight, contentWidth, rowHeight, [0.92, 0.94, 0.96]);
      let x = margin;
      columns.forEach((column, index) => {
        const lines = cellLines[index];
        lines.forEach((line, lineIndex) => {
          this.drawText(
            line,
            x + 4,
            this.y - 12 - lineIndex * lineHeight,
            fontSize,
            false,
            color.slate700,
            column.align ?? 'left',
            column.width - 8,
          );
        });
        x += column.width;
      });
      this.y -= rowHeight;
    });

    this.y -= 8;
  }

  addFooters(footer: string) {
    const total = this.pages.length;
    this.pages.forEach((commands, index) => {
      commands.push(`${tone(color.slate200)} RG ${margin} 36 m ${pageWidth - margin} 36 l S`);
      commands.push(`${tone(color.slate500)} rg BT /F1 7 Tf ${margin} 23 Td (${escapePdf(`PSNS Reseller CRM - ${footer}`)}) Tj ET`);
      commands.push(`${tone(color.slate500)} rg BT /F1 7 Tf ${pageWidth - margin - 48} 23 Td (Page ${index + 1} of ${total}) Tj ET`);
    });
  }

  output(footer: string) {
    this.addFooters(footer);
    const objects: string[] = [];
    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    objects.push('');
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
    const logoObjectId = this.logo ? objects.length + 1 : null;

    if (this.logo) {
      objects.push(
        `<< /Type /XObject /Subtype /Image /Width ${this.logo.width} /Height ${this.logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${this.logo.data.length} >>\nstream\n${this.logo.data}\nendstream`,
      );
    }

    const firstPageObject = objects.length + 1;
    const kids = this.pages.map((_, index) => `${firstPageObject + index * 2} 0 R`).join(' ');
    objects[1] = `<< /Type /Pages /Kids [${kids}] /Count ${this.pages.length} >>`;
    const resourceObjects = logoObjectId ? `/XObject << /Logo ${logoObjectId} 0 R >>` : '';

    this.pages.forEach((commands, index) => {
      const pageObject = firstPageObject + index * 2;
      const contentObject = pageObject + 1;
      const stream = commands.join('\n');
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> ${resourceObjects} >> /Contents ${contentObject} 0 R >>`,
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
    return binaryStringToBytes(pdf);
  }
}

const triggerDownload = (pdf: Uint8Array<ArrayBuffer>, filename: string) => {
  const blob = new Blob([pdf], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const statementSummaryItems = (totals: ReturnType<typeof calculateStatementTotals>) => [
  { label: 'Platform Payouts', value: usd(totals.total_bank_payouts) },
  { label: 'Store Expenses', value: usd(totals.total_store_expenses) },
  { label: 'Dealer Share', value: usd(totals.dealer_share_amount) },
  { label: 'Company Share', value: usd(totals.company_share_amount) },
  { label: 'Printing Costs', value: usd(totals.total_printing_costs) },
  { label: 'Shipping Costs', value: usd(totals.total_shipping_costs) },
  { label: 'Dealer Receivable', value: usd(totals.dealer_receivable_amount), accent: true },
  { label: 'Paid', value: usd(totals.paid_amount) },
  { label: 'Remaining', value: usd(totals.remaining_amount), accent: true },
];

const transactionTableColumns: PdfColumn[] = [
  { header: 'Date', width: 50 },
  { header: 'Type', width: 72 },
  { header: 'Order', width: 58 },
  { header: 'Original', width: 78, align: 'right' },
  { header: 'Rate', width: 46, align: 'right' },
  { header: 'USD', width: 68, align: 'right' },
  { header: 'Status', width: 56 },
  { header: 'Description', width: 95 },
];

const pendingOrderCostColumns: PdfColumn[] = [
  { header: 'Order ID', width: 88 },
  { header: 'Scope', width: 78 },
  { header: 'Status', width: 96 },
  { header: 'Note', width: 261 },
];

const paymentAllocationColumns: PdfColumn[] = [
  { header: 'Payment Date', width: 80 },
  { header: 'Original Payment', width: 120, align: 'right' },
  { header: 'Applied USD', width: 100, align: 'right' },
  { header: 'Description', width: 223 },
];

const paymentReceiptColumns: PdfColumn[] = [
  { header: 'Statement', width: 120 },
  { header: 'Applied USD', width: 120, align: 'right' },
  { header: 'Statement Remaining', width: 140, align: 'right' },
  { header: 'Status', width: 143 },
];

const transactionRows = (transactions: SettlementTransaction[]) =>
  transactions.map((transaction) => [
    transaction.date,
    pdfTransactionType(transaction.type),
    transaction.orderCode || '-',
    money(transaction.originalAmount ?? transaction.amount, transaction.originalCurrency ?? 'USD'),
    formatExchangeRate(transaction.exchangeRateToUsd),
    usd(getUsdAmount(transaction)),
    transaction.status,
    transaction.description || '-',
  ]);

const paymentAllocationRows = (
  statementAllocations: DealerPaymentAllocation[],
  paymentsById: Map<string, DealerPayment>,
) =>
  statementAllocations.map((allocation) => {
    const payment = paymentsById.get(allocation.paymentId);
    return [
      payment?.paymentDate || '-',
      payment ? money(payment.originalAmount ?? payment.amount, payment.originalCurrency ?? payment.currency) : '-',
      usd(getAllocatedUsdAmount(allocation)),
      payment?.description || '-',
    ];
  });

const pendingOrderCostRows = (costs: PendingOrderCost[]) =>
  costs.map((cost) => [cost.orderCode, cost.costScope, cost.status, cost.note || '-']);

export async function downloadStatementPdf({
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
  const generatedAt = new Date().toLocaleDateString();
  const pdf = new PdfDocument(await loadPdfLogo());

  pdf.header({
    title: 'Dealer Settlement Statement',
    dealerName: dealer.storeName || dealer.name,
    meta: [
      `Period ${statement.month}`,
      `Generated ${generatedAt}`,
      `Reporting USD / Dealer ${dealer.currency || 'USD'}`,
    ],
  });

  pdf.section('Agreement');
  pdf.compactInfo([
    { label: 'Dealer Share', value: `${(dealer.dealerSharePercentage * 100).toFixed(2)}%` },
    { label: 'Company Share', value: `${(dealer.companySharePercentage * 100).toFixed(2)}%` },
    { label: 'Platform', value: dealer.platform || 'Not set' },
    { label: 'Currency', value: dealer.currency || 'USD' },
  ]);

  pdf.section('Summary');
  pdf.summaryTable(statementSummaryItems(totals));

  pdf.section('Transactions');
  if (statementTransactions.length === 0) {
    pdf.empty('No transaction rows.');
  } else {
    pdf.table(transactionTableColumns, transactionRows(statementTransactions), { fontSize: 6.2, rowPadding: 5 });
    pdf.note('Platform Payout means money deposited into the dealer bank account by Etsy, Shopify, or another sales platform.');
  }

  pdf.section('Pending Order Costs');
  if (statementPendingCosts.length === 0) {
    pdf.empty('No pending order cost reminders.');
  } else {
    pdf.table(pendingOrderCostColumns, pendingOrderCostRows(statementPendingCosts), { fontSize: 6.5, rowPadding: 5 });
  }

  pdf.section('Payment Allocations');
  if (statementAllocations.length === 0) {
    pdf.empty('No dealer payment allocations.');
  } else {
    pdf.table(paymentAllocationColumns, paymentAllocationRows(statementAllocations, paymentsById), {
      fontSize: 6.6,
      rowPadding: 5,
    });
  }

  triggerDownload(
    pdf.output('Based on confirmed transactions.'),
    `${slug(dealer.storeName || dealer.name)}-${statement.month}-statement.pdf`,
  );
}

export async function downloadDealerAccountStatementPdf({
  dealer,
  statements,
  transactions,
  payments,
  allocations,
  pendingOrderCosts,
}: DealerAccountPdfInput) {
  const dealerStatements = sortStatementsByPeriod(statements.filter((statement) => statement.dealerId === dealer.id));
  const dealerStatementIds = new Set(dealerStatements.map((statement) => statement.id));
  const dealerAllocations = allocations.filter((allocation) => dealerStatementIds.has(allocation.statementId));
  const allocatedStatementIds = new Set(dealerAllocations.map((allocation) => allocation.statementId));
  const rows = dealerStatements
    .map((statement) => {
      const paid = getEffectiveStatementPaidAmount(statement, allocations);
      const totals = calculateStatementTotals(statement, transactions, dealer, paid);
      return { statement, totals };
    })
    .filter(({ statement, totals }) =>
      Math.abs(totals.remaining_amount) > 0.001 ||
      ['open', 'partially_paid', 'carried_forward'].includes(statement.status) ||
      allocatedStatementIds.has(statement.id),
    );
  const dealerPayments = payments.filter((payment) => payment.dealerId === dealer.id);
  const paymentsById = new Map(payments.map((payment) => [payment.id, payment]));
  const activePendingCosts = pendingOrderCosts.filter(
    (cost) => cost.dealerId === dealer.id && ['pending', 'partially_resolved'].includes(cost.status),
  );
  const dealerLevelPendingCosts = activePendingCosts.filter((cost) => !cost.statementId);
  const includedStatementIds = new Set(rows.map(({ statement }) => statement.id));
  const includedAllocations = dealerAllocations.filter((allocation) => includedStatementIds.has(allocation.statementId));
  const totalAppliedToIncludedStatements = includedAllocations.reduce(
    (total, allocation) => total + getAllocatedUsdAmount(allocation),
    0,
  );
  const totalPaidFromStatementTotals = rows.reduce((total, row) => total + row.totals.paid_amount, 0);
  const totalPaid = totalAppliedToIncludedStatements || totalPaidFromStatementTotals;
  const balanceSummary = getDealerBalanceSummary(dealer.id, statements, transactions, [dealer], allocations);
  const totalRemaining = balanceSummary.netOpenBalance;
  const sortedDealerPayments = dealerPayments.slice().sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  const latestPayment = sortedDealerPayments[0];
  const latestPaymentAllocations = latestPayment
    ? dealerAllocations.filter((allocation) => allocation.paymentId === latestPayment.id)
    : [];
  const latestPaymentApplied = latestPaymentAllocations.reduce(
    (total, allocation) => total + getAllocatedUsdAmount(allocation),
    0,
  );
  const rowByStatementId = new Map(rows.map((row) => [row.statement.id, row]));
  const generatedAt = new Date().toLocaleDateString();
  const pdf = new PdfDocument(await loadPdfLogo());

  pdf.header({
    title: 'Dealer Account Statement',
    dealerName: dealer.storeName || dealer.name,
    meta: [
      `Generated ${generatedAt}`,
      `Reporting USD / Dealer ${dealer.currency || 'USD'}`,
      `Agreement ${(dealer.dealerSharePercentage * 100).toFixed(2)}% / ${(dealer.companySharePercentage * 100).toFixed(2)}%`,
    ],
  });

  pdf.section('Account Summary');
  pdf.summaryTable([
    { label: 'Gross Receivable', value: usd(balanceSummary.grossReceivable) },
    { label: 'Dealer Credit', value: usd(balanceSummary.dealerCredit) },
    { label: totalRemaining > 0.001 ? 'Net Amount Due' : 'Remaining Balance', value: usd(totalRemaining), accent: true },
    { label: 'Total Paid Applied', value: usd(totalPaid) },
    { label: 'Included Statements', value: String(rows.length) },
    { label: 'Account Status', value: totalRemaining > 0.001 ? 'Payment Due' : 'Fully Paid', accent: totalRemaining <= 0.001 },
    { label: 'Pending Order Costs', value: String(activePendingCosts.length) },
  ]);

  pdf.section(
    'Settlement Statements',
    'Included statements cover unpaid balances and statements connected to dealer payment allocations.',
  );
  if (rows.length === 0) {
    pdf.empty('No settlement statements matched this account statement.');
  } else {
    pdf.table(
      [
        { header: 'Period', width: 48 },
        { header: 'Payouts', width: 66, align: 'right' },
        { header: 'Dealer Share', width: 70, align: 'right' },
        { header: 'Company', width: 66, align: 'right' },
        { header: 'Printing', width: 60, align: 'right' },
        { header: 'Shipping', width: 60, align: 'right' },
        { header: 'Receivable', width: 74, align: 'right' },
        { header: 'Paid', width: 38, align: 'right' },
        { header: 'Remaining', width: 41, align: 'right' },
      ],
      rows.map(({ statement, totals }) => [
        statement.month,
        usd(totals.total_bank_payouts),
        usd(totals.dealer_share_amount),
        usd(totals.company_share_amount),
        usd(totals.total_printing_costs),
        usd(totals.total_shipping_costs),
        usd(totals.dealer_receivable_amount),
        usd(totals.paid_amount),
        usd(totals.remaining_amount),
      ]),
      { fontSize: 5.8, rowPadding: 5 },
    );
    pdf.summaryTable([
      { label: 'Gross Receivable', value: usd(balanceSummary.grossReceivable) },
      { label: 'Dealer Credit', value: usd(balanceSummary.dealerCredit) },
      { label: totalRemaining > 0.001 ? 'Net Amount Due' : 'Remaining Balance', value: usd(totalRemaining), accent: true },
    ]);
  }

  pdf.section('Payment Summary');
  if (dealerPayments.length === 0) {
    pdf.empty('No dealer payment history.');
  } else {
    pdf.compactInfo([
      { label: 'Payments Recorded', value: String(dealerPayments.length) },
      { label: 'Applied to Included Statements', value: usd(totalPaid) },
      { label: 'Latest Payment', value: latestPayment?.paymentDate || '-' },
      {
        label: 'Latest Amount',
        value: latestPayment
          ? money(latestPayment.originalAmount ?? latestPayment.amount, latestPayment.originalCurrency ?? latestPayment.currency)
          : '-',
      },
    ]);
  }

  if (latestPayment && totalRemaining <= 0.001) {
    pdf.section('Settlement Payment Receipt');
    pdf.warningSummary('Account Fully Paid', [
      `Payment date: ${latestPayment.paymentDate}`,
      `Original payment: ${money(latestPayment.originalAmount ?? latestPayment.amount, latestPayment.originalCurrency ?? latestPayment.currency)}`,
      `Applied USD: ${usd(latestPaymentApplied || getUsdAmount(latestPayment))}`,
      `Remaining balance after payment: ${usd(totalRemaining)}`,
    ]);
    if (latestPaymentAllocations.length > 0) {
      pdf.table(
        paymentReceiptColumns,
        latestPaymentAllocations.map((allocation) => {
          const row = rowByStatementId.get(allocation.statementId);
          return [
            row?.statement.month || allocation.statementId,
            usd(getAllocatedUsdAmount(allocation)),
            row ? usd(row.totals.remaining_amount) : '-',
            row?.statement.status || '-',
          ];
        }),
        { fontSize: 6.6, rowPadding: 5 },
      );
    }
  }

  pdf.section('Pending Order Costs');
  if (activePendingCosts.length === 0) {
    pdf.empty('No active pending order costs.');
  } else {
    pdf.warningSummary('Pending Order Costs - Not Included in Current Amount Due', [
      `${activePendingCosts.length} unresolved item${activePendingCosts.length === 1 ? '' : 's'} tracked for this dealer.`,
      'These items will affect future statement totals after they are resolved into printing or shipping costs.',
      `Statement-linked: ${activePendingCosts.length - dealerLevelPendingCosts.length} / Dealer-level: ${dealerLevelPendingCosts.length}`,
    ]);
  }

  rows.forEach(({ statement, totals }) => {
    const statementTransactions = transactions.filter((transaction) => transaction.statementId === statement.id);
    const statementAllocations = allocations.filter((allocation) => allocation.statementId === statement.id);
    const statementPendingCosts = activePendingCosts.filter((cost) => cost.statementId === statement.id);

    pdf.pageBreak();
    pdf.section(`Statement Detail - ${statement.month}`);
    pdf.compactInfo([
      { label: 'Dealer', value: dealer.storeName || dealer.name },
      { label: 'Period', value: statement.month },
      { label: 'Status', value: statement.status },
      { label: 'Remaining', value: usd(totals.remaining_amount) },
    ]);

    pdf.section('Statement Summary', undefined, { compact: true });
    pdf.summaryTable(statementSummaryItems(totals));

    pdf.section('Transactions', undefined, { compact: true });
    if (statementTransactions.length === 0) {
      pdf.empty('No transaction rows for this statement.');
    } else {
      pdf.table(transactionTableColumns, transactionRows(statementTransactions), { fontSize: 6.2, rowPadding: 5 });
      pdf.note('Statement summary totals are based on confirmed transactions.');
    }

    pdf.section('Payment Allocations', undefined, { compact: true });
    if (statementAllocations.length === 0) {
      pdf.empty('No dealer payment allocations.');
    } else {
      pdf.table(paymentAllocationColumns, paymentAllocationRows(statementAllocations, paymentsById), {
        fontSize: 6.6,
        rowPadding: 5,
      });
    }

    pdf.section('Pending Order Costs', undefined, { compact: true });
    if (statementPendingCosts.length === 0) {
      pdf.empty('No statement-specific pending order costs.');
    } else {
      pdf.table(pendingOrderCostColumns, pendingOrderCostRows(statementPendingCosts), {
        fontSize: 6.5,
        rowPadding: 5,
      });
    }
  });

  if (dealerLevelPendingCosts.length > 0) {
    pdf.pageBreak();
    pdf.section('Dealer-Level Pending Order Costs');
    pdf.note('These unresolved costs are not linked to a specific statement and do not affect totals until resolved.');
    pdf.table(pendingOrderCostColumns, pendingOrderCostRows(dealerLevelPendingCosts), {
      fontSize: 6.5,
      rowPadding: 5,
    });
  }

  triggerDownload(
    pdf.output('Account statement summary. Pending order costs do not affect totals until resolved.'),
    `${slug(dealer.storeName || dealer.name)}-account-statement.pdf`,
  );
}
