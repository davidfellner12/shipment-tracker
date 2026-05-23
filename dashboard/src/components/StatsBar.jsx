// src/components/StatsBar.jsx
import React from 'react';

const s = {
  bar: {
    display: 'flex',
    gap: '1px',
    background: 'var(--border)',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  tile: (accent) => ({
    flex: 1,
    padding: '12px 20px',
    background: 'var(--bg-surface)',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    borderLeft: `2px solid ${accent}`,
  }),
  label: {
    fontFamily: 'var(--font-display)',
    fontSize: '9px',
    letterSpacing: '0.2em',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
  },
  value: (color) => ({
    fontFamily: 'var(--text-mono)',
    fontSize: '26px',
    lineHeight: 1,
    color,
    textShadow: `0 0 12px ${color}80`,
  }),
  subtext: {
    fontFamily: 'var(--font-display)',
    fontSize: '11px',
    color: 'var(--text-muted)',
    letterSpacing: '0.05em',
  },
};

export default function StatsBar({ shipments }) {
  const total       = shipments.length;
  const inTransit   = shipments.filter(s => s.status === 'IN_TRANSIT' || s.status === 'ARRIVING_SOON').length;
  const delayed     = shipments.filter(s => s.status === 'DELAYED').length;
  const delivered   = shipments.filter(s => s.status === 'DELIVERED').length;
  const avgSpeed    = total
    ? Math.round(shipments.reduce((acc, s) => acc + parseFloat(s.speedKmh || 0), 0) / total)
    : 0;
  const avgEta      = inTransit + delayed > 0
    ? Math.round(shipments.filter(s => s.status !== 'DELIVERED').reduce((acc, s) => acc + (s.etaMinutes || 0), 0) / (inTransit + delayed))
    : 0;

  const tiles = [
    { label: 'Total Shipments',  value: total,           sub: 'active routes',    color: 'var(--neon-cyan)',  accent: 'var(--neon-cyan)' },
    { label: 'In Transit',       value: inTransit,       sub: 'on schedule',      color: 'var(--neon-cyan)',  accent: 'var(--border-bright)' },
    { label: 'Delayed',          value: delayed,         sub: 'need attention',   color: delayed > 0 ? 'var(--neon-red)' : 'var(--text-muted)', accent: delayed > 0 ? 'var(--neon-red)' : 'var(--border)' },
    { label: 'Delivered',        value: delivered,       sub: 'completed',        color: 'var(--neon-green)', accent: 'var(--border-bright)' },
    { label: 'Avg Speed',        value: `${avgSpeed}`,   sub: 'km/h fleet avg',   color: 'var(--text-primary)', accent: 'var(--border-bright)' },
    { label: 'Avg ETA',          value: `${avgEta}m`,    sub: 'to destination',   color: 'var(--text-primary)', accent: 'var(--border-bright)' },
  ];

  return (
    <div style={s.bar}>
      {tiles.map(t => (
        <div key={t.label} style={s.tile(t.accent)}>
          <span style={s.label}>{t.label}</span>
          <span style={s.value(t.color)}>{t.value}</span>
          <span style={s.subtext}>{t.sub}</span>
        </div>
      ))}
    </div>
  );
}
