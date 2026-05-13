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

type Align = 'left' | 'right' | 'center';
type Tone = [number, number, number];

interface PdfColumn {
  header: string;
  width: number;
  align?: Align;
}

const pageWidth = 595;
const pageHeight = 842;
const margin = 42;
const contentWidth = pageWidth - margin * 2;
const bottomMargin = 62;

const color = {
  slate950: [0.06, 0.09, 0.16] as Tone,
  slate700: [0.2, 0.25, 0.33] as Tone,
  slate500: [0.39, 0.45, 0.55] as Tone,
  slate200: [0.89, 0.91, 0.94] as Tone,
  slate100: [0.95, 0.97, 0.99] as Tone,
  slate50: [0.98, 0.99, 1] as Tone,
  indigo: [0.17, 0.13, 0.55] as Tone,
  indigoSoft: [0.93, 0.94, 1] as Tone,
  emerald: [0.02, 0.48, 0.31] as Tone,
  amberSoft: [1, 0.97, 0.89] as Tone,
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

const estimateTextWidth = (value: string, size: number) => ascii(value).length * size * 0.48;

const wrapText = (value: string, width: number, size: number) => {
  const maxChars = Math.max(Math.floor(width / (size * 0.48)), 8);
  const words = ascii(value || '-').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';

  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
      return;
    }
    if (word.length > maxChars) {
      if (line) lines.push(line);
      for (let index = 0; index < word.length; index += maxChars) {
        lines.push(word.slice(index, index + maxChars));
      }
      line = '';
      return;
    }
    line = next;
  });

  if (line) lines.push(line);
  return lines.length > 0 ? lines : ['-'];
};

class PdfDocument {
  private pages: string[][] = [[]];
  private y = 784;

  private current() {
    return this.pages[this.pages.length - 1];
  }

  private push(command: string) {
    this.current().push(command);
  }

