import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Flag, Link2, Thermometer, Leaf, Truck, Package, Timer, MapPin, PackageSearch, FileText, ArrowRight, FileCheck2, TriangleAlert } from 'lucide-react';
import { api } from '../lib/api';
import { usePoll, useSession } from '../lib/session';
import { CUSTOMER_EVENTS, FUEL, ago, country, dateTime, delayText, duration, eur, eventText, num } from '../lib/format';
import { params } from '../sim/engine.js';
import { Card, Empty, ExceptionPill, Field, Pill, Progress, StatusPill, cx } from '../components/ui';
import FleetMap from '../components/FleetMap';

export function Timeline({ events, customerView }) {
  const list = [...events].filter((e) => !customerView || CUSTOMER_EVENTS.has(e.type)).reverse();
  const tone = (t) => (t === 'TEMP_EXCURSION' ? 'bg-critical' : ['HOLD_STARTED', 'TRAFFIC_JAM', 'ETA_CHANGED'].includes(t) ? 'bg-warning'
    : t === 'DELIVERED' ? 'bg-good' : 'bg-accent');
  if (!list.length) return <p className="text-sm text-ink-3">No milestones yet.</p>;
  return (
    <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-line">
      {list.map((e, i) => {
        const { title, detail } = eventText(e);
        return (
          <li key={`${e.at}-${e.type}-${i}`} className="relative pl-6">
            <span className={cx('absolute left-0 top-1.5 size-[11px] rounded-full ring-4 ring-surface', tone(e.type))} />
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-ink">{title}</span>
              <time className="shrink-0 text-xs tabular-nums text-ink-3">{dateTime(e.at)}</time>
            </div>
            {detail && <div className="text-xs text-ink-3">{detail}{e.country ? ` · ${country(e.country)}` : ''}</div>}
          </li>
        );
      })}
    </ol>
  );
}

function FlagButton({ shipment }) {
  const [busy, setBusy] = useState(false);
  const flagged = !!shipment.flag;
  const toggle = async () => {
    const reason = flagged ? '' : window.prompt('Reason for flagging this shipment (visible to the customer):', 'Customer requested hold');
    if (reason === null) return;
    setBusy(true);
    try { await api.flag(shipment.shipmentId, !flagged, reason); }
    catch (err) { window.alert(`Could not update ${shipment.shipmentId}: ${err.message}`); }
    finally { setBusy(false); }
  };
  return (
    <button className="btn-outline" onClick={toggle} disabled={busy}>
      {flagged ? <Check size={15} /> : <Flag size={15} />}{flagged ? 'Clear flag' : 'Flag shipment'}
    </button>
  );
}

