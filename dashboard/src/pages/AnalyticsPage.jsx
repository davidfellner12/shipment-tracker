// src/pages/AnalyticsPage.jsx
import React, { useMemo } from 'react';
import NavBar from '../components/NavBar';
import { exportAnalyticsCSV } from '../lib/export';

const COST_PER_DELAY_MIN    = 8.5;
const MONTHLY_BASELINE_LOSS = 18_000; // from 1-pager: €18K avg monthly parcel losses
const SAVINGS_RATE          = 0.65;   // 65% of losses eliminated
const MONTHLY_AWS_COST_EUR  = 15;     // ~$15/month at production scale (≈€14)
const UNIT_COST = {
  iot:      1.00  / 100_000,
  kinesis:  0.014 / 1_000_000,
  lambda:   0.20  / 1_000_000,
  dynamodb: 1.25  / 1_000_000,
};
const KINESIS_SHARD_HOUR = 0.015;

// ── Shared atoms ─────────────────────────────────────────────────────────────

function SH({ children }) {
  return (
    <div style={{
      fontFamily: 'var(--font-display)', fontSize: '9px', letterSpacing: '0.22em',
      color: 'var(--text-muted)', textTransform: 'uppercase',
      borderBottom: '1px solid var(--border)', paddingBottom: '8px', marginBottom: '18px',
    }}>{children}</div>
  );
}

function BigKPI({ label, value, sub, color, accent, width }) {
  return (
    <div style={{
      padding: '22px 26px', background: 'var(--bg-card)',
      border: '1px solid var(--border)', borderTop: `3px solid ${accent || color || 'var(--neon-cyan)'}`,
      borderRadius: '6px', width,
    }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '9px', letterSpacing: '0.22em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px' }}>{label}</div>
      <div style={{ fontFamily: 'var(--text-mono)', fontSize: '32px', color: color || 'var(--neon-cyan)', lineHeight: 1, marginBottom: '6px', textShadow: `0 0 20px ${color || 'var(--neon-cyan)'}40` }}>{value}</div>
      {sub && <div style={{ fontFamily: 'var(--font-display)', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
}

function BarRow({ label, value, max, color, right }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: '12px', color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontFamily: 'var(--text-mono)', fontSize: '12px', color }}>{right}</span>
      </div>
      <div style={{ height: '5px', background: 'var(--border)', borderRadius: '3px' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '3px', transition: 'width 0.6s ease', boxShadow: `0 0 8px ${color}60` }} />
      </div>
    </div>
  );
}

// ── Savings Hero ─────────────────────────────────────────────────────────────

