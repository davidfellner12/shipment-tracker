// src/components/CostDashboard.jsx
import React, { useMemo } from 'react';

const COST_PER_DELAY_MIN  = 8.5;
const MONTHLY_BASELINE_LOSS = 18000;

// Unit cost per GPS event (AWS list prices, eu-central-1, free tier excluded)
// One GPS event per 3 s per truck = ~28 800 events/truck/day
const UNIT_COST_PER_EVENT = {
  iot:      1.00  / 100_000,   // $1.00 per 100K messages
  kinesis:  0.014 / 1_000_000, // $0.014 per 1M records
  lambda:   0.20  / 1_000_000, // $0.20 per 1M invocations
  dynamodb: 1.25  / 1_000_000, // $1.25 per 1M WRU
};
// Kinesis shard-hour cost is per-shard not per-event ($0.015/shard/h)
const KINESIS_SHARD_HOUR = 0.015;

function MetricTile({ label, value, sub, color, accent }) {
  return (
    <div style={{
      flex: 1, minWidth: '120px', padding: '14px 16px',
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

    const totalDelayCost = delayed.reduce((acc, s) => (
      acc + Math.round(parseFloat(s.etaMinutes) * 0.15 * COST_PER_DELAY_MIN)
    ), 0);

    const totalCargoValue = shipments.reduce((acc, s) => acc + (s.cargoValue || 30000), 0);
    const atRiskValue     = delayed.reduce((acc, s) => acc + (s.cargoValue || 30000), 0);

    const avgSpeed = active.length
      ? Math.round(active.reduce((a, s) => a + parseFloat(s.speedKmh || 0), 0) / active.length)
      : 0;

    const onTimeRate = shipments.length
      ? Math.round(((shipments.length - delayed.length) / shipments.length) * 100)
      : 100;

    const monthlySavingsEst = Math.round(MONTHLY_BASELINE_LOSS * 0.65);

    // AWS unit economics for the current session
    // Assuming ~2 min of demo time, 10 shipments, 1 event/3s
    const sessionMinutes = 2;
    const eventsPerShipPerMin = 20; // 1 per 3s ≈ 20/min
    const totalEvents = shipments.length * sessionMinutes * eventsPerShipPerMin;
    const kinesisHours = sessionMinutes / 60;
    const awsCosts = {
      iot:      totalEvents * UNIT_COST_PER_EVENT.iot,
      kinesis:  totalEvents * UNIT_COST_PER_EVENT.kinesis + kinesisHours * KINESIS_SHARD_HOUR,
      lambda:   totalEvents * UNIT_COST_PER_EVENT.lambda,
      dynamodb: totalEvents * UNIT_COST_PER_EVENT.dynamodb,
      apiGw:    (sessionMinutes * 60 / 2) * (3.50 / 1_000_000), // poll every 2s
    };
    const awsTotal = Object.values(awsCosts).reduce((a, b) => a + b, 0);
    const costPerShipPerDay = (
      (UNIT_COST_PER_EVENT.iot + UNIT_COST_PER_EVENT.kinesis + UNIT_COST_PER_EVENT.lambda + UNIT_COST_PER_EVENT.dynamodb)
      * (86400 / 3)
    ) + (KINESIS_SHARD_HOUR * 24 / shipments.length);

    return {
      delayed, active, delivered,
      totalDelayCost, totalCargoValue, atRiskValue,
      avgSpeed, onTimeRate, monthlySavingsEst,
      delayedCount: delayed.length,
      awsCosts, awsTotal: awsTotal.toFixed(4), costPerShipPerDay: costPerShipPerDay.toFixed(4),
    };
  }, [shipments]);

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'rgba(9,12,16,0.92)', zIndex: 600,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        width: '820px', maxHeight: '92vh',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-bright)',
        borderTop: '2px solid var(--neon-cyan)',
        borderRadius: '4px', overflow: 'auto',
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
              Live fleet overview · AWS unit economics · business impact
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: '1px solid var(--border-bright)',
            color: 'var(--text-muted)', cursor: 'pointer', padding: '6px 12px',
            fontFamily: 'var(--font-display)', fontSize: '11px', letterSpacing: '0.1em', borderRadius: '2px',
          }}>CLOSE ✕</button>
        </div>

        <div style={{ padding: '20px' }}>
          {/* KPI row */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '24px' }}>
            <MetricTile label="Active Delay Cost"  value={`€${stats.totalDelayCost.toLocaleString()}`} sub="accrued this session" color={stats.totalDelayCost > 0 ? 'var(--neon-red)' : 'var(--neon-green)'} accent={stats.totalDelayCost > 0 ? 'var(--neon-red)' : 'var(--neon-green)'} />
            <MetricTile label="Total Cargo Value"  value={`€${Math.round(stats.totalCargoValue / 1000)}K`} sub="in active routes" color="var(--text-primary)" accent="var(--neon-cyan)" />
            <MetricTile label="At-Risk Cargo"      value={`€${Math.round(stats.atRiskValue / 1000)}K`} sub="on delayed routes" color={stats.atRiskValue > 0 ? 'var(--neon-amber)' : 'var(--text-muted)'} accent={stats.atRiskValue > 0 ? 'var(--neon-amber)' : 'var(--border)'} />
            <MetricTile label="On-Time Rate"       value={`${stats.onTimeRate}%`} sub="of fleet on schedule" color={stats.onTimeRate >= 90 ? 'var(--neon-green)' : stats.onTimeRate >= 70 ? 'var(--neon-amber)' : 'var(--neon-red)'} accent="var(--neon-cyan)" />
            <MetricTile label="Est. Monthly Saving" value={`€${Math.round(stats.monthlySavingsEst / 1000)}K`} sub="vs manual tracking" color="var(--neon-green)" accent="var(--neon-green)" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            {/* Left: per-shipment delay cost */}
            <div>
              <SectionHead title="Cost Exposure per Shipment" />
              {shipments.map(s => {
                const delayCost = s.isDelayed
                  ? Math.round(parseFloat(s.etaMinutes) * 0.15 * COST_PER_DELAY_MIN) : 0;
                return (
                  <BarRow
                    key={s.shipmentId}
                    label={`${s.shipmentId} · ${s.cargo}`}
                    value={delayCost} max={5000}
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
                      key={s.shipmentId} label={s.shipmentId}
                      value={spd} max={120}
                      color={spd < 45 ? 'var(--neon-red)' : spd > 75 ? 'var(--neon-green)' : 'var(--neon-cyan)'}
                      right={`${spd.toFixed(0)} km/h`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Right: fleet status */}
            <div>
              <SectionHead title="Fleet Status Summary" />
              {shipments.map(s => {
                const pct = Math.round(parseFloat(s.progress) * 100);
                const etaDisplay = s.etaMinutes > 60
                  ? `${Math.floor(s.etaMinutes / 60)}h ${s.etaMinutes % 60}m`
                  : `${s.etaMinutes}m`;
                const sc = s.isDelayed ? 'var(--neon-red)' : s.status === 'ARRIVING_SOON' ? 'var(--neon-green)' : 'var(--neon-cyan)';
                return (
                  <div key={s.shipmentId} style={{
                    padding: '8px 12px', background: 'var(--bg-card)',
                    border: '1px solid var(--border)', borderLeft: `3px solid ${sc}`,
                    borderRadius: '2px', marginBottom: '6px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontFamily: 'var(--text-mono)', fontSize: '12px', color: sc }}>{s.shipmentId}</span>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '10px', color: 'var(--text-secondary)' }}>{s.routeLabel}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                      <span style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', color: 'var(--text-muted)' }}>{pct}% · {s.cargo}</span>
                      <span style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', color: s.isDelayed ? 'var(--neon-red)' : 'var(--text-muted)' }}>
                        {s.status === 'DELIVERED' ? 'Arrived' : `ETA ${etaDisplay}`}
                      </span>
                    </div>
                    <div style={{ height: '2px', background: 'var(--border)', borderRadius: '1px' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: sc, borderRadius: '1px', transition: 'width 0.6s ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* AWS Unit Economics */}
          <SectionHead title="AWS Unit Economics — Cost per Shipment Tracked" />
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' }}>
            1 GPS event every 3 s · eu-central-1 list prices · free tier excluded
          </div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '2px', overflow: 'hidden', marginBottom: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', padding: '8px 12px', gap: '8px' }}>
              {['Service', 'Rate', 'Per Event ($)', 'Per Ship/Day ($)'].map(h => (
                <div key={h} style={{ fontFamily: 'var(--font-display)', fontSize: '9px', letterSpacing: '0.15em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{h}</div>
              ))}
            </div>
            {[
              { service: 'AWS IoT Core',    rate: '$1.00 / 100K msg',  perEvt: UNIT_COST_PER_EVENT.iot,      perDay: UNIT_COST_PER_EVENT.iot * (86400/3) },
              { service: 'Amazon Kinesis',  rate: '$0.015 / shard-h',  perEvt: UNIT_COST_PER_EVENT.kinesis,  perDay: KINESIS_SHARD_HOUR * 24 / 10 },
              { service: 'AWS Lambda',      rate: '$0.20 / 1M req',    perEvt: UNIT_COST_PER_EVENT.lambda,   perDay: UNIT_COST_PER_EVENT.lambda * (86400/3) },
              { service: 'Amazon DynamoDB', rate: '$1.25 / 1M WRU',   perEvt: UNIT_COST_PER_EVENT.dynamodb, perDay: UNIT_COST_PER_EVENT.dynamodb * (86400/3) },
            ].map((row, i) => (
              <div key={row.service} style={{
                display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr',
                padding: '9px 12px', gap: '8px',
                background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                borderBottom: '1px solid var(--border)',
              }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--neon-cyan)' }}>{row.service}</div>
                <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', color: 'var(--text-secondary)' }}>{row.rate}</div>
                <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', color: 'var(--text-muted)' }}>${row.perEvt.toExponential(2)}</div>
                <div style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', color: 'var(--neon-green)' }}>${row.perDay.toFixed(4)}</div>
              </div>
            ))}
            <div style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', background: 'var(--bg-panel)', borderTop: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '12px', color: 'var(--text-primary)' }}>
                Total per shipment/day · Full PoC (10 ships, 2 h demo)
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--text-mono)', fontSize: '13px', color: 'var(--neon-green)' }}>${stats.costPerShipPerDay} / ship</div>
                <div style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', color: 'var(--neon-green)', marginTop: '2px' }}>{'< $0.05'} total</div>
              </div>
            </div>
          </div>

          {/* Business case */}
          <SectionHead title="Business Case (from 1-Pager)" />
          <div style={{ padding: '12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '2px' }}>
            {[
              { label: 'Avg delay from blind spots',      value: '34%',   color: 'var(--neon-red)' },
              { label: 'Monthly cost of lost parcels',    value: '€18K',  color: 'var(--neon-amber)' },
              { label: 'Calls that are "where is order"', value: '60%',   color: 'var(--neon-amber)' },
              { label: 'Full PoC AWS cost',               value: '< $0.05', color: 'var(--neon-green)' },
              { label: 'Pipeline latency target',         value: '< 5 s', color: 'var(--neon-cyan)' },
              { label: 'Dashboard poll interval',         value: '2 s',   color: 'var(--neon-cyan)' },
              { label: 'Est. monthly saving (this system)', value: `€${Math.round(stats.monthlySavingsEst/1000)}K`, color: 'var(--neon-green)' },
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
  );
}