function CopyLink({ id }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/track/${id}`;
  return (
    <button className="btn-outline" onClick={async () => {
      try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }
      catch { window.prompt('Copy the tracking link:', url); }
    }}>
      {copied ? <Check size={15} /> : <Link2 size={15} />}{copied ? 'Copied' : 'Share tracking link'}
    </button>
  );
}

export default function ShipmentDetail() {
  const { id } = useParams();
  const { isOperator, customerId } = useSession();
  const { data, loading } = usePoll(() => api.getShipment(id), [id], 2000);

  const s = data?.shipment;
  if (!loading && (!s || (customerId && s.customerId !== customerId))) {
    return <Empty icon={PackageSearch} title={`Shipment ${id} not found`}>It may belong to another account or has expired from the 90-day history.</Empty>;
  }
  if (!s) return <div className="h-96 animate-pulse rounded-xl bg-subtle" />;

  const done = s.status === 'DELIVERED';
  const c = s.cargo || {}, t = s.totals || {}, hold = t.holdMin || {};
  const tkm = s.distanceKm * (c.tonnes || 0);
  const hos = params.hos;
  const reefer = c.tempMinC != null;
  const tempOk = !reefer || (s.reeferTempC >= c.tempMinC && s.reeferTempC <= c.tempMaxC);

  return (
    <>
      <Link to="/app/shipments" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink"><ArrowLeft size={15} /> Shipments</Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-xl font-semibold tracking-tight">{s.shipmentId}</h1>
            <StatusPill status={s.status} />
            {s.exceptions.map((e) => <ExceptionPill key={e} code={e} />)}
          </div>
          <p className="mt-1 text-sm text-ink-3">{s.routeLabel} · {s.customerName} · {c.type}</p>
          <p className="mt-1 font-mono text-xs text-ink-3">{s.orderRef} · {s.cmrNo}</p>
          {s.flag && <p className="mt-2 text-sm text-[#8a6200] dark:text-warning">Flagged: {s.flag.reason}</p>}
        </div>
        <div className="flex gap-2">
          <CopyLink id={s.shipmentId} />
          {isOperator && !done && <FlagButton shipment={s} />}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card px-5 py-4">
          <div className="label">{done ? 'Delivered' : 'Predicted arrival'}</div>
          <div className="mt-1.5 text-lg font-semibold tabular-nums">{dateTime(done ? s.deliveredAt : s.etaAt)}</div>
          <div className={cx('mt-1 text-xs', s.delayMin > 0 ? 'text-critical' : 'text-good')}>{delayText(s.delayMin)} vs. plan</div>
        </div>
        <div className="card px-5 py-4">
          <div className="label">Planned delivery</div>
          <div className="mt-1.5 text-lg font-semibold tabular-nums">{dateTime(s.plannedDeliveryAt)}</div>
          <div className="mt-1 text-xs text-ink-3">Departed {s.departedAt ? dateTime(s.departedAt) : 'not yet'}</div>
        </div>
        <div className="card px-5 py-4">
          <div className="label">Distance</div>
          <div className="mt-1.5 text-lg font-semibold tabular-nums">{num(s.distanceDoneKm)} <span className="text-sm font-normal text-ink-3">/ {num(s.distanceKm)} km</span></div>
          <div className="mt-2"><Progress value={s.progress} tone={done ? 'good' : 'accent'} /></div>
        </div>
        <div className="card px-5 py-4">
          <div className="label">Current position</div>
          <div className="mt-1.5 flex items-center gap-1.5 text-lg font-semibold"><MapPin size={16} className="text-accent" />{country(s.country)}</div>
          <div className="mt-1 text-xs text-ink-3">{s.speedKmh ? `${num(s.speedKmh)} km/h` : 'Stationary'} · updated {ago(s.lastSeenAt)}</div>
        </div>
      </div>

      {s.shipper && (
        <div className="card mt-4 grid items-center gap-4 p-5 md:grid-cols-[1fr_auto_1fr]">
          <div>
            <div className="label">Shipper · pickup</div>
            <div className="mt-1 font-medium text-ink">{s.shipper.name}</div>
            <div className="text-sm text-ink-3">{s.shipper.site}</div>
          </div>
          <ArrowRight size={18} className="hidden text-ink-3 md:block" />
          <div className="md:text-right">
            <div className="label">Consignee · delivery</div>
            <div className="mt-1 font-medium text-ink">{s.consignee.name}</div>
            <div className="text-sm text-ink-3">{s.consignee.site}</div>
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_400px]">
        <div className="card relative h-[420px] overflow-hidden">
          <FleetMap shipments={[s]} selectedId={s.shipmentId} fit="selected" showLanes={false} className="absolute inset-0" />
        </div>
        <Card title="Milestones" subtitle={isOperator ? 'Full telematics timeline' : 'Shipment progress'} bodyClass="max-h-[356px] overflow-y-auto">
          <Timeline events={data.events || []} customerView={!isOperator} />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card title="Cargo" action={<Package size={16} className="text-ink-3" />}>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Goods">{c.type}</Field>
            <Field label="HS code">{c.hsCode || '—'}</Field>
            <Field label="Weight">{c.tonnes} t</Field>
            <Field label={c.pallets ? 'Pallets' : 'Packaging'}>{c.pallets || c.packaging}</Field>
            <Field label="Declared value">{eur(c.valueEur)}</Field>
            <Field label="Packaging">{c.packaging || '—'}</Field>
          </div>
          {c.adr && (
            <div className="mt-4"><Pill tone="warning" icon={TriangleAlert} className="!whitespace-normal">ADR class {c.adr.class} · {c.adr.un} · {c.adr.name}</Pill></div>
          )}
        </Card>

        <Card title="Cold chain" action={<Thermometer size={16} className="text-ink-3" />}>
          {reefer ? (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Current">
                <span className={cx('font-semibold', tempOk ? 'text-ink' : 'text-critical')}>{s.reeferTempC} °C</span>
              </Field>
              <Field label="Required">{c.tempMinC} – {c.tempMaxC} °C</Field>
              <Field label="Excursions">{t.tempExcursions || 0}{t.tempExcursionMin ? ` · ${duration(t.tempExcursionMin)}` : ''}</Field>
              <Field label="Peak">{t.maxTempC != null ? `${t.maxTempC} °C` : '—'}</Field>
            </div>
          ) : <p className="text-sm text-ink-3">Ambient cargo — no temperature requirement.</p>}
        </Card>

        <Card title="Sustainability" action={<Leaf size={16} className="text-ink-3" />}>
          <div className="grid grid-cols-2 gap-4">
            <Field label="CO₂e so far">{num(t.co2eKg)} kg</Field>
            <Field label="Intensity">{s.distanceDoneKm > 5 && c.tonnes ? `${num(t.co2eKg * 1000 / (s.distanceDoneKm * c.tonnes))} g/tkm` : '—'}</Field>
            <Field label="Energy">{num(t.fuelUnits)} {t.fuelUnit}</Field>
            <Field label="Powertrain">{FUEL[s.fuelType] || s.fuelType}</Field>
          </div>
          <p className="mt-3 text-[11px] text-ink-3">Well-to-wheel, GLEC-aligned factors. Planned total {num(tkm)} tkm.</p>
        </Card>

        <Card title="Delays on route" action={<Timer size={16} className="text-ink-3" />}>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Customs">{duration(hold.customs || 0)}</Field>
            <Field label="Spot checks">{duration(hold.spotCheck || 0)}</Field>
            <Field label="Traffic (lost)">{duration(hold.traffic || 0)}</Field>
            <Field label="Breaks & rest">{duration((t.breakMin || 0) + (t.restMin || 0))}</Field>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card title="Documents" subtitle="Attached to this shipment" action={<FileText size={16} className="text-ink-3" />}>
          <ul className="divide-y divide-line">
            {(s.documents || []).map((d) => (
              <li key={d} className="flex items-center gap-2.5 py-2 text-sm text-ink-2"><FileText size={14} className="shrink-0 text-ink-3" />{d}</li>
            ))}
          </ul>
        </Card>
        <Card title="Proof of delivery" action={<FileCheck2 size={16} className="text-ink-3" />}>
          {s.pod ? (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Signed by">{s.pod.signedBy}</Field>
              <Field label="Signed at">{dateTime(s.pod.at)}</Field>
              <Field label="Remarks" className="col-span-2">{s.pod.remarks}</Field>
            </div>
          ) : <p className="text-sm text-ink-3">Captured electronically by the driver at delivery.</p>}
        </Card>
      </div>

      {isOperator && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Card title="Vehicle & driver" action={<Truck size={16} className="text-ink-3" />}>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field label="Vehicle">{s.plate}</Field>
              <Field label="Model">{s.vehicleModel}</Field>
              <Field label="Driver">{s.driverName}</Field>
              <Field label="Driving left today">{done ? '—' : s.status === 'REST' ? `${duration(hos.maxDailyDrivingMin)} after rest`
                : duration(Math.max(0, hos.maxDailyDrivingMin - (s.driving?.todayMin || 0)))}</Field>
              <Field label="Until next break">{done ? '—' : duration(Math.max(0, hos.maxContinuousDrivingMin - (s.driving?.sinceBreakMin || 0)))}</Field>
              <Field label="Telemetry">seq #{s.seq} · {s.ingestLatencyMs != null ? `${s.ingestLatencyMs} ms` : '—'}</Field>
            </div>
          </Card>
          <Card title="Trip economics" subtitle="Direct variable costs (energy + road tolls)">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Field label="Energy">{eur(t.fuelEur)}</Field>
              <Field label="Tolls">{eur(t.tollEur)}</Field>
              <Field label="Total">{eur((t.fuelEur || 0) + (t.tollEur || 0))}</Field>
              <Field label="Per km">{s.distanceDoneKm > 5 ? `€${(((t.fuelEur || 0) + (t.tollEur || 0)) / s.distanceDoneKm).toFixed(2)}` : '—'}</Field>
            </div>
            <p className="mt-3 text-[11px] text-ink-3">Indicative national toll rates for a 40 t Euro VI truck.</p>
          </Card>
        </div>
      )}
    </>
  );
}
