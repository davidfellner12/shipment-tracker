import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Search, Thermometer, PackageSearch } from 'lucide-react';
import { api } from '../lib/api';
import { usePoll, useSession } from '../lib/session';
import { CUSTOMERS, STATUS, dateTime, delayText, time, day } from '../lib/format';
import { downloadCsv, SHIPMENT_COLUMNS } from '../lib/export';
import { Empty, ExceptionPill, PageHeader, Progress, Segmented, SeverityDot, StatusPill, cx } from '../components/ui';

export default function Shipments() {
  const { isOperator, customerId } = useSession();
  const navigate = useNavigate();
  const [scope, setScope] = useState('active');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [customer, setCustomer] = useState('');
  const [onlyExceptions, setOnlyExceptions] = useState(false);

  const effectiveCustomer = customerId || customer || undefined;
  const { data } = usePoll(
    () => api.listShipments({ customerId: effectiveCustomer, scope: scope === 'history' ? 'history' : undefined, days: 30 }),
    [effectiveCustomer, scope], scope === 'history' ? 15000 : 2000);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.shipments || [])
      .filter((s) => !status || s.status === status)
      .filter((s) => !onlyExceptions || s.exceptions.length || s.onTime === false)
      .filter((s) => !q || [s.shipmentId, s.orderRef, s.cmrNo, s.routeLabel, s.customerName, s.consignee?.name, s.plate, s.cargo?.type].some((v) => v?.toLowerCase().includes(q)))
      .sort((a, b) => scope === 'history' ? 0 : (a.status === 'DELIVERED') - (b.status === 'DELIVERED'));
  }, [data, query, status, onlyExceptions, scope]);

  return (
    <>
      <PageHeader title="Shipments" subtitle={scope === 'history' ? 'Delivered in the last 30 days' : 'On the road and delivered in the last 24 h'}>
        <button className="btn-outline" onClick={() => downloadCsv(`shipments-${scope}.csv`, rows, SHIPMENT_COLUMNS)}>
          <Download size={15} /> Export CSV
        </button>
      </PageHeader>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented value={scope} onChange={setScope} options={[['active', 'Live'], ['history', 'History']]} />
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input className="input w-64 pl-9" placeholder="Search ID, PO, CMR, consignee, plate…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {scope === 'active' && (
          <select className="input cursor-pointer" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">All states</option>
            {Object.entries(STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
          </select>
        )}
        {isOperator && (
          <select className="input cursor-pointer" value={customer} onChange={(e) => setCustomer(e.target.value)} aria-label="Customer">
            <option value="">All customers</option>
            {Object.entries(CUSTOMERS).map(([id, c]) => <option key={id} value={id}>{c.name}</option>)}
          </select>
        )}
        <label className="ml-1 inline-flex cursor-pointer items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" className="accent-[var(--color-accent)]" checked={onlyExceptions} onChange={(e) => setOnlyExceptions(e.target.checked)} />
          {scope === 'history' ? 'Late only' : 'Exceptions only'}
        </label>
        <span className="ml-auto text-xs text-ink-3">{rows.length} shipments</span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-medium text-ink-3">
              <th className="px-4 py-3 font-medium">Shipment</th>
              <th className="px-4 py-3 font-medium">Lane</th>
              {isOperator && <th className="px-4 py-3 font-medium">Customer</th>}
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="w-40 px-4 py-3 font-medium">Progress</th>
              <th className="px-4 py-3 font-medium">{scope === 'history' ? 'Delivered' : 'ETA'}</th>
              <th className="px-4 py-3 text-right font-medium">vs. plan</th>
              <th className="px-4 py-3 font-medium">Cargo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line [&_td]:whitespace-nowrap">
            {rows.map((s) => (
              <tr key={s.shipmentId} onClick={() => navigate(`/app/shipments/${s.shipmentId}`)}
                className="cursor-pointer transition-colors hover:bg-subtle/60">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <SeverityDot severity={s.status === 'DELIVERED' ? (s.onTime ? 'ok' : 'warning') : s.severity} />
                    <span className="font-mono text-[13px] font-medium">{s.shipmentId}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-ink-2">{s.routeLabel}</td>
                {isOperator && <td className="px-4 py-3 text-ink-2">{s.customerName}</td>}
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    <StatusPill status={s.status} />
                    {s.exceptions.filter((e) => e !== 'BORDER_HOLD').map((e) => <ExceptionPill key={e} code={e} />)}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Progress value={s.progress} tone={s.status === 'DELIVERED' ? 'good' : 'accent'} />
                    <span className="w-9 text-right text-xs tabular-nums text-ink-3">{Math.round(s.progress * 100)}%</span>
                  </div>
                </td>
                <td className="px-4 py-3 tabular-nums text-ink-2" title={dateTime(s.deliveredAt || s.etaAt)}>
                  {scope === 'history' ? `${day(s.deliveredAt)} ${time(s.deliveredAt)}` : dateTime(s.etaAt)}
                </td>
                <td className={cx('px-4 py-3 text-right tabular-nums', s.delayMin > 0 ? 'text-critical' : 'text-ink-3')}>{delayText(s.delayMin)}</td>
                <td className="px-4 py-3 text-ink-2">
                  <span className="inline-flex items-center gap-1">
                    {s.cargo?.tempMinC != null && <Thermometer size={13} className="text-accent" aria-label="Temperature-controlled" />}
                    {s.cargo?.type} · {s.cargo?.tonnes} t
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && !rows.length && <Empty icon={PackageSearch} title="No shipments match">Try clearing the filters or switching to History.</Empty>}
      </div>
    </>
  );
}
