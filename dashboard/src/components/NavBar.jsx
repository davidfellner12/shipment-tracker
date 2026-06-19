// src/components/NavBar.jsx
import React from 'react';
import { isMockMode } from '../lib/api';

const NAV_LINKS = [
  { page: 'fleet',        label: 'Fleet' },
  { page: 'analytics',    label: 'Analytics' },
  { page: 'architecture', label: 'Architecture' },
];

export default function NavBar({ page, onNavigate, shipments = [], latencyMs }) {
  const delayed   = shipments.filter(s => s.status === 'DELAYED').length;
  const active    = shipments.filter(s => s.status !== 'DELIVERED').length;
  const mock      = isMockMode();

  return (
    <nav style={{
      display: 'flex', alignItems: 'center',
      height: '52px', padding: '0 24px',
      background: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0, zIndex: 50, gap: '0',
    }}>
      {/* Logo */}
      <button
        onClick={() => onNavigate('landing')}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '20px',
          letterSpacing: '0.12em', color: 'var(--neon-cyan)', textTransform: 'uppercase',
          textShadow: '0 0 20px var(--neon-cyan-dim)',
          animation: 'neon-flicker 8s infinite',
          marginRight: '24px',
        }}
      >ShipTrack</button>

      <div style={{ width: '1px', height: '20px', background: 'var(--border)', marginRight: '24px' }} />

      {/* Nav links */}
      <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
        {NAV_LINKS.map(link => {
          const active = page === link.page;
          return (
            <button
              key={link.page}
              onClick={() => onNavigate(link.page)}
              style={{
                background: active ? 'var(--bg-card)' : 'none',
                border: 'none',
                borderBottom: active ? '2px solid var(--neon-cyan)' : '2px solid transparent',
                color: active ? 'var(--neon-cyan)' : 'var(--text-muted)',
                fontFamily: 'var(--font-display)', fontSize: '11px', letterSpacing: '0.15em',
                textTransform: 'uppercase', padding: '0 14px', height: '52px',
                cursor: 'pointer', transition: 'color 0.15s',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text-secondary)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--text-muted)'; }}
            >{link.label}</button>
          );
        })}
      </div>

      {/* Right: status chips */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        {mock && (
          <span style={{
            padding: '2px 8px', border: '1px solid var(--neon-amber)',
            color: 'var(--neon-amber)', fontFamily: 'var(--font-display)',
            fontSize: '9px', letterSpacing: '0.2em', textTransform: 'uppercase', borderRadius: '2px',
          }}>Mock Data</span>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '9px', color: 'var(--text-muted)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Active</span>
          <span style={{ fontFamily: 'var(--text-mono)', fontSize: '13px', color: 'var(--neon-cyan)' }}>{active}</span>
        </div>
        {delayed > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '9px', color: 'var(--text-muted)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Delayed</span>
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '13px', color: 'var(--neon-red)' }}>{delayed}</span>
          </div>
        )}
        {latencyMs != null && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '9px', color: 'var(--text-muted)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Latency</span>
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '13px', color: 'var(--neon-cyan)' }}>{latencyMs}ms</span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontFamily: 'var(--font-display)', fontSize: '11px', letterSpacing: '0.2em', color: 'var(--neon-green)', textTransform: 'uppercase' }}>
          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--neon-green)', boxShadow: '0 0 8px var(--neon-green)', animation: 'blink 1.4s ease-in-out infinite' }} />
          Live
        </div>
      </div>
    </nav>
  );
}
