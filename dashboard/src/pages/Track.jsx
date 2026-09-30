// Public tracking page — what a shipper sends to their consignee. No login, no
// internal data (driver, costs, telematics details).
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PackageSearch, Search } from 'lucide-react';
import { api } from '../lib/api';
import { usePoll } from '../lib/session';
import { CARRIER, dateTime, delayText, num, country, ago } from '../lib/format';
import { Empty, Progress, StatusPill, cx } from '../components/ui';
import FleetMap from '../components/FleetMap';
import { Logo, ThemeToggle } from '../components/AppShell';
import { Timeline } from './ShipmentDetail';

export default function Track() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const { data, loading } = usePoll(() => api.getShipment(id), [id], 3000);
  const s = data?.shipment;
  const done = s?.status === 'DELIVERED';

  return (
    <div className="min-h-full">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Logo />
          <div className="flex items-center gap-2">
            <form onSubmit={(e) => { e.preventDefault(); if (query.trim()) navigate(`/track/${query.trim().toUpperCase()}`); }} className="relative hidden sm:block">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
              <input className="input w-56 pl-9" placeholder="Tracking number" value={query} onChange={(e) => setQuery(e.target.value)} />
            </form>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        {!loading && !s && <Empty icon={PackageSearch} title={`We couldn't find ${id}`}>Check the tracking number in your shipping notification.</Empty>}
        {!s && loading && <div className="h-96 animate-pulse rounded-xl bg-subtle" />}
        {s && (
          <>
            <div className="text-sm text-ink-3">Shipment <span className="font-mono text-ink">{s.shipmentId}</span> · shipped by {s.customerName} with {CARRIER}</div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              {done ? `Delivered ${dateTime(s.deliveredAt)}` : `Arriving ${dateTime(s.etaAt)}`}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusPill status={s.status} />
              <span className={cx('text-sm', s.delayMin > 0 ? 'text-critical' : 'text-good')}>{delayText(s.delayMin)} vs. the agreed time</span>
            </div>

            <div className="card mt-6 p-5">
              <div className="flex justify-between gap-4 text-sm">
                <div><div className="font-medium">{s.originName}</div><div className="text-xs text-ink-3">{s.shipper?.site}</div></div>
                <div className="text-right"><div className="font-medium">{s.destinationName}</div><div className="text-xs text-ink-3">{s.consignee?.name}</div></div>
              </div>
              <div className="my-3"><Progress value={s.progress} tone={done ? 'good' : 'accent'} /></div>
              <div className="flex flex-wrap justify-between gap-2 text-xs text-ink-3">
                <span>{num(s.distanceDoneKm)} of {num(s.distanceKm)} km</span>
                <span>{done ? `Signed for by ${s.pod?.signedBy ?? 'consignee'}` : `Currently in ${country(s.country)} · updated ${ago(s.lastSeenAt)}`}</span>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-[1fr_340px]">
              <div className="card relative h-[380px] overflow-hidden">
                <FleetMap shipments={[s]} selectedId={s.shipmentId} fit="selected" showLanes={false} className="absolute inset-0" />
              </div>
              <div className="card max-h-[380px] overflow-y-auto p-5">
                <h2 className="mb-4 text-sm font-semibold">Tracking history</h2>
                <Timeline events={data.events || []} customerView />
              </div>
            </div>
            <p className="mt-6 text-center text-xs text-ink-3">
              Live tracking powered by <Link to="/" className="text-accent hover:underline">Tracelane</Link>
            </p>
          </>
        )}
      </main>
    </div>
  );
}
