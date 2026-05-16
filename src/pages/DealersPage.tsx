import { Link } from 'react-router-dom';
import { Dealer, SettlementTransaction, Statement } from '../types';
import { stores, formatUsd } from '../data/mockData';
import { getDealerBalanceSummary } from '../lib/statementCalculations';
import { StatusBadge } from '../components/ui/StatusBadge';
import { SectionCard } from '../components/ui/Primitives';
import { PageShell } from './Shared';

const formatPercent = (value: number) => `${(value * 100).toFixed(1).replace(/\.0$/, '')}%`;
const normalizeDisplayMoney = (amount: number) => (Math.abs(amount) <= 0.01 ? 0 : amount);

export function DealersPage({ dealers, statements, transactions, allocations, storeIds }: { dealers: Dealer[]; statements: Statement[]; transactions: SettlementTransaction[]; allocations: any[]; storeIds?: string[] }) {
  const visible = storeIds ? dealers.filter((d) => storeIds.includes(d.storeId)) : dealers;
  return (
    <PageShell title="Dealers" subtitle="Open balances are derived from statement remaining_amount values.">
      <SectionCard title="Dealer Accounts" subtitle="Agreement share, account status, and current open balance by store.">
        <div className="space-y-3 p-5">
          {visible.map((dealer) => {
            const storeName = dealer.storeName || stores.find((store) => store.id === dealer.storeId)?.name || dealer.storeId;
            const balance = getDealerBalanceSummary(dealer.id, statements, transactions, dealers, allocations);
            return (
              <div
                key={dealer.id}
                className="rounded-2xl border border-psnsMist bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link className="text-base font-semibold text-indigoBrand hover:text-psnsOrange" to={`/dealers/${dealer.id}`}>
                        {dealer.name}
                      </Link>
                      <StatusBadge status={dealer.status} />
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-900">{storeName}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {dealer.platform || 'No platform set'} · {dealer.currency || 'USD'} default currency
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[560px]">
                    <div className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-psnsMist">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Dealer Share</p>
                      <p className="mt-1 text-sm font-semibold text-slate-950">{formatPercent(dealer.dealerSharePercentage)}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-psnsMist">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Company Share</p>
                      <p className="mt-1 text-sm font-semibold text-slate-950">{formatPercent(dealer.companySharePercentage)}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2 text-right ring-1 ring-psnsMist">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Open Balance</p>
                      <p className="mt-1 text-sm font-semibold text-indigoBrand">
                        {formatUsd(normalizeDisplayMoney(balance.netOpenBalance))}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 justify-start lg:justify-end">
                    <Link
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-psnsMist bg-white px-3.5 text-sm font-semibold text-indigoBrand shadow-sm transition hover:bg-slate-50"
                      to={`/dealers/${dealer.id}`}
                    >
                      View
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>
    </PageShell>
  );
}
