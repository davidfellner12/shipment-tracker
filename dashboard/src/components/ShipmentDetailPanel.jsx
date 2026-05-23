// src/components/ShipmentDetailPanel.jsx
import React from 'react';

const STATUS_COLOR = {
  IN_TRANSIT:    'var(--neon-cyan)',
  ARRIVING_SOON: 'var(--neon-green)',
  DELAYED:       'var(--neon-red)',
  DELIVERED:     'var(--neon-green)',
};

const COST_PER_DELAY_MIN = 8.5; // €8.5 per minute delay (mock)
const BASE_CARGO_VALUES = {
  'Electronics':       42000,
  'Auto Parts':        28000,
  'Medical Supplies':  61000,
  'Pharmaceuticals':   55000,
};

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: '9px',
        letterSpacing: '0.22em',
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        marginBottom: '10px',
        paddingBottom: '6px',
        borderBottom: '1px solid var(--border)',
      }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value, color, mono }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0' }}>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: '12px', color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>{label}</span>
      <span style={{
        fontFamily: mono ? 'var(--text-mono)' : 'var(--font-display)',
        fontWeight: mono ? 'normal' : 600,
        fontSize: '12px',
        color: color || 'var(--text-primary)',
      }}>{value}</span>
    </div>
  );
}

function MiniProgressBar({ value, max, color }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px', marginTop: '4px' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '2px', transition: 'width 0.6s ease' }} />
    </div>
  );
}

function TimelineStep({ label, done, active, city }) {
  const color = active ? 'var(--neon-cyan)' : done ? 'var(--neon-green)' : 'var(--border-bright)';
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <div style={{
          width: '10px', height: '10px', borderRadius: '50%',
          background: color,
          boxShadow: active ? `0 0 8px ${color}` : 'none',
          border: done || active ? 'none' : `1px solid ${color}`,
          marginTop: '2px',
        }} />
        {label !== 'Destination' && (
          <div style={{ width: '1px', height: '18px', background: done ? 'var(--neon-green)' : 'var(--border)', marginTop: '2px' }} />
        )}
      </div>
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '12px', fontWeight: 600, color: active ? 'var(--neon-cyan)' : done ? 'var(--text-primary)' : 'var(--text-muted)', letterSpacing: '0.05em' }}>{label}</div>
        {city && <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', color: 'var(--text-muted)', marginTop: '1px' }}>{city}</div>}
      </div>
    </div>
  );
}

