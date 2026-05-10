import { Link } from 'react-router-dom';
import { Dealer, SettlementTransaction, Statement } from '../types';
import { stores, formatUsd } from '../data/mockData';
import { getDealerOpenBalance } from '../lib/statementCalculations';
import { StatusBadge } from '../components/ui/StatusBadge';
import { PageShell } from './Shared';

const formatPercent = (value: number) => `${(value * 100).toFixed(1).replace(/\.0$/, '')}%`;

export function DealersPage({ dealers, statements, transactions, allocations, storeIds }: { dealers: Dealer[]; statements: Statement[]; transactions: SettlementTransaction[]; allocations: any[]; storeIds?: string[] }) {
  const visible = storeIds ? dealers.filter((d) => storeIds.includes(d.storeId)) : dealers;
  return <PageShell title="Dealers" subtitle="Open balances are derived from statement remaining_amount values."><table className="w-full bg-white border rounded-lg overflow-hidden"><thead className="bg-slate-100 text-left"><tr><th className="p-3">Dealer</th><th>Store</th><th>Dealer Share</th><th>Company Share</th><th>Status</th><th>Open Balance</th></tr></thead><tbody>{visible.map((d) => <tr key={d.id} className="border-t"><td className="p-3"><Link className="text-indigoBrand" to={`/dealers/${d.id}`}>{d.name}</Link></td><td>{d.storeName || stores.find((s) => s.id === d.storeId)?.name}</td><td>{formatPercent(d.dealerSharePercentage)}</td><td>{formatPercent(d.companySharePercentage)}</td><td><StatusBadge status={d.status} /></td><td>{formatUsd(getDealerOpenBalance(d.id, statements, transactions, dealers, allocations))}</td></tr>)}</tbody></table></PageShell>;
}
