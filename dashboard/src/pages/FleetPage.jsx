// src/pages/FleetPage.jsx
import React, { useState } from 'react';
import NavBar              from '../components/NavBar';
import StatsBar            from '../components/StatsBar';
import ShipmentCard        from '../components/ShipmentCard';
import MapView             from '../components/MapView';
import EventLog            from '../components/EventLog';
import ShipmentDetailPanel from '../components/ShipmentDetailPanel';
import ShipmentDetailPage  from '../components/ShipmentDetailPage';
import ContactOverlay      from '../components/ContactOverlay';
import { exportFleetCSV }  from '../lib/export';

export default function FleetPage({ shipments, lastUpdated, latencyMs, error, updateDelay, onNavigate }) {
  const [selectedId,    setSelectedId]    = useState(null);
  const [detailPageId,  setDetailPageId]  = useState(null);
  const [contactShip,   setContactShip]   = useState(null); // shipment for ContactOverlay
  const [logOpen,       setLogOpen]       = useState(true);

  const selectedShipment = shipments.find(s => s.shipmentId === selectedId)   || null;
  const detailShipment   = shipments.find(s => s.shipmentId === detailPageId) || null;
  const delayedShipments = shipments.filter(s => s.status === 'DELAYED');

  // Full-page shipment detail
  if (detailShipment) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <NavBar page="fleet" onNavigate={onNavigate} shipments={shipments} latencyMs={latencyMs} />
        <ShipmentDetailPage shipment={detailShipment} onBack={() => setDetailPageId(null)} />
        {contactShip && <ContactOverlay shipment={contactShip} onClose={() => setContactShip(null)} />}
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <NavBar page="fleet" onNavigate={onNavigate} shipments={shipments} latencyMs={latencyMs} />

      {error && (
        <div style={{ padding: '8px 20px', background: 'var(--neon-red-dim)', border: '1px solid var(--neon-red)', color: 'var(--neon-red)', fontFamily: 'var(--text-mono)', fontSize: '12px', flexShrink: 0 }}>
          ⚠ API Error: {error} — retrying...
        </div>
      )}

      <StatsBar shipments={shipments} />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Sidebar ── */}
        <aside style={{
          width: '300px', flexShrink: 0, display: 'flex', flexDirection: 'column',
          background: 'var(--bg-surface)', borderRight: '1px solid var(--border)', overflow: 'hidden',
        }}>
          {/* Sidebar header */}
          <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '9px', letterSpacing: '0.22em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Fleet · {shipments.length} routes
              </span>
              {lastUpdated && (
                <span style={{ fontFamily: 'var(--text-mono)', fontSize: '9px', color: 'var(--text-muted)' }}>
                  {lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
            </div>
            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => exportFleetCSV(shipments)}
                style={{ flex: 1, padding: '6px 0', background: 'none', border: '1px solid var(--border-bright)', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', borderRadius: '3px', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--neon-cyan)'; e.currentTarget.style.color = 'var(--neon-cyan)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-bright)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
              >↓ Export CSV</button>
              {delayedShipments.length > 0 && (
                <button
                  onClick={() => setContactShip(delayedShipments[0])}
                  style={{ flex: 1, padding: '6px 0', background: 'var(--neon-red-dim)', border: '1px solid var(--neon-red)', color: 'var(--neon-red)', cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', borderRadius: '3px', animation: 'blink 2s ease-in-out infinite' }}
                >⚠ Alert {delayedShipments.length} Delayed</button>
              )}
            </div>
          </div>

          {/* Shipment list */}
          <div style={{ overflow: 'auto', flex: 1, padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {shipments.length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: '13px', color: 'var(--text-muted)', letterSpacing: '0.2em', animation: 'blink 1.2s infinite' }}>Loading...</div>
            ) : (
              shipments.map(ship => (
                <ShipmentCard
                  key={ship.shipmentId}
                  shipment={ship}
                  selected={selectedId === ship.shipmentId}
                  onClick={() => setSelectedId(prev => prev === ship.shipmentId ? null : ship.shipmentId)}
                  onViewDetails={id => setDetailPageId(id)}
                  onContact={ship => setContactShip(ship)}
                />
              ))
            )}
          </div>
        </aside>

        {/* ── Main: map + event log ── */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
          <MapView shipments={shipments} selectedId={selectedId} />

          {/* Collapsible event log */}
          <div style={{ flexShrink: 0 }}>
            <div
              onClick={() => setLogOpen(o => !o)}
              style={{
                padding: '7px 18px', background: 'var(--bg-panel)',
                borderTop: '1px solid var(--border)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '8px',
                fontFamily: 'var(--font-display)', fontSize: '9px',
                letterSpacing: '0.2em', color: 'var(--text-muted)', textTransform: 'uppercase',
                userSelect: 'none',
              }}
            >
              <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--neon-cyan)', animation: 'blink 1s infinite' }} />
              Event Stream
              <span style={{ marginLeft: 'auto', fontSize: '11px' }}>{logOpen ? '▼ collapse' : '▲ expand'}</span>
            </div>
            {logOpen && <EventLog shipments={shipments} />}
          </div>

          {/* Slide-in detail panel */}
          {selectedShipment && (
            <ShipmentDetailPanel
              shipment={selectedShipment}
              onClose={() => setSelectedId(null)}
              onUpdateDelay={updateDelay}
              onContact={ship => setContactShip(ship)}
            />
          )}
        </main>
      </div>

      {/* Contact overlay (global, above everything) */}
      {contactShip && (
        <ContactOverlay shipment={contactShip} onClose={() => setContactShip(null)} />
      )}
    </div>
  );
}