  private newPage() {
    this.pages.push([]);
    this.y = 784;
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

  private line(x1: number, y1: number, x2: number, y2: number, stroke: Tone = color.slate200) {
    this.push(`${tone(stroke)} RG ${x1} ${y1} m ${x2} ${y2} l S`);
  }

  private drawText(
    value: string,
    x: number,
    y: number,
    size = 9,
    bold = false,
    fill: Tone = color.slate700,
    align: Align = 'left',
    width = 0,
  ) {
    const font = bold ? 'F2' : 'F1';
    const text = escapePdf(value);
    let tx = x;
    if (align === 'right') tx = x + width - estimateTextWidth(value, size);
    if (align === 'center') tx = x + (width - estimateTextWidth(value, size)) / 2;
    this.push(`${tone(fill)} rg BT /${font} ${size} Tf ${tx.toFixed(2)} ${y.toFixed(2)} Td (${text}) Tj ET`);
  }

  private textBlock(lines: string[], x: number, y: number, size = 9, bold = false, fill = color.slate700) {
    lines.forEach((line, index) => this.drawText(line, x, y - index * (size + 3), size, bold, fill));
  }

  header({
    title,
    dealerName,
    period,
    generatedDate,
    reportingCurrency,
    dealerCurrency,
  }: {
    title: string;
    dealerName: string;
    period: string;
    generatedDate: string;
    reportingCurrency: string;
    dealerCurrency: string;
  }) {
    this.fillRect(0, 760, pageWidth, 82, color.indigo);
    this.fillRect(margin, 752, 72, 4, [0.47, 0.61, 1]);
    this.drawText(title, margin, 807, 19, true, [1, 1, 1]);
    this.drawText(dealerName, margin, 786, 12, false, [0.88, 0.91, 1]);
    this.drawText(`Period ${period}`, 400, 807, 10, true, [1, 1, 1]);
    this.drawText(`Generated ${generatedDate}`, 400, 792, 9, false, [0.88, 0.91, 1]);
    this.drawText(`Reporting ${reportingCurrency} / Dealer ${dealerCurrency}`, 400, 778, 9, false, [0.88, 0.91, 1]);
    this.y = 728;
  }

  section(title: string, subtitle?: string) {
    this.ensureSpace(subtitle ? 42 : 32);
    this.drawText(title, margin, this.y, 13, true, color.slate950);
    this.fillRect(margin, this.y - 10, 42, 3, color.indigo);
    this.y -= 17;
    if (subtitle) {
      this.drawText(subtitle, margin, this.y, 8.5, false, color.slate500);
      this.y -= 14;
    }
  }

  infoGrid(items: { label: string; value: string }[], columns = 2) {
    const gap = 10;
    const cardWidth = (contentWidth - gap * (columns - 1)) / columns;
    const cardHeight = 44;
    this.ensureSpace(Math.ceil(items.length / columns) * (cardHeight + gap) + 8);

    items.forEach((item, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = margin + col * (cardWidth + gap);
      const y = this.y - row * (cardHeight + gap);
      this.fillRect(x, y - cardHeight, cardWidth, cardHeight, color.slate50);
      this.strokeRect(x, y - cardHeight, cardWidth, cardHeight);
      this.drawText(item.label.toUpperCase(), x + 10, y - 17, 7, true, color.slate500);
      this.drawText(item.value, x + 10, y - 33, 10, true, color.slate950);
    });

    this.y -= Math.ceil(items.length / columns) * (cardHeight + gap) + 6;
  }

  summaryCards(items: { label: string; value: string; accent?: boolean }[]) {
    const gap = 8;
    const columns = 3;
    const cardWidth = (contentWidth - gap * (columns - 1)) / columns;
    const cardHeight = 48;
    this.ensureSpace(Math.ceil(items.length / columns) * (cardHeight + gap) + 8);

    items.forEach((item, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = margin + col * (cardWidth + gap);
      const y = this.y - row * (cardHeight + gap);
      this.fillRect(x, y - cardHeight, cardWidth, cardHeight, item.accent ? color.indigoSoft : color.slate50);
      this.strokeRect(x, y - cardHeight, cardWidth, cardHeight, item.accent ? [0.72, 0.75, 0.98] : color.slate200);
      if (item.accent) this.fillRect(x, y - cardHeight, 4, cardHeight, color.indigo);
      this.drawText(item.label.toUpperCase(), x + 12, y - 17, 7, true, color.slate500);
      this.drawText(item.value, x + 12, y - 35, 13, true, item.accent ? color.indigo : color.slate950);
    });

    this.y -= Math.ceil(items.length / columns) * (cardHeight + gap) + 6;
  }

  empty(message: string) {
    this.ensureSpace(34);
    this.fillRect(margin, this.y - 28, contentWidth, 28, color.slate50);
    this.strokeRect(margin, this.y - 28, contentWidth, 28);
    this.drawText(message, margin + 10, this.y - 18, 9, false, color.slate500);
    this.y -= 38;
  }

  table(columns: PdfColumn[], rows: string[][]) {
    const drawHeader = () => {
      this.fillRect(margin, this.y - 22, contentWidth, 22, color.slate100);
      this.strokeRect(margin, this.y - 22, contentWidth, 22);
      let x = margin;
      columns.forEach((column) => {
        this.drawText(column.header.toUpperCase(), x + 5, this.y - 14, 6.8, true, color.slate500, column.align ?? 'left', column.width - 10);
        x += column.width;
      });
      this.y -= 22;
    };

    this.ensureSpace(46);
    drawHeader();

    rows.forEach((row, rowIndex) => {
      const cellLines = row.map((cell, index) => wrapText(cell, columns[index].width - 10, 7.4));
      const lineCount = Math.max(...cellLines.map((lines) => lines.length));
      const rowHeight = Math.max(26, lineCount * 10 + 10);
      if (this.y - rowHeight < bottomMargin) {
        this.newPage();
        drawHeader();
      }

      this.fillRect(margin, this.y - rowHeight, contentWidth, rowHeight, rowIndex % 2 === 0 ? [1, 1, 1] : color.slate50);
      this.strokeRect(margin, this.y - rowHeight, contentWidth, rowHeight, [0.91, 0.93, 0.96]);
      let x = margin;
      columns.forEach((column, index) => {
        const lines = cellLines[index];
        lines.forEach((line, lineIndex) => {
          this.drawText(
            line,
            x + 5,
            this.y - 14 - lineIndex * 10,
            7.4,
            false,
            color.slate700,
            column.align ?? 'left',
            column.width - 10,
          );
        });
        x += column.width;
      });
      this.y -= rowHeight;
    });

    this.y -= 12;
  }

  addFooters() {
    const total = this.pages.length;
    this.pages.forEach((commands, index) => {
      commands.push(`${tone(color.slate200)} RG ${margin} 38 m ${pageWidth - margin} 38 l S`);
      commands.push(
        `${tone(color.slate500)} rg BT /F1 7.5 Tf ${margin} 24 Td (Generated by Dealer Settlement Manager. This statement is based on confirmed transactions.) Tj ET`,
      );
      commands.push(
        `${tone(color.slate500)} rg BT /F1 7.5 Tf ${pageWidth - margin - 48} 24 Td (Page ${index + 1} of ${total}) Tj ET`,
      );
    });
  }

  output() {
    this.addFooters();
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
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObject} 0 R >>`,
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

  pdf.header({
    title: 'Dealer Settlement Statement',
    dealerName: dealer.storeName || dealer.name,
    period: statement.month,
    generatedDate: generatedAt.toLocaleDateString(),
    reportingCurrency: 'USD',
    dealerCurrency: dealer.currency || 'USD',
  });

  pdf.section('Dealer / Agreement');
  pdf.infoGrid([
    { label: 'Dealer', value: dealer.name },
    { label: 'Store', value: dealer.storeName || dealer.name },
    { label: 'Dealer Share', value: `${(dealer.dealerSharePercentage * 100).toFixed(2)}%` },
    { label: 'Company Share', value: `${(dealer.companySharePercentage * 100).toFixed(2)}%` },
    { label: 'Platform', value: dealer.platform || 'Not set' },
    { label: 'Default Currency', value: dealer.currency || 'USD' },
  ]);

  pdf.section('Statement Summary', 'Confirmed transactions determine all settlement totals.');
  pdf.summaryCards([
    { label: 'Platform Payouts', value: usd(totals.total_bank_payouts) },
    { label: 'Store Expenses', value: usd(totals.total_store_expenses) },
    { label: 'Dealer Share', value: usd(totals.dealer_share_amount) },
    { label: 'Company Share', value: usd(totals.company_share_amount) },
    { label: 'Printing Costs', value: usd(totals.total_printing_costs) },
    { label: 'Shipping Costs', value: usd(totals.total_shipping_costs) },
    { label: 'Dealer Receivable', value: usd(totals.dealer_receivable_amount), accent: true },
    { label: 'Paid', value: usd(totals.paid_amount) },
    { label: 'Remaining', value: usd(totals.remaining_amount), accent: true },
  ]);

  pdf.section('Transactions');
  if (statementTransactions.length === 0) {
    pdf.empty('No transaction rows.');
  } else {
    pdf.table(
      [
        { header: 'Date', width: 48 },
        { header: 'Type', width: 58 },
        { header: 'Order', width: 42 },
        { header: 'Original', width: 68, align: 'right' },
        { header: 'Rate', width: 40, align: 'right' },
        { header: 'USD', width: 58, align: 'right' },
        { header: 'Status', width: 50 },
        { header: 'Description', width: 147 },
      ],
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
    pdf.empty('No dealer payment allocations.');
  } else {
    pdf.table(
      [
        { header: 'Payment Date', width: 74 },
        { header: 'Original Payment', width: 110, align: 'right' },
        { header: 'Applied USD', width: 90, align: 'right' },
        { header: 'Description', width: 237 },
      ],
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
    pdf.empty('No pending order cost reminders.');
  } else {
    pdf.table(
      [
        { header: 'Order ID', width: 84 },
        { header: 'Scope', width: 74 },
        { header: 'Status', width: 88 },
        { header: 'Note', width: 265 },
      ],
      statementPendingCosts.map((cost) => [
        cost.orderCode,
        cost.costScope,
        cost.status,
        cost.note || '-',
      ]),
    );
  }

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
