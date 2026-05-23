// src/components/Header.jsx
import React from 'react';
import { isMockMode } from '../lib/api';

const styles = {
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    height: '52px',
    background: 'var(--bg-surface)',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
    position: 'relative',
    zIndex: 10,
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  logo: {
    fontFamily: 'var(--font-display)',
    fontWeight: 900,
    fontSize: '22px',
    letterSpacing: '0.12em',
    color: 'var(--neon-cyan)',
    textTransform: 'uppercase',
    animation: 'neon-flicker 8s infinite',
    textShadow: '0 0 20px var(--neon-cyan-dim)',
  },
  divider: {
    width: '1px',
    height: '20px',
    background: 'var(--border-bright)',
  },
  subtitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 300,
    fontSize: '13px',
    letterSpacing: '0.2em',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  statLabel: {
    fontFamily: 'var(--font-display)',
    fontSize: '9px',
    letterSpacing: '0.2em',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
  },
  statValue: {
    fontFamily: 'var(--text-mono)',
    fontSize: '13px',
    color: 'var(--neon-cyan)',
  },
  liveIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    fontFamily: 'var(--font-display)',
    fontSize: '11px',
    letterSpacing: '0.2em',
    color: 'var(--neon-green)',
    textTransform: 'uppercase',
  },
  liveDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: 'var(--neon-green)',
    boxShadow: '0 0 8px var(--neon-green)',
    animation: 'blink 1.4s ease-in-out infinite',
  },
  mockBadge: {
    padding: '2px 8px',
    border: '1px solid var(--neon-amber)',
    color: 'var(--neon-amber)',
    fontFamily: 'var(--font-display)',
    fontSize: '9px',
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
    borderRadius: 'var(--radius-sm)',
  },
};

export default function Header({ shipments, lastUpdated, latencyMs }) {
  const inTransit  = shipments.filter(s => s.status === 'IN_TRANSIT' || s.status === 'ARRIVING_SOON').length;
  const delayed    = shipments.filter(s => s.status === 'DELAYED').length;
  const timeStr    = lastUpdated
    ? lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '--:--:--';

  return (
    <header style={styles.header}>
      <div style={styles.left}>
        <div style={styles.logo}>ShipTrack</div>
        <div style={styles.divider} />
        <div style={styles.subtitle}>Live Logistics Console</div>
        {isMockMode() && <div style={styles.mockBadge}>Mock Data</div>}
      </div>

      <div style={styles.right}>
        <div style={styles.stat}>
          <span style={styles.statLabel}>In Transit</span>
          <span style={styles.statValue}>{inTransit.toString().padStart(2, '0')}</span>
        </div>
        <div style={styles.stat}>
          <span style={styles.statLabel}>Delayed</span>
          <span style={{ ...styles.statValue, color: delayed > 0 ? 'var(--neon-red)' : 'var(--text-muted)' }}>
            {delayed.toString().padStart(2, '0')}
          </span>
        </div>
        <div style={styles.stat}>
          <span style={styles.statLabel}>Latency</span>
          <span style={styles.statValue}>{latencyMs != null ? `${latencyMs}ms` : '---'}</span>
        </div>
        <div style={styles.stat}>
          <span style={styles.statLabel}>Updated</span>
          <span style={{ ...styles.statValue, fontSize: '12px' }}>{timeStr}</span>
        </div>
        <div style={styles.liveIndicator}>
          <div style={styles.liveDot} />
          Live
        </div>
      </div>
    </header>
  );
}
