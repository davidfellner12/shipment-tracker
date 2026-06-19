// src/components/ShipmentCard.jsx
import React from 'react';

const STATUS_CONFIG = {
  IN_TRANSIT:    { label: 'In Transit',    color: 'var(--neon-cyan)',  bg: 'var(--neon-cyan-dim)'  },
  ARRIVING_SOON: { label: 'Arriving Soon', color: 'var(--neon-green)', bg: 'var(--neon-green-dim)' },
  DELAYED:       { label: 'Delayed',       color: 'var(--neon-red)',   bg: 'var(--neon-red-dim)'   },
  DELIVERED:     { label: 'Delivered',     color: 'var(--neon-green)', bg: 'var(--neon-green-dim)' },
};
const PRIORITY_DOT = {
  CRITICAL: 'var(--neon-red)',
  HIGH:     'var(--neon-amber)',
  MEDIUM:   'var(--neon-cyan)',
  LOW:      'var(--border-bright)',
};

function SmallBtn({ label, color, onClick, style }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick && onClick(); }}
      style={{
        background: 'none', border: `1px solid ${color || 'var(--border-bright)'}`,
        color: color || 'var(--text-muted)', cursor: 'pointer',
        padding: '3px 8px', fontFamily: 'var(--font-display)',
        fontSize: '8px', letterSpacing: '0.12em', textTransform: 'uppercase',
        borderRadius: '2px', transition: 'all 0.15s',
        ...style,
      }}
      onMouseEnter={e => { e.currentTarget.style.opacity = '0.8'; }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
    >{label}</button>
  );
}

export default function ShipmentCard({ shipment, selected, onClick, onViewDetails, onContact }) {
  const { shipmentId, status, routeLabel, nearestCity, cargo, speedKmh, etaMinutes, progress, priority } = shipment;
  const cfg        = STATUS_CONFIG[status] || STATUS_CONFIG['IN_TRANSIT'];
  const pct        = Math.round(parseFloat(progress) * 100);
  const etaDisplay = etaMinutes > 60 ? `${Math.floor(etaMinutes / 60)}h ${etaMinutes % 60}m` : `${etaMinutes}m`;
  const dotColor   = PRIORITY_DOT[priority] || 'var(--border-bright)';
  const isDelayed  = status === 'DELAYED';

  return (
    <div
      style={{
        background: selected ? 'var(--bg-panel-hover)' : 'var(--bg-card)',
        border: `1px solid ${selected ? cfg.color : isDelayed ? 'rgba(255,23,68,0.3)' : 'var(--border)'}`,
        borderRadius: '6px', cursor: 'pointer',
        transition: 'all 0.15s ease',
        animation: 'fade-in-up 0.3s ease',
        position: 'relative', overflow: 'hidden',
      }}
      onClick={onClick}
    >
      {/* left accent */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '3px', height: '100%', background: cfg.color, boxShadow: `0 0 8px ${cfg.color}` }} />

      <div style={{ padding: '12px 12px 10px 14px' }}>
        {/* top row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: dotColor, boxShadow: `0 0 5px ${dotColor}`, flexShrink: 0 }} title={priority} />
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '13px', color: cfg.color, letterSpacing: '0.05em' }}>{shipmentId}</span>
          </div>
          <span style={{
            background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}`,
            fontFamily: 'var(--font-display)', fontSize: '8px', letterSpacing: '0.15em',
            textTransform: 'uppercase', padding: '2px 6px', borderRadius: '2px',
          }}>{cfg.label}</span>
        </div>

        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '12px', color: 'var(--text-primary)', marginBottom: '2px', letterSpacing: '0.03em' }}>{routeLabel}</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>📍 {nearestCity} · {cargo}</div>

        {/* progress bar */}
        <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px', marginBottom: '8px' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: cfg.color, boxShadow: `0 0 6px ${cfg.color}`, borderRadius: '2px', transition: 'width 0.6s ease' }} />
        </div>

        {/* stats row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '8px', letterSpacing: '0.15em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>ETA</div>
              <div style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', color: isDelayed ? 'var(--neon-red)' : 'var(--neon-cyan)' }}>
                {status === 'DELIVERED' ? 'Arrived' : etaDisplay}
              </div>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '8px', letterSpacing: '0.15em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Spd</div>
              <div style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', color: 'var(--text-secondary)' }}>{parseFloat(speedKmh).toFixed(0)}</div>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '8px', letterSpacing: '0.15em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Done</div>
              <div style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', color: 'var(--text-secondary)' }}>{pct}%</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '4px' }}>
            {/* Contact button — highlighted for delayed shipments */}
            {onContact && (
              <SmallBtn
                label={isDelayed ? '⚠ Contact' : 'Contact'}
                color={isDelayed ? 'var(--neon-red)' : 'var(--border-bright)'}
                onClick={() => onContact(shipment)}
              />
            )}
            <SmallBtn
              label="Details →"
              color="var(--border-bright)"
              onClick={() => onViewDetails && onViewDetails(shipmentId)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
