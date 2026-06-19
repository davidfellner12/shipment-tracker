// src/App.jsx
import React, { useState } from 'react';
import Header               from './components/Header';
import StatsBar             from './components/StatsBar';
import ShipmentCard         from './components/ShipmentCard';
import MapView              from './components/MapView';
import EventLog             from './components/EventLog';
import ShipmentDetailPanel  from './components/ShipmentDetailPanel';
import ShipmentDetailPage   from './components/ShipmentDetailPage';
import CostDashboard        from './components/CostDashboard';
import ArchitecturePanel    from './components/ArchitecturePanel';
import { useShipments }     from './hooks/useShipments';

const layout = {
  root:        { display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' },
  body:        { display: 'flex', flex: 1, overflow: 'hidden' },
  sidebar:     { width: '270px', flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)', borderRight: '1px solid var(--border)', overflow: 'hidden' },
  sidebarHead: { padding: '10px 14px 8px', fontFamily: 'var(--font-display)', fontSize: '9px', letterSpacing: '0.2em', color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' },
  sidebarList: { overflow: 'auto', flex: 1, padding: '6px', display: 'flex', flexDirection: 'column', gap: '5px' },
  main:        { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' },
  errorBanner: { padding: '8px 16px', background: 'var(--neon-red-dim)', border: '1px solid var(--neon-red)', color: 'var(--neon-red)', fontFamily: 'var(--text-mono)', fontSize: '12px', flexShrink: 0 },
  loading:     { display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, fontFamily: 'var(--font-display)', fontSize: '18px', letterSpacing: '0.3em', color: 'var(--neon-cyan)', textTransform: 'uppercase', animation: 'blink 1.2s ease-in-out infinite' },
  navBtn:      { background: 'none', border: '1px solid var(--border-bright)', color: 'var(--text-muted)', fontFamily: 'var(--font-display)', fontSize: '8px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '3px 6px', cursor: 'pointer', borderRadius: '2px' },
  navBtnActive:{ background: 'none', border: '1px solid var(--neon-amber)', color: 'var(--neon-amber)', fontFamily: 'var(--font-display)', fontSize: '8px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '3px 6px', cursor: 'pointer', borderRadius: '2px' },
  navBtnArch:  { background: 'none', border: '1px solid var(--neon-cyan)', color: 'var(--neon-cyan)', fontFamily: 'var(--font-display)', fontSize: '8px', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '3px 6px', cursor: 'pointer', borderRadius: '2px' },
};

export default function App() {
  const { shipments, lastUpdated, latencyMs, error, loading, updateDelay } = useShipments();
  const [selectedId,    setSelectedId]    = useState(null);
  const [detailPageId,  setDetailPageId]  = useState(null);
  const [showCostDash,  setShowCostDash]  = useState(false);
  const [showArchPanel, setShowArchPanel] = useState(false);

  const selectedShipment = shipments.find(s => s.shipmentId === selectedId)   || null;
  const detailShipment   = shipments.find(s => s.shipmentId === detailPageId) || null;

  return (
    <div style={layout.root}>
      <Header shipments={shipments} lastUpdated={lastUpdated} latencyMs={latencyMs} />
      <StatsBar shipments={shipments} />

      {error && <div style={layout.errorBanner}>⚠ API Error: {error} — retrying...</div>}

      <div style={layout.body}>
        {/* ── Sidebar ── */}
        <aside style={layout.sidebar}>
          <div style={layout.sidebarHead}>
            <span>Fleet ({shipments.length})</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button style={layout.navBtnArch}  onClick={() => setShowArchPanel(true)}>Arch</button>
              <button style={layout.navBtnActive} onClick={() => setShowCostDash(true)}>Analytics</button>
            </div>
          </div>
          <div style={layout.sidebarList}>
            {loading && shipments.length === 0 ? (
              <div style={{ ...layout.loading, flex: 'unset', padding: '40px 0', fontSize: '13px' }}>Loading...</div>
            ) : (
              shipments.map(ship => (
                <ShipmentCard
                  key={ship.shipmentId}
                  shipment={ship}
                  selected={selectedId === ship.shipmentId}
                  onClick={() => setSelectedId(prev => prev === ship.shipmentId ? null : ship.shipmentId)}
                  onViewDetails={(id) => setDetailPageId(id)}
                />
              ))
            )}
          </div>
        </aside>

        {/* ── Main area ── */}
        <main style={layout.main}>
          {loading && shipments.length === 0 ? (
            <div style={layout.loading}>Initialising Tracker...</div>
          ) : (
            <>
              <MapView shipments={shipments} selectedId={selectedId} />
              <EventLog shipments={shipments} />

              {/* Slide-in detail panel */}
              {selectedShipment && !detailPageId && (
                <ShipmentDetailPanel
                  shipment={selectedShipment}
                  onClose={() => setSelectedId(null)}
                  onUpdateDelay={updateDelay}
                />
              )}

              {/* Full detail page */}
              {detailShipment && (
                <ShipmentDetailPage
                  shipment={detailShipment}
                  onBack={() => setDetailPageId(null)}
                />
              )}

              {/* Analytics modal */}
              {showCostDash && (
                <CostDashboard
                  shipments={shipments}
                  onClose={() => setShowCostDash(false)}
                />
              )}

              {/* Architecture panel */}
              {showArchPanel && (
                <ArchitecturePanel
                  onClose={() => setShowArchPanel(false)}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