export default function ShipmentDetailPanel({ shipment, onClose }) {
  if (!shipment) return null;

  const {
    shipmentId, status, routeLabel, nearestCity, cargo,
    speedKmh, etaMinutes, progress, latitude, longitude,
    isDelayed, timestamp,
  } = shipment;

  const pct      = Math.round(parseFloat(progress) * 100);
  const statusColor = STATUS_COLOR[status] || 'var(--neon-cyan)';
  const cargoValue  = BASE_CARGO_VALUES[cargo] || 30000;
  const delayCost   = isDelayed ? Math.round(parseFloat(etaMinutes) * 0.15 * COST_PER_DELAY_MIN) : 0;
  const riskScore   = isDelayed ? 'HIGH' : pct > 85 ? 'LOW' : status === 'ARRIVING_SOON' ? 'LOW' : 'MEDIUM';
  const riskColor   = riskScore === 'HIGH' ? 'var(--neon-red)' : riskScore === 'LOW' ? 'var(--neon-green)' : 'var(--neon-amber)';
  const speed       = parseFloat(speedKmh);
  const etaDisplay  = etaMinutes > 60 ? `${Math.floor(etaMinutes / 60)}h ${etaMinutes % 60}m` : `${etaMinutes}m`;

  // Route cities for timeline
  const ROUTE_WAYPOINTS = {
    'SHIP-001': ['Vienna', 'Linz', 'Frankfurt', 'Hamburg'],
    'SHIP-002': ['Vienna', 'Salzburg', 'Munich'],
    'SHIP-003': ['Vienna', 'Brno', 'Kraków', 'Warsaw'],
    'SHIP-004': ['Vienna', 'Salzburg', 'Innsbruck', 'Zürich'],
  };
  const waypoints = ROUTE_WAYPOINTS[shipmentId] || ['Origin', 'Destination'];
  const cityProgress = Math.floor((pct / 100) * (waypoints.length - 1));

  const lastUpdate = new Date(timestamp);
  const timeAgo = Math.round((Date.now() - lastUpdate.getTime()) / 1000);

  return (
    <div style={{
      position: 'absolute',
      top: 0, right: 0,
      width: '300px',
      height: '100%',
      background: 'var(--bg-surface)',
      borderLeft: `1px solid ${statusColor}`,
      zIndex: 500,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      animation: 'fade-in-up 0.2s ease',
      boxShadow: `-8px 0 30px rgba(0,0,0,0.5)`,
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        background: 'var(--bg-panel)',
      }}>
        <div>
          <div style={{ fontFamily: 'var(--text-mono)', fontSize: '16px', color: statusColor, letterSpacing: '0.08em' }}>{shipmentId}</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--text-secondary)', letterSpacing: '0.08em', marginTop: '2px' }}>{routeLabel}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            fontFamily: 'var(--font-display)', fontSize: '9px', letterSpacing: '0.15em',
            padding: '3px 8px', border: `1px solid ${statusColor}`, color: statusColor,
            textTransform: 'uppercase', borderRadius: '2px',
          }}>{status.replace('_', ' ')}</span>
          <button onClick={onClose} style={{
            background: 'none', border: '1px solid var(--border-bright)',
            color: 'var(--text-muted)', cursor: 'pointer', width: '24px', height: '24px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: '2px', fontSize: '14px', lineHeight: 1,
          }}>✕</button>
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>

        {/* Progress */}
        <Section title="Route Progress">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '28px', color: statusColor, lineHeight: 1 }}>{pct}%</span>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '9px', color: 'var(--text-muted)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>ETA</div>
              <div style={{ fontFamily: 'var(--text-mono)', fontSize: '18px', color: isDelayed ? 'var(--neon-red)' : 'var(--text-primary)' }}>
                {status === 'DELIVERED' ? 'Arrived' : etaDisplay}
              </div>
            </div>
          </div>
          <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px', marginBottom: '14px' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: statusColor, boxShadow: `0 0 8px ${statusColor}`, borderRadius: '2px', transition: 'width 0.6s ease' }} />
          </div>
          {waypoints.map((city, i) => (
            <TimelineStep
              key={city}
              label={i === 0 ? 'Origin' : i === waypoints.length - 1 ? 'Destination' : `Stop ${i}`}
              city={city}
              done={i < cityProgress}
              active={i === cityProgress}
            />
          ))}
        </Section>

        {/* Live telemetry */}
        <Section title="Live Telemetry">
          <Row label="Current Speed" value={`${speed.toFixed(0)} km/h`} color="var(--neon-cyan)" mono />
          <Row label="Nearest City" value={nearestCity} mono />
          <Row label="Coordinates" value={`${parseFloat(latitude).toFixed(3)}, ${parseFloat(longitude).toFixed(3)}`} color="var(--text-muted)" mono />
          <Row label="Last Update" value={`${timeAgo}s ago`} color="var(--text-secondary)" mono />
          <div style={{ marginTop: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--text-secondary)' }}>Speed vs avg (75 km/h)</span>
              <span style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', color: speed < 50 ? 'var(--neon-red)' : 'var(--neon-cyan)' }}>{speed.toFixed(0)}/75</span>
            </div>
            <MiniProgressBar value={speed} max={120} color={speed < 50 ? 'var(--neon-red)' : 'var(--neon-cyan)'} />
          </div>
        </Section>

        {/* Cargo & Financials */}
        <Section title="Cargo & Financials">
          <Row label="Cargo Type" value={cargo} />
          <Row label="Cargo Value" value={`€${cargoValue.toLocaleString()}`} color="var(--text-primary)" mono />
          {isDelayed && (
            <>
              <Row label="Delay Cost (est.)" value={`€${delayCost.toLocaleString()}`} color="var(--neon-red)" mono />
              <Row label="Delay Rate" value={`€${COST_PER_DELAY_MIN}/min`} color="var(--neon-amber)" mono />
            </>
          )}
          <Row label="Risk Level" value={riskScore} color={riskColor} />
          {isDelayed && (
            <div style={{
              marginTop: '10px', padding: '8px 10px',
              background: 'var(--neon-red-dim)',
              border: '1px solid var(--neon-red)',
              borderRadius: '2px',
              fontFamily: 'var(--font-display)', fontSize: '11px',
              color: 'var(--neon-red)', letterSpacing: '0.05em', lineHeight: 1.4,
            }}>
              ⚠ Shipment delayed — accruing €{COST_PER_DELAY_MIN}/min. Contact logistics coordinator.
            </div>
          )}
        </Section>

        {/* AWS Architecture note */}
        <Section title="Data Pipeline">
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.6, letterSpacing: '0.03em' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--neon-cyan)', flexShrink: 0 }} />
              IoT Core → Kinesis → Lambda
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--neon-green)', flexShrink: 0 }} />
              DynamoDB write latency &lt;5s
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--neon-amber)', flexShrink: 0 }} />
              API GW polling every 4s
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
