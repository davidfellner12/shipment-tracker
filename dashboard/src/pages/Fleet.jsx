import { Link } from 'react-router-dom';
import { Snowflake, Box } from 'lucide-react';
import { api } from '../lib/api';
import { usePoll } from '../lib/session';
import { FUEL, HUBS, country, duration } from '../lib/format';
import { catalog, params } from '../sim/engine.js';
import { PageHeader, Pill, StatusPill } from '../components/ui';

function HoursBar({ used, max }) {
  const left = Math.max(0, max - used), share = left / max;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-subtle"><div className="h-full rounded-full bg-series-1" style={{ width: `${share * 100}%` }} /></div>
      <span className="text-xs tabular-nums text-ink-2">{duration(left)}</span>
    </div>
  );
}

export default function Fleet() {
  const { data } = usePoll(() => api.listShipments({}), [], 3000);
  const shipments = data?.shipments || [];
  const hos = params.hos;

  const rows = catalog.vehicles.map((v) => {
    const mine = shipments.filter((s) => s.vehicleId === v.id);
    const current = mine.find((s) => s.status !== 'DELIVERED');
    const last = mine.filter((s) => s.status === 'DELIVERED').sort((a, b) => (b.deliveredAt || '').localeCompare(a.deliveredAt || ''))[0];
    return { v, current, last };
  });
  const onRoad = rows.filter((r) => r.current).length;
  const zeroEmission = catalog.vehicles.filter((v) => v.fuel === 'ELECTRIC' || v.fuel === 'HVO').length;

  return (
    <>
      <PageHeader title="Fleet" subtitle={`${catalog.vehicles.length} trucks · ${onRoad} on a job · ${zeroEmission} low-carbon (BEV / HVO)`} />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-3">
              {['Vehicle', 'Powertrain', 'Trailer', 'Driver', 'State', 'Shipment', 'Location', 'Driving left today', 'Until break'].map((h) =>
                <th key={h} className="px-4 py-3 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(({ v, current, last }) => (
              <tr key={v.id}>
                <td className="px-4 py-3"><div className="font-medium text-ink">{v.plate}</div><div className="text-xs text-ink-3">{v.model}{v.year ? ` · ${v.year}` : ""}</div></td>
                <td className="px-4 py-3 text-ink-2">{FUEL[v.fuel]}</td>
                <td className="px-4 py-3">{v.reefer ? <Pill tone="accent" icon={Snowflake}>Reefer</Pill> : <Pill icon={Box}>Dry van</Pill>}</td>
                <td className="px-4 py-3 text-ink-2">{catalog.drivers[v.driver].name}</td>
                <td className="px-4 py-3">{current ? <StatusPill status={current.status} /> : <Pill tone="good">Available</Pill>}</td>
                <td className="px-4 py-3">
                  {current ? <Link className="font-mono text-[13px] text-accent hover:underline" to={`/app/shipments/${current.shipmentId}`}>{current.shipmentId}</Link>
                    : <span className="text-ink-3">—</span>}
                  {current && <div className="text-xs text-ink-3">{current.routeLabel}</div>}
                </td>
                <td className="px-4 py-3 text-ink-2">
                  {current ? country(current.country) : last ? `${HUBS[last.destination]?.name} (hub)` : `${HUBS[v.home]?.name} (home)`}
                </td>
                <td className="px-4 py-3">{current ? <HoursBar used={current.driving?.todayMin || 0} max={hos.maxDailyDrivingMin} /> : <span className="text-ink-3">—</span>}</td>
                <td className="px-4 py-3">{current ? <HoursBar used={current.driving?.sinceBreakMin || 0} max={hos.maxContinuousDrivingMin} /> : <span className="text-ink-3">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-ink-3">Driving hours come from the tachograph feed (EU 561/2006: 4.5 h before a 45 min break, 9 h per day).</p>
    </>
  );
}