function SavingsHero({ stats }) {
  const roi = Math.round(stats.monthlySaving / MONTHLY_AWS_COST_EUR);
  const annualSaving = stats.monthlySaving * 12;
  const breakEvenDays = Math.round((MONTHLY_AWS_COST_EUR / stats.monthlySaving) * 30);

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(0,230,118,0.07) 0%, rgba(0,229,255,0.05) 100%)',
      border: '1px solid rgba(0,230,118,0.3)',
      borderLeft: '4px solid var(--neon-green)',
      borderRadius: '8px', padding: '32px 36px', marginBottom: '32px',
    }}>
      {/* Top label */}
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '10px', letterSpacing: '0.3em', color: 'var(--neon-green)', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ width: '24px', height: '1px', background: 'var(--neon-green)' }} />
        ShipTrack ROI at a Glance
        <div style={{ width: '24px', height: '1px', background: 'var(--neon-green)' }} />
      </div>

      {/* Before / Arrow / After */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr', gap: '0', alignItems: 'center', marginBottom: '28px' }}>
        {/* Before */}
        <div style={{ padding: '20px 24px', background: 'rgba(255,23,68,0.06)', border: '1px solid rgba(255,23,68,0.25)', borderRadius: '6px' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '9px', letterSpacing: '0.25em', color: 'var(--neon-red)', textTransform: 'uppercase', marginBottom: '14px' }}>
            ✗ Before ShipTrack
          </div>
          {[
            { label: 'Avg. monthly parcel losses',   value: '€18,000', color: 'var(--neon-red)' },
            { label: 'Delays from blind spots',       value: '34%',     color: 'var(--neon-red)' },
            { label: 'Support calls "where is it?"', value: '60%',     color: 'var(--neon-amber)' },
            { label: 'Visibility latency',            value: 'Hours',   color: 'var(--neon-amber)' },
          ].map(r => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '12px', color: 'var(--text-muted)' }}>{r.label}</span>
              <span style={{ fontFamily: 'var(--text-mono)', fontSize: '13px', color: r.color }}>{r.value}</span>
            </div>
          ))}
        </div>

        {/* Arrow */}
        <div style={{ textAlign: 'center', fontFamily: 'var(--text-mono)', fontSize: '32px', color: 'var(--neon-green)', textShadow: '0 0 20px rgba(0,230,118,0.4)' }}>→</div>

        {/* After */}
        <div style={{ padding: '20px 24px', background: 'rgba(0,230,118,0.06)', border: '1px solid rgba(0,230,118,0.25)', borderRadius: '6px' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '9px', letterSpacing: '0.25em', color: 'var(--neon-green)', textTransform: 'uppercase', marginBottom: '14px' }}>
            ✓ With ShipTrack
          </div>
          {[
            { label: 'Monthly saving',              value: `€${stats.monthlySaving.toLocaleString()}`, color: 'var(--neon-green)' },
            { label: 'Reduced delays',              value: `${stats.onTimeRate}% on-time`,             color: 'var(--neon-green)' },
            { label: 'Real-time alerts',            value: 'Instant',                                  color: 'var(--neon-green)' },
            { label: 'End-to-end visibility',       value: '< 5 s',                                    color: 'var(--neon-cyan)' },
          ].map(r => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '12px', color: 'var(--text-muted)' }}>{r.label}</span>
              <span style={{ fontFamily: 'var(--text-mono)', fontSize: '13px', color: r.color }}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ROI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px' }}>
        {[
          { label: 'Monthly Saving',     value: `€${stats.monthlySaving.toLocaleString()}`, color: 'var(--neon-green)', large: true },
          { label: 'Annual Saving',      value: `€${Math.round(annualSaving / 1000)}K`,     color: 'var(--neon-green)' },
          { label: 'Return on Investment', value: `${roi}×`,                                 color: 'var(--neon-cyan)' },
          { label: 'Break-even in',      value: `< ${breakEvenDays} days`,                  color: 'var(--neon-cyan)' },
        ].map(r => (
          <div key={r.label} style={{
            padding: '16px 18px', background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(0,230,118,0.2)', borderRadius: '6px', textAlign: 'center',
          }}>
            <div style={{ fontFamily: 'var(--text-mono)', fontSize: r.large ? '36px' : '28px', color: r.color, lineHeight: 1, marginBottom: '6px', textShadow: `0 0 20px ${r.color}50` }}>{r.value}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '10px', letterSpacing: '0.15em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{r.label}</div>
          </div>
        ))}
      </div>

      {/* Fine print */}
      <div style={{ marginTop: '14px', fontFamily: 'var(--font-display)', fontSize: '10px', color: 'var(--text-muted)', textAlign: 'right' }}>
        System cost: ~€{MONTHLY_AWS_COST_EUR}/month production · Saving based on 65% elimination of €18K baseline monthly losses
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AnalyticsPage({ shipments, onNavigate, latencyMs }) {
  const stats = useMemo(() => {
    const delayed   = shipments.filter(s => s.status === 'DELAYED');
    const active    = shipments.filter(s => s.status !== 'DELIVERED');
    const delivered = shipments.filter(s => s.status === 'DELIVERED');

    const totalDelayCost  = delayed.reduce((a, s) => a + Math.round(parseFloat(s.etaMinutes) * 0.15 * COST_PER_DELAY_MIN), 0);
    const totalCargoValue = shipments.reduce((a, s) => a + (s.cargoValue || 30000), 0);
    const atRiskValue     = delayed.reduce((a, s) => a + (s.cargoValue || 30000), 0);
    const onTimeRate      = shipments.length ? Math.round(((shipments.length - delayed.length) / shipments.length) * 100) : 100;
    const avgSpeed        = active.length ? Math.round(active.reduce((a, s) => a + parseFloat(s.speedKmh || 0), 0) / active.length) : 0;
    const monthlySaving   = Math.round(MONTHLY_BASELINE_LOSS * SAVINGS_RATE);

    const costPerShipDay = (
      (UNIT_COST.iot + UNIT_COST.kinesis + UNIT_COST.lambda + UNIT_COST.dynamodb) * (86400 / 3)
      + (KINESIS_SHARD_HOUR * 24 / Math.max(1, shipments.length))
    );

    return { delayed, active, delivered, totalDelayCost, totalCargoValue, atRiskValue, onTimeRate, avgSpeed, monthlySaving, costPerShipDay };
  }, [shipments]);

  const STATUS_COLOR = { IN_TRANSIT: 'var(--neon-cyan)', ARRIVING_SOON: 'var(--neon-green)', DELAYED: 'var(--neon-red)', DELIVERED: 'var(--neon-green)' };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <NavBar page="analytics" onNavigate={onNavigate} shipments={shipments} latencyMs={latencyMs} />

      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-base)' }}>

        {/* Page header */}
        <div style={{ padding: '24px 40px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={() => onNavigate('fleet')} style={{ background: 'none', border: '1px solid var(--border-bright)', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px 16px', fontFamily: 'var(--font-display)', fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', borderRadius: '4px' }}>
            ← Fleet
          </button>
          <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '22px', color: 'var(--neon-cyan)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Cost & Performance Analytics</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Live fleet metrics · ROI analysis · AWS unit economics</div>
          </div>
          <button
            onClick={() => exportAnalyticsCSV(shipments)}
            style={{ background: 'none', border: '1px solid var(--neon-cyan)', color: 'var(--neon-cyan)', cursor: 'pointer', padding: '8px 20px', fontFamily: 'var(--font-display)', fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            ↓ Export CSV
          </button>
        </div>

        <div style={{ padding: '32px 40px', maxWidth: '1200px' }}>

          {/* ── Savings Hero ── */}
          <SavingsHero stats={stats} />

          {/* ── KPI grid ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '40px' }}>
            <BigKPI label="Monthly Cost Saving"   value={`€${stats.monthlySaving.toLocaleString()}`} sub="vs manual tracking (65% of €18K baseline)" color="var(--neon-green)" accent="var(--neon-green)" />
            <BigKPI label="Active Delay Cost"      value={`€${stats.totalDelayCost.toLocaleString()}`} sub={`accruing at €${COST_PER_DELAY_MIN}/min per delayed route`} color={stats.totalDelayCost > 0 ? 'var(--neon-red)' : 'var(--neon-green)'} accent={stats.totalDelayCost > 0 ? 'var(--neon-red)' : 'var(--neon-green)'} />
            <BigKPI label="On-Time Rate"           value={`${stats.onTimeRate}%`} sub={`${stats.delayed.length} delayed · ${stats.active.length} active · ${stats.delivered.length} delivered`} color={stats.onTimeRate >= 90 ? 'var(--neon-green)' : stats.onTimeRate >= 70 ? 'var(--neon-amber)' : 'var(--neon-red)'} />
            <BigKPI label="Total Cargo Under Mgmt" value={`€${Math.round(stats.totalCargoValue / 1000)}K`} sub="combined value of all tracked shipments" color="var(--text-primary)" accent="var(--neon-cyan)" />
            <BigKPI label="At-Risk Cargo Value"    value={`€${Math.round(stats.atRiskValue / 1000)}K`} sub="cargo on delayed routes" color={stats.atRiskValue > 0 ? 'var(--neon-amber)' : 'var(--text-muted)'} accent={stats.atRiskValue > 0 ? 'var(--neon-amber)' : 'var(--border)'} />
            <BigKPI label="Avg Fleet Speed"        value={`${stats.avgSpeed} km/h`} sub="across all active routes right now" color="var(--neon-cyan)" />
          </div>

          {/* ── Delay cost + speed distribution ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '24px' }}>
              <SH>Delay Cost Exposure per Shipment</SH>
              {shipments.map(s => {
                const cost = s.isDelayed ? Math.round(parseFloat(s.etaMinutes) * 0.15 * COST_PER_DELAY_MIN) : 0;
                return (
                  <BarRow
                    key={s.shipmentId}
                    label={`${s.shipmentId} · ${s.cargo}`}
                    value={cost} max={5000}
                    color={s.isDelayed ? 'var(--neon-red)' : 'var(--border-bright)'}
                    right={s.isDelayed ? `€${cost.toLocaleString()} delay` : 'On time'}
                  />
                );
              })}
            </div>
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '24px' }}>
              <SH>Fleet Speed Distribution (km/h)</SH>
              {shipments.map(s => {
                const spd = parseFloat(s.speedKmh);
                return (
                  <BarRow
                    key={s.shipmentId}
                    label={`${s.shipmentId} · ${s.routeLabel}`}
                    value={spd} max={120}
                    color={spd < 45 ? 'var(--neon-red)' : spd > 75 ? 'var(--neon-green)' : 'var(--neon-cyan)'}
                    right={`${spd.toFixed(0)} km/h`}
                  />
                );
              })}
            </div>
          </div>

          {/* ── Cargo value at risk ── */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '24px', marginBottom: '32px' }}>
            <SH>Cargo Value by Route</SH>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
              {shipments.map(s => {
                const cv  = s.cargoValue || 30000;
                const sc  = s.isDelayed ? 'var(--neon-red)' : STATUS_COLOR[s.status] || 'var(--neon-cyan)';
                const pct = Math.round(parseFloat(s.progress) * 100);
                return (
                  <div key={s.shipmentId} style={{
                    padding: '14px 16px', background: 'var(--bg-card)',
                    border: '1px solid var(--border)', borderLeft: `3px solid ${sc}`, borderRadius: '4px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontFamily: 'var(--text-mono)', fontSize: '12px', color: sc }}>{s.shipmentId}</span>
                      <span style={{ fontFamily: 'var(--text-mono)', fontSize: '13px', color: 'var(--neon-green)' }}>€{Math.round(cv/1000)}K</span>
                    </div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>{s.cargo}</div>
                    <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: sc, borderRadius: '2px' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px' }}>
                      <span style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', color: 'var(--text-muted)' }}>{pct}%</span>
                      {s.isDelayed && <span style={{ fontFamily: 'var(--font-display)', fontSize: '9px', color: 'var(--neon-red)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>⚠ delayed</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── AWS unit economics ── */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '24px', marginBottom: '32px' }}>
            <SH>AWS Unit Economics — Cost per Shipment Tracked</SH>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              1 GPS event every 3 s · eu-central-1 list prices · free tier excluded
            </p>
            <div style={{ borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', padding: '10px 16px', background: 'var(--bg-panel)', gap: '8px' }}>
                {['Service', 'Rate', 'Per event ($)', 'Per ship/day ($)'].map(h => (
                  <div key={h} style={{ fontFamily: 'var(--font-display)', fontSize: '9px', letterSpacing: '0.15em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{h}</div>
                ))}
              </div>
              {[
                { svc: 'AWS IoT Core',    rate: '$1.00 / 100K msg',  evt: UNIT_COST.iot,      day: UNIT_COST.iot * (86400/3) },
                { svc: 'Amazon Kinesis',  rate: '$0.015 / shard-h',  evt: UNIT_COST.kinesis,  day: KINESIS_SHARD_HOUR * 24 / Math.max(1, shipments.length) },
                { svc: 'AWS Lambda',      rate: '$0.20 / 1M req',    evt: UNIT_COST.lambda,   day: UNIT_COST.lambda * (86400/3) },
                { svc: 'Amazon DynamoDB', rate: '$1.25 / 1M WRU',   evt: UNIT_COST.dynamodb, day: UNIT_COST.dynamodb * (86400/3) },
              ].map((row, i) => (
                <div key={row.svc} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', padding: '12px 16px', gap: '8px', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)', borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '12px', color: 'var(--neon-cyan)' }}>{row.svc}</div>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', color: 'var(--text-secondary)' }}>{row.rate}</div>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>${row.evt.toExponential(2)}</div>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '13px', color: 'var(--neon-green)' }}>${row.day.toFixed(4)}</div>
                </div>
              ))}
              <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', background: 'var(--bg-panel)', borderTop: '1px solid var(--border)' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>Total per shipment / day · Full PoC demo</div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '16px', color: 'var(--neon-green)' }}>${stats.costPerShipDay.toFixed(4)} / ship</div>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '12px', color: 'var(--neon-green)', marginTop: '2px' }}>{'< $0.05'} total for demo</div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Business case ── */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '24px' }}>
            <SH>Business Case Metrics</SH>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
              {[
                { label: 'Delays from blind spots',        value: '34%',                                   color: 'var(--neon-red)',   sub: 'eliminated with real-time tracking' },
                { label: '"Where is my order?" calls',     value: '60%',                                   color: 'var(--neon-amber)', sub: 'of support volume — reduced by self-serve tracking' },
                { label: 'Monthly parcel loss baseline',   value: '€18,000',                               color: 'var(--neon-amber)', sub: 'avg. without visibility system' },
                { label: 'Monthly saving with ShipTrack',  value: `€${stats.monthlySaving.toLocaleString()}`, color: 'var(--neon-green)', sub: '65% of baseline losses eliminated' },
                { label: 'Full PoC AWS cost',              value: '< $0.05',                               color: 'var(--neon-green)', sub: '10 shipments, 2-hour demo' },
                { label: 'Production cost / month',        value: `~€${MONTHLY_AWS_COST_EUR}`,             color: 'var(--neon-green)', sub: 'at production fleet scale' },
                { label: 'Return on Investment',           value: `${Math.round(stats.monthlySaving / MONTHLY_AWS_COST_EUR)}×`,  color: 'var(--neon-cyan)',  sub: 'monthly saving ÷ monthly system cost' },
                { label: 'Pipeline latency target',        value: '< 5 s',                                 color: 'var(--neon-cyan)',  sub: 'achieved with 2 s poll + ~2 s pipeline' },
              ].map(r => (
                <div key={r.label} style={{ padding: '16px 18px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '4px' }}>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '22px', color: r.color, lineHeight: 1, marginBottom: '8px', textShadow: `0 0 12px ${r.color}40` }}>{r.value}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '11px', color: 'var(--text-primary)', marginBottom: '4px' }}>{r.label}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4 }}>{r.sub}</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
