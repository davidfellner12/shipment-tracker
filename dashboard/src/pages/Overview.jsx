import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, CheckCircle2, Clock4, Leaf, PackageCheck, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { usePoll, useSession } from '../lib/session';
import { CARRIER, CUSTOMERS, STATUS, day, duration, num, pct, compactEur } from '../lib/format';
import { Card, Empty, Kpi, PageHeader } from '../components/ui';
import { Legend, TimeBars } from '../components/charts';
import FleetMap from '../components/FleetMap';
import ShipmentList from '../components/ShipmentList';

const SEVERITY_RANK = { critical: 0, warning: 1, ok: 2 };

export default function Overview() {
  const { isOperator, customerId } = useSession();
  const live = usePoll(() => api.listShipments({ customerId }), [customerId], 2000);
  const metrics = usePoll(() => api.metrics({ customerId, days: 30 }), [customerId], 15000);
  const [selected, setSelected] = useState(null);

  const shipments = live.data?.shipments || [];
  const active = shipments.filter((s) => s.status !== 'DELIVERED');
  const k = metrics.data?.kpis;
  const loading = !metrics.data;

  const attention = useMemo(() => active
    .filter((s) => s.exceptions.length)
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || (b.delayMin || 0) - (a.delayMin || 0)), [active]);
  const sidebar = isOperator ? attention : [...active].sort((a, b) => (a.etaAt || '').localeCompare(b.etaAt || ''));
  const daily = (metrics.data?.daily || []).slice(-14);

  return (
    <>
      <PageHeader
        title={isOperator ? 'Control tower' : CUSTOMERS[customerId]?.name}
        subtitle={isOperator ? `${CARRIER} · ${active.length} shipments on the road` : `Your shipments with ${CARRIER}`}>
        <Link to="/app/shipments" className="btn-outline">All shipments</Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi icon={Activity} label={isOperator ? 'Active shipments' : 'In transit'} value={num(k?.active)} loading={loading}
          context={k ? (k.atRisk ? `${k.atRisk} predicted late` : 'All on schedule') : null} tone={k?.atRisk ? 'warning' : 'good'} />
        <Kpi icon={CheckCircle2} label="On-time delivery · 30 d" value={pct(k?.onTimeRate, 1)} loading={loading}
          context={k ? `${num(k.delivered)} delivered · late by ${duration(k.avgLateMin)} on avg.` : null} />
        <Kpi icon={Clock4} label="ETA accuracy" value={k?.etaMaeMin != null ? `±${k.etaMaeMin}` : '—'} unit="min" loading={loading}
          context={k ? `${pct(k.etaWithin30Rate)} of ETAs within 30 min` : null} />
        <Kpi icon={Leaf} label="CO₂e intensity" value={num(k?.gCo2ePerTkm)} unit="g / tkm" loading={loading}
          context={k ? `${num(k.co2eKg / 1000, 1)} t CO₂e over ${num(k.tonneKm / 1e6, 1)}M tkm` : null} />
        <Kpi icon={isOperator ? PackageCheck : ShieldCheck} label={isOperator ? 'Cargo value moved · 30 d' : 'Cold-chain compliance'}
          loading={loading}
          value={isOperator ? compactEur(k?.cargoValueEur) : k?.reeferShipments ? pct(1 - k.tempExcursionRate, 1) : 'n/a'}
          context={k ? (isOperator ? `${num(k.distanceKm)} km driven` : k.reeferShipments ? `${k.reeferShipments} temperature-controlled loads` : 'No temperature-controlled loads') : null} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="card relative h-[460px] overflow-hidden lg:h-[560px]">
          <FleetMap shipments={active} selectedId={selected} onSelect={setSelected} className="absolute inset-0" />
        </div>
        <Card title={isOperator ? 'Needs attention' : 'Active shipments'}
          subtitle={isOperator ? 'Exceptions ranked by severity' : 'Sorted by arrival'}
          bodyClass="!p-0 max-h-[492px] overflow-y-auto">
          {sidebar.length
            ? <ShipmentList shipments={sidebar} selectedId={selected} onHover={setSelected} showCustomer={isOperator} />
            : <Empty icon={ShieldCheck} title={isOperator ? 'No open exceptions' : 'No shipments on the road'}>
                {isOperator ? 'Every active shipment is on schedule and within limits.' : 'New bookings appear here as soon as loading starts.'}
              </Empty>}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card title="Deliveries" subtitle="Last 14 days, by punctuality" action={<Legend items={[['On time', 'var(--color-series-1)'], ['Late', 'var(--color-series-2)']]} />}>
          <TimeBars data={daily} height={260} xFormat={day} labelFormat={day}
            series={[['onTime', 'On time', 'var(--color-series-1)'], ['late', 'Late', 'var(--color-series-2)']]} />
        </Card>
        <Card title="Right now" subtitle="Active shipments by state">
          <ul className="space-y-2.5">
            {Object.entries(STATUS).filter(([key]) => key !== 'DELIVERED').map(([key, s]) => {
              const n = active.filter((s) => s.status === key).length;
              const share = active.length ? n / active.length : 0;
              return (
                <li key={key} className="text-sm">
                  <div className="flex justify-between text-ink-2"><span>{s.label}</span><span className="tabular-nums text-ink">{n}</span></div>
                  <div className="mt-1 h-1.5 rounded-full bg-subtle"><div className="h-full rounded-full bg-series-1" style={{ width: `${share * 100}%` }} /></div>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-ink-3">
            Breaks and daily rests follow EU driving-time rules (Reg. 561/2006), so roughly half of a single-driver fleet is parked at any time.
          </p>
        </Card>
      </div>
    </>
  );
}
