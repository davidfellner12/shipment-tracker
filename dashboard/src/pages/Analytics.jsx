import { useState } from 'react';
import { Download, CheckCircle2, Clock4, Leaf, Route, Euro, Thermometer } from 'lucide-react';
import { api } from '../lib/api';
import { usePoll, useSession } from '../lib/session';
import { CUSTOMERS, FUEL, day, duration, eur, num, pct } from '../lib/format';
import { downloadCsv, SHIPMENT_COLUMNS } from '../lib/export';
import { Card, Kpi, PageHeader, Segmented, cx } from '../components/ui';
import { Histogram, Legend, RankBars, TimeBars } from '../components/charts';

function RateBar({ value }) {
  const tone = value >= 0.9 ? 'bg-good' : value >= 0.8 ? 'bg-warning' : 'bg-critical';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded-full bg-subtle"><div className={cx('h-full rounded-full', tone)} style={{ width: `${value * 100}%` }} /></div>
      <span className="w-12 tabular-nums text-ink">{pct(value, 1)}</span>
    </div>
  );
}

function BreakdownTable({ rows, first, showCost }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-ink-3">
            <th className="py-2 pr-4 font-medium">{first}</th>
            <th className="py-2 pr-4 text-right font-medium">Shipments</th>
            <th className="py-2 pr-4 font-medium">On time</th>
            <th className="py-2 pr-4 text-right font-medium">Avg transit</th>
            <th className="py-2 pr-4 text-right font-medium">g CO₂e/tkm</th>
            {showCost && <th className="py-2 text-right font-medium">Energy + tolls</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="py-2.5 pr-4 text-ink">{r.label}</td>
              <td className="py-2.5 pr-4 text-right tabular-nums text-ink-2">{r.shipments}</td>
              <td className="py-2.5 pr-4"><RateBar value={r.onTimeRate} /></td>
              <td className="py-2.5 pr-4 text-right tabular-nums text-ink-2">{r.avgTransitHours} h</td>
              <td className="py-2.5 pr-4 text-right tabular-nums text-ink-2">{r.gCo2ePerTkm ?? '—'}</td>
              {showCost && <td className="py-2.5 text-right tabular-nums text-ink-2">{eur(r.costEur)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Analytics() {
  const { isOperator, customerId } = useSession();
  const [days, setDays] = useState(30);
  const { data: m } = usePoll(() => api.metrics({ customerId, days }), [customerId, days], 15000);
  const k = m?.kpis;

  const exportReport = async () => {
    const res = await api.listShipments({ customerId, scope: 'history', days });
    const who = customerId ? CUSTOMERS[customerId].name.replace(/\W+/g, '-').toLowerCase() : 'all-customers';
    downloadCsv(`delivery-report-${who}-${days}d.csv`, res.shipments, SHIPMENT_COLUMNS);
  };

  return (
    <>
      <PageHeader title={isOperator ? 'Analytics' : 'Reports'}
        subtitle={isOperator ? 'Network performance from recorded telemetry' : `Service performance for ${CUSTOMERS[customerId]?.name}`}>
        <Segmented value={days} onChange={setDays} options={[[7, '7 days'], [14, '14 days'], [30, '30 days']]} />
        <button className="btn-outline" onClick={exportReport}><Download size={15} /> Delivery report</button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={CheckCircle2} label="On-time delivery" value={pct(k?.onTimeRate, 1)} loading={!m}
          context={k ? `${num(k.delivered)} deliveries` : null} />
        <Kpi icon={Clock4} label="Avg. lateness" value={k ? duration(k.avgLateMin) : '—'} loading={!m} context="when a delivery is late" />
        <Kpi icon={Clock4} label="ETA accuracy" value={k?.etaMaeMin != null ? `±${k.etaMaeMin}` : '—'} unit="min" loading={!m}
          context={k ? `predicted at halfway` : null} />
        <Kpi icon={Route} label="Avg. transit" value={num(k?.avgTransitHours, 1)} unit="h" loading={!m}
          context={k ? `${num(k.distanceKm)} km total` : null} />
        <Kpi icon={Leaf} label="Emissions" value={k ? num(k.co2eKg / 1000, 1) : '—'} unit="t CO₂e" loading={!m}
          context={k ? `${k.gCo2ePerTkm} g per tonne-km` : null} />
        {isOperator
          ? <Kpi icon={Euro} label="Energy + tolls" value={k ? `€${num(k.costPerKmEur, 1)}` : '—'} unit="/ km" loading={!m} context={k ? eur(k.costEur) : null} />
          : <Kpi icon={Thermometer} label="Temp excursions" value={k?.reeferShipments ? pct(k.tempExcursionRate, 1) : 'n/a'} loading={!m}
              context={k ? `of ${k.reeferShipments} reefer loads` : null} />}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Deliveries per day" subtitle="Split by punctuality"
          action={<Legend items={[['On time', 'var(--color-series-1)'], ['Late', 'var(--color-series-2)']]} />}>
          <TimeBars data={m?.daily || []} xFormat={day} labelFormat={day}
            series={[['onTime', 'On time', 'var(--color-series-1)'], ['late', 'Late', 'var(--color-series-2)']]} />
        </Card>
        <Card title="CO₂e per day" subtitle="Well-to-wheel, kg">
          <TimeBars data={m?.daily || []} xFormat={day} labelFormat={day} format={(v) => `${num(v)} kg`}
            series={[['co2eKg', 'CO₂e', 'var(--color-series-3)']]} />
        </Card>
        <Card title="ETA accuracy" subtitle="Error of the ETA predicted at the halfway point vs. actual delivery">
          <Histogram data={m?.etaAccuracy || []} xKey="bucket" valueKey="shipments" name="Shipments" />
        </Card>
        <Card title="Where time is lost" subtitle="Total minutes across delivered shipments">
          <RankBars data={m?.delayCauses || []} labelKey="cause" valueKey="minutes" name="Minutes" color="var(--color-series-2)"
            format={(v) => duration(v)} />
          <p className="mt-2 text-xs text-ink-3">Mandatory driver breaks and rests are planned and therefore excluded.</p>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_380px]">
        <Card title="Lanes" subtitle="Top lanes by volume">
          <BreakdownTable rows={m?.lanes || []} first="Lane" showCost={isOperator} />
        </Card>
        <Card title="Emission intensity by powertrain" subtitle="g CO₂e per tonne-km">
          <RankBars data={(m?.fuelMix || []).map((r) => ({ ...r, label: FUEL[r.key] || r.key }))} valueKey="gCo2ePerTkm"
            name="g CO₂e/tkm" format={(v) => `${v} g`} />
        </Card>
      </div>

      {isOperator && (
        <Card title="Customers" subtitle="Service level per account" className="mt-4">
          <BreakdownTable rows={m?.customers || []} first="Customer" showCost />
        </Card>
      )}
    </>
  );
}
