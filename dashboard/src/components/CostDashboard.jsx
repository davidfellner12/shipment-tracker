// src/components/CostDashboard.jsx
import React, { useMemo } from 'react';

const COST_PER_DELAY_MIN = 8.5;
const BASE_CARGO_VALUES = {
  'Electronics':       42000,
  'Auto Parts':        28000,
  'Medical Supplies':  61000,
  'Pharmaceuticals':   55000,
};
const MONTHLY_BASELINE_LOSS = 18000; // from 1-pager

function MetricTile({ label, value, sub, color, accent }) {
  return (
    <div style={{
      flex: 1,
      minWidth: '120px',
      padding: '14px 16px',
      background: 'var(--bg-card)',
      border: `1px solid var(--border)`,
      borderTop: `2px solid ${accent || 'var(--neon-cyan)'}`,
      borderRadius: '2px',
    }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '9px', letterSpacing: '0.2em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>{label}</div>
      <div style={{ fontFamily: 'var(--text-mono)', fontSize: '22px', color: color || 'var(--neon-cyan)', lineHeight: 1, marginBottom: '4px' }}>{value}</div>
      {sub && <div style={{ fontFamily: 'var(--font-display)', fontSize: '10px', color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  );
}

function BarRow({ label, value, max, color, right }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>{label}</span>
        <span style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', color }}>{right}</span>
      </div>
      <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '2px', transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

function SectionHead({ title }) {
  return (
    <div style={{
      fontFamily: 'var(--font-display)', fontSize: '9px', letterSpacing: '0.22em',
      color: 'var(--text-muted)', textTransform: 'uppercase',
      borderBottom: '1px solid var(--border)', paddingBottom: '6px', marginBottom: '14px',
    }}>{title}</div>
  );
}

export default function CostDashboard({ shipments, onClose }) {
  const stats = useMemo(() => {
    const delayed   = shipments.filter(s => s.status === 'DELAYED');
    const active    = shipments.filter(s => s.status !== 'DELIVERED');
    const delivered = shipments.filter(s => s.status === 'DELIVERED');

    const totalDelayCost = delayed.reduce((acc, s) => {
      return acc + Math.round(parseFloat(s.etaMinutes) * 0.15 * COST_PER_DELAY_MIN);
    }, 0);

    const totalCargoValue = shipments.reduce((acc, s) => {
      return acc + (BASE_CARGO_VALUES[s.cargo] || 30000);
    }, 0);

    const atRiskValue = delayed.reduce((acc, s) => {
      return acc + (BASE_CARGO_VALUES[s.cargo] || 30000);
    }, 0);

    const avgSpeed = active.length
      ? Math.round(active.reduce((a, s) => a + parseFloat(s.speedKmh || 0), 0) / active.length)
      : 0;

    const avgEta = active.length
      ? Math.round(active.reduce((a, s) => a + (s.etaMinutes || 0), 0) / active.length)
      : 0;

    const onTimeRate = shipments.length
      ? Math.round(((shipments.length - delayed.length) / shipments.length) * 100)
      : 100;

    // Savings vs baseline (without this system)
    const monthlySavingsEst = Math.round(MONTHLY_BASELINE_LOSS * 0.65);

    return {
      delayed, active, delivered,
      totalDelayCost, totalCargoValue, atRiskValue,
      avgSpeed, avgEta, onTimeRate, monthlySavingsEst,
      delayedCount: delayed.length,
    };
  }, [shipments]);

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      background: 'rgba(9,12,16,0.92)',
      zIndex: 600,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        width: '760px',
        maxHeight: '90vh',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-bright)',
        borderTop: '2px solid var(--neon-cyan)',
        borderRadius: '4px',
        overflow: 'auto',
        animation: 'fade-in-up 0.2s ease',
      }}>
        {/* Modal header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-panel)', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '18px', color: 'var(--neon-cyan)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Cost & Performance Analytics
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.1em', marginTop: '2px' }}>
              Live fleet overview — all costs estimated from mock data
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: '1px solid var(--border-bright)',
            color: 'var(--text-muted)', cursor: 'pointer', padding: '6px 12px',
            fontFamily: 'var(--font-display)', fontSize: '11px', letterSpacing: '0.1em',
            borderRadius: '2px',
          }}>CLOSE ✕</button>
        </div>

        <div style={{ padding: '20px' }}>
          {/* KPI row */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '24px' }}>
            <MetricTile label="Active Delay Cost" value={`€${stats.totalDelayCost.toLocaleString()}`} sub="accrued this session" color={stats.totalDelayCost > 0 ? 'var(--neon-red)' : 'var(--neon-green)'} accent={stats.totalDelayCost > 0 ? 'var(--neon-red)' : 'var(--neon-green)'} />
            <MetricTile label="Total Cargo Value" value={`€${Math.round(stats.totalCargoValue / 1000)}K`} sub="in active routes" color="var(--text-primary)" accent="var(--neon-cyan)" />
            <MetricTile label="At-Risk Cargo" value={`€${Math.round(stats.atRiskValue / 1000)}K`} sub="on delayed routes" color={stats.atRiskValue > 0 ? 'var(--neon-amber)' : 'var(--text-muted)'} accent={stats.atRiskValue > 0 ? 'var(--neon-amber)' : 'var(--border)'} />
            <MetricTile label="On-Time Rate" value={`${stats.onTimeRate}%`} sub="of fleet on schedule" color={stats.onTimeRate >= 90 ? 'var(--neon-green)' : stats.onTimeRate >= 70 ? 'var(--neon-amber)' : 'var(--neon-red)'} accent="var(--neon-cyan)" />
            <MetricTile label="Est. Monthly Saving" value={`€${Math.round(stats.monthlySavingsEst / 1000)}K`} sub="vs manual tracking" color="var(--neon-green)" accent="var(--neon-green)" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {/* Left column */}
            <div>
              {/* Per-shipment cost breakdown */}
              <SectionHead title="Cost Exposure per Shipment" />
              {shipments.map(s => {
                const delayCost = s.isDelayed
                  ? Math.round(parseFloat(s.etaMinutes) * 0.15 * COST_PER_DELAY_MIN)
                  : 0;
                const cargoVal = BASE_CARGO_VALUES[s.cargo] || 30000;
                const exposure = Math.round((delayCost / cargoVal) * 100);
                return (
                  <BarRow
                    key={s.shipmentId}
                    label={`${s.shipmentId} · ${s.cargo}`}
                    value={delayCost}
                    max={5000}
                    color={s.isDelayed ? 'var(--neon-red)' : 'var(--border-bright)'}
                    right={s.isDelayed ? `€${delayCost.toLocaleString()} delay` : 'On time'}
                  />
                );
              })}

              {/* Fleet speed */}
              <div style={{ marginTop: '20px' }}>
                <SectionHead title="Fleet Speed Distribution" />
                {shipments.map(s => {
                  const spd = parseFloat(s.speedKmh);
                  return (
                    <BarRow
                      key={s.shipmentId}
                      label={s.shipmentId}
                      value={spd}
                      max={120}
                      color={spd < 45 ? 'var(--neon-red)' : spd > 75 ? 'var(--neon-green)' : 'var(--neon-cyan)'}
                      right={`${spd.toFixed(0)} km/h`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Right column */}
            <div>
              <SectionHead title="Fleet Status Summary" />
              {shipments.map(s => {
                const pct = Math.round(parseFloat(s.progress) * 100);
                const etaDisplay = s.etaMinutes > 60
                  ? `${Math.floor(s.etaMinutes / 60)}h ${s.etaMinutes % 60}m`
                  : `${s.etaMinutes}m`;
                const statusColor = s.isDelayed ? 'var(--neon-red)' : s.status === 'ARRIVING_SOON' ? 'var(--neon-green)' : 'var(--neon-cyan)';
                return (
                  <div key={s.shipmentId} style={{
                    padding: '10px 12px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderLeft: `3px solid ${statusColor}`,
                    borderRadius: '2px',
                    marginBottom: '8px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontFamily: 'var(--text-mono)', fontSize: '13px', color: statusColor }}>{s.shipmentId}</span>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '10px', color: 'var(--text-secondary)' }}>{s.routeLabel}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--text-muted)' }}>{s.cargo}</span>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '11px', color: statusColor }}>{s.status.replace('_', ' ')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                      <span style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', color: 'var(--text-muted)' }}>{pct}% complete</span>
                      <span style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', color: s.isDelayed ? 'var(--neon-red)' : 'var(--text-muted)' }}>
                        ETA {s.status === 'DELIVERED' ? 'Arrived' : etaDisplay}
                      </span>
                    </div>
                    <div style={{ height: '2px', background: 'var(--border)', borderRadius: '1px' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: statusColor, borderRadius: '1px', transition: 'width 0.6s ease' }} />
                    </div>
                  </div>
                );
              })}

              {/* Business case */}
              <div style={{ marginTop: '20px' }}>
                <SectionHead title="Business Case (from 1-Pager)" />
                <div style={{ padding: '12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '2px' }}>
                  {[
                    { label: 'Avg delay from blind spots',     value: '34%',  color: 'var(--neon-red)' },
                    { label: 'Monthly cost of lost parcels',   value: '€18K', color: 'var(--neon-amber)' },
                    { label: 'Calls that are "where is order"', value: '60%', color: 'var(--neon-amber)' },
                    { label: 'Full PoC AWS cost',              value: '<$5',  color: 'var(--neon-green)' },
                    { label: 'Pipeline latency target',        value: '<5s',  color: 'var(--neon-cyan)' },
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--text-secondary)' }}>{row.label}</span>
                      <span style={{ fontFamily: 'var(--text-mono)', fontSize: '12px', color: row.color }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
