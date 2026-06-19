// src/pages/AnalyticsPage.jsx
import React, { useMemo } from 'react';
import NavBar from '../components/NavBar';

const COST_PER_DELAY_MIN   = 8.5;
const MONTHLY_BASELINE_LOSS = 18000;
const UNIT_COST = {
  iot:      1.00  / 100_000,
  kinesis:  0.014 / 1_000_000,
  lambda:   0.20  / 1_000_000,
  dynamodb: 1.25  / 1_000_000,
};
const KINESIS_SHARD_HOUR = 0.015;

function SH({ children }) {
  return (
    <div style={{
      fontFamily: 'var(--font-display)', fontSize: '9px', letterSpacing: '0.22em',
      color: 'var(--text-muted)', textTransform: 'uppercase',
      borderBottom: '1px solid var(--border)', paddingBottom: '8px', marginBottom: '16px',
    }}>{children}</div>
  );
}

function KPICard({ label, value, sub, color, accent }) {
  return (
    <div style={{
      padding: '20px 24px', background: 'var(--bg-card)',
      border: '1px solid var(--border)', borderTop: `3px solid ${accent || color || 'var(--neon-cyan)'}`,
      borderRadius: '4px', flex: 1, minWidth: '150px',
    }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '9px', letterSpacing: '0.2em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>{label}</div>
      <div style={{ fontFamily: 'var(--text-mono)', fontSize: '26px', color: color || 'var(--neon-cyan)', lineHeight: 1, marginBottom: '4px' }}>{value}</div>
      {sub && <div style={{ fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--text-muted)' }}>{sub}</div>}
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
      <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '2px', transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

export default function AnalyticsPage({ shipments, onNavigate, latencyMs }) {
  const stats = useMemo(() => {
    const delayed   = shipments.filter(s => s.status === 'DELAYED');
    const active    = shipments.filter(s => s.status !== 'DELIVERED');

    const totalDelayCost  = delayed.reduce((acc, s) => acc + Math.round(parseFloat(s.etaMinutes) * 0.15 * COST_PER_DELAY_MIN), 0);
    const totalCargoValue = shipments.reduce((acc, s) => acc + (s.cargoValue || 30000), 0);
    const atRiskValue     = delayed.reduce((acc, s) => acc + (s.cargoValue || 30000), 0);
    const onTimeRate      = shipments.length ? Math.round(((shipments.length - delayed.length) / shipments.length) * 100) : 100;
    const avgSpeed        = active.length ? Math.round(active.reduce((a, s) => a + parseFloat(s.speedKmh || 0), 0) / active.length) : 0;
    const monthlySaving   = Math.round(MONTHLY_BASELINE_LOSS * 0.65);

    const costPerShipDay = (
      (UNIT_COST.iot + UNIT_COST.kinesis + UNIT_COST.lambda + UNIT_COST.dynamodb) * (86400 / 3)
      + (KINESIS_SHARD_HOUR * 24 / Math.max(1, shipments.length))
    );

    return { delayed, active, totalDelayCost, totalCargoValue, atRiskValue, onTimeRate, avgSpeed, monthlySaving, costPerShipDay };
  }, [shipments]);

  const STATUS_COLOR = { IN_TRANSIT: 'var(--neon-cyan)', ARRIVING_SOON: 'var(--neon-green)', DELAYED: 'var(--neon-red)', DELIVERED: 'var(--neon-green)' };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <NavBar page="analytics" onNavigate={onNavigate} shipments={shipments} latencyMs={latencyMs} />

      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-base)' }}>
        {/* Page header */}
        <div style={{ padding: '28px 40px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={() => onNavigate('fleet')} style={{ background: 'none', border: '1px solid var(--border-bright)', color: 'var(--text-muted)', cursor: 'pointer', padding: '5px 14px', fontFamily: 'var(--font-display)', fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', borderRadius: '2px' }}>
            ← Fleet
          </button>
          <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '22px', color: 'var(--neon-cyan)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Cost & Performance Analytics</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Live fleet metrics · AWS unit economics · business impact</div>
          </div>
        </div>

        <div style={{ padding: '32px 40px', maxWidth: '1200px' }}>

          {/* KPI row */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '40px' }}>
            <KPICard label="Active Delay Cost"   value={`€${stats.totalDelayCost.toLocaleString()}`} sub="accrued this session" color={stats.totalDelayCost > 0 ? 'var(--neon-red)' : 'var(--neon-green)'} accent={stats.totalDelayCost > 0 ? 'var(--neon-red)' : 'var(--neon-green)'} />
            <KPICard label="Total Cargo Value"   value={`€${Math.round(stats.totalCargoValue / 1000)}K`} sub="across all routes" color="var(--text-primary)" />
            <KPICard label="At-Risk Cargo"        value={`€${Math.round(stats.atRiskValue / 1000)}K`} sub="on delayed routes" color={stats.atRiskValue > 0 ? 'var(--neon-amber)' : 'var(--text-muted)'} accent={stats.atRiskValue > 0 ? 'var(--neon-amber)' : 'var(--border)'} />
            <KPICard label="On-Time Rate"         value={`${stats.onTimeRate}%`} sub="of fleet on schedule" color={stats.onTimeRate >= 90 ? 'var(--neon-green)' : stats.onTimeRate >= 70 ? 'var(--neon-amber)' : 'var(--neon-red)'} />
            <KPICard label="Avg Fleet Speed"      value={`${stats.avgSpeed} km/h`} sub="across active routes" color="var(--neon-cyan)" />
            <KPICard label="Est. Monthly Saving"  value={`€${Math.round(stats.monthlySaving / 1000)}K`} sub="vs manual tracking" color="var(--neon-green)" accent="var(--neon-green)" />
          </div>

          {/* Main grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginBottom: '40px' }}>

            {/* Delay cost per shipment */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '4px', padding: '24px' }}>
              <SH>Delay Cost Exposure per Shipment</SH>
              {shipments.map(s => {
                const cost = s.isDelayed ? Math.round(parseFloat(s.etaMinutes) * 0.15 * COST_PER_DELAY_MIN) : 0;
                return (
                  <BarRow
                    key={s.shipmentId}
                    label={`${s.shipmentId} · ${s.cargo}`}
                    value={cost} max={5000}
                    color={s.isDelayed ? 'var(--neon-red)' : 'var(--border-bright)'}
                    right={s.isDelayed ? `€${cost.toLocaleString()}` : 'On time'}
                  />
                );
              })}
            </div>

            {/* Fleet speed */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '4px', padding: '24px' }}>
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

          {/* Fleet status table */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '4px', padding: '24px', marginBottom: '32px' }}>
            <SH>Full Fleet Status</SH>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
              {shipments.map(s => {
                const pct = Math.round(parseFloat(s.progress) * 100);
                const sc  = STATUS_COLOR[s.status] || 'var(--neon-cyan)';
                const eta = s.etaMinutes > 60 ? `${Math.floor(s.etaMinutes/60)}h ${s.etaMinutes%60}m` : `${s.etaMinutes}m`;
                return (
                  <div key={s.shipmentId} style={{
                    padding: '14px 16px', background: 'var(--bg-card)',
                    border: '1px solid var(--border)', borderLeft: `3px solid ${sc}`,
                    borderRadius: '3px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontFamily: 'var(--text-mono)', fontSize: '13px', color: sc }}>{s.shipmentId}</span>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '9px', letterSpacing: '0.12em', color: sc, textTransform: 'uppercase' }}>{s.status.replace('_',' ')}</span>
                    </div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px' }}>{s.routeLabel}</div>
                    <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px', marginBottom: '8px' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: sc, borderRadius: '2px' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>{pct}% · {parseFloat(s.speedKmh).toFixed(0)} km/h</span>
                      <span style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', color: s.isDelayed ? 'var(--neon-red)' : 'var(--text-muted)' }}>
                        {s.status === 'DELIVERED' ? 'Arrived' : `ETA ${eta}`}
                      </span>
                    </div>
                    {s.isDelayed && s.delayReason && (
                      <div style={{ marginTop: '8px', fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--neon-red)', padding: '5px 8px', background: 'var(--neon-red-dim)', borderRadius: '2px' }}>
                        ⚠ {s.delayReason}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* AWS unit economics */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '4px', padding: '24px', marginBottom: '32px' }}>
            <SH>AWS Unit Economics — Cost per Shipment Tracked</SH>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              1 GPS event every 3 s · eu-central-1 list prices · free tier excluded
            </p>
            <div style={{ borderRadius: '3px', overflow: 'hidden', border: '1px solid var(--border)' }}>
              {/* Header */}
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
                <div key={row.svc} style={{
                  display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr',
                  padding: '11px 16px', gap: '8px',
                  background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                  borderTop: '1px solid var(--border)',
                }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '12px', color: 'var(--neon-cyan)' }}>{row.svc}</div>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', color: 'var(--text-secondary)' }}>{row.rate}</div>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>${row.evt.toExponential(2)}</div>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '12px', color: 'var(--neon-green)' }}>${row.day.toFixed(4)}</div>
                </div>
              ))}
              <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', background: 'var(--bg-panel)', borderTop: '1px solid var(--border)' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>Total per shipment / day · Full PoC (2 h demo)</div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '14px', color: 'var(--neon-green)' }}>${stats.costPerShipDay.toFixed(4)} / ship</div>
                  <div style={{ fontFamily: 'var(--text-mono)', fontSize: '12px', color: 'var(--neon-green)' }}>{'< $0.05'} total</div>
                </div>
              </div>
            </div>
          </div>

          {/* Business case */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '4px', padding: '24px' }}>
            <SH>Business Case — From the 1-Pager</SH>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {[
                { label: 'Avg delay from blind spots',       value: '34%',    color: 'var(--neon-red)' },
                { label: 'Monthly cost of lost parcels',     value: '€18K',   color: 'var(--neon-amber)' },
                { label: '"Where is my order?" calls',       value: '60%',    color: 'var(--neon-amber)' },
                { label: 'Target end-to-end latency',        value: '< 5 s',  color: 'var(--neon-cyan)' },
                { label: 'Full PoC AWS cost',                value: '< $0.05', color: 'var(--neon-green)' },
                { label: 'Estimated monthly saving',         value: `€${Math.round(stats.monthlySaving/1000)}K`, color: 'var(--neon-green)' },
                { label: 'Dashboard poll interval',          value: '2 s',    color: 'var(--neon-cyan)' },
                { label: 'Simulated shipment routes',        value: '10',     color: 'var(--neon-cyan)' },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '3px' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '12px', color: 'var(--text-secondary)' }}>{row.label}</span>
                  <span style={{ fontFamily: 'var(--text-mono)', fontSize: '16px', color: row.color }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
