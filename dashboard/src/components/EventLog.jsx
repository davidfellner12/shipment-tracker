// src/components/EventLog.jsx
import React, { useEffect, useRef } from 'react';

const MAX_EVENTS = 30;

const s = {
  panel: {
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-surface)',
    borderTop: '1px solid var(--border)',
    height: '180px',
    flexShrink: 0,
  },
  heading: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    borderBottom: '1px solid var(--border)',
    fontFamily: 'var(--font-display)',
    fontSize: '10px',
    letterSpacing: '0.2em',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    flexShrink: 0,
  },
  dot: {
    width: '5px', height: '5px',
    borderRadius: '50%',
    background: 'var(--neon-cyan)',
    animation: 'blink 1s infinite',
  },
  list: {
    overflow: 'auto',
    flex: 1,
    padding: '4px 0',
  },
  entry: (type) => ({
    display: 'flex',
    gap: '12px',
    padding: '3px 16px',
    fontFamily: 'var(--text-mono)',
    fontSize: '11px',
    lineHeight: 1.5,
    animation: 'fade-in-up 0.2s ease',
    borderLeft: `2px solid ${
      type === 'DELAYED' ? 'var(--neon-red)' :
      type === 'ARRIVING_SOON' ? 'var(--neon-green)' :
      type === 'DELIVERED' ? 'var(--neon-green)' :
      'transparent'
    }`,
    marginLeft: '14px',
  }),
  time: {
    color: 'var(--text-muted)',
    minWidth: '60px',
    flexShrink: 0,
  },
  id: {
    color: 'var(--neon-cyan)',
    minWidth: '70px',
    flexShrink: 0,
  },
  msg: (type) => ({
    color: type === 'DELAYED' ? 'var(--neon-red)' :
           type === 'ARRIVING_SOON' ? 'var(--neon-green)' :
           'var(--text-secondary)',
    flex: 1,
  }),
};

export default function EventLog({ shipments }) {
  const eventsRef = useRef([]);
  const listRef   = useRef(null);
  const prevRef   = useRef({});

  // Generate log entries from shipment state changes
  useEffect(() => {
    shipments.forEach(ship => {
      const prev = prevRef.current[ship.shipmentId];
      if (!prev) {
        eventsRef.current.push({
          id: Date.now() + Math.random(),
          time: new Date().toLocaleTimeString('en-GB'),
          shipmentId: ship.shipmentId,
          type: ship.status,
          msg: `${ship.shipmentId} tracking started near ${ship.nearestCity}`,
        });
      } else if (prev.status !== ship.status) {
        eventsRef.current.push({
          id: Date.now() + Math.random(),
          time: new Date().toLocaleTimeString('en-GB'),
          shipmentId: ship.shipmentId,
          type: ship.status,
          msg: `${ship.shipmentId} status → ${ship.status} near ${ship.nearestCity}`,
        });
      } else if (prev.nearestCity !== ship.nearestCity) {
        eventsRef.current.push({
          id: Date.now() + Math.random(),
          time: new Date().toLocaleTimeString('en-GB'),
          shipmentId: ship.shipmentId,
          type: 'IN_TRANSIT',
          msg: `${ship.shipmentId} passed through ${ship.nearestCity} @ ${parseFloat(ship.speedKmh).toFixed(0)} km/h`,
        });
      }
      prevRef.current[ship.shipmentId] = { status: ship.status, nearestCity: ship.nearestCity };
    });

    // Trim
    if (eventsRef.current.length > MAX_EVENTS) {
      eventsRef.current = eventsRef.current.slice(-MAX_EVENTS);
    }

    // Scroll to bottom
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [shipments]);

  return (
    <div style={s.panel}>
      <div style={s.heading}>
        <div style={s.dot} />
        Event Stream
      </div>
      <div ref={listRef} style={s.list}>
        {eventsRef.current.map(e => (
          <div key={e.id} style={s.entry(e.type)}>
            <span style={s.time}>{e.time}</span>
            <span style={s.id}>{e.shipmentId}</span>
            <span style={s.msg(e.type)}>{e.msg}</span>
          </div>
        ))}
        {eventsRef.current.length === 0 && (
          <div style={{ padding: '8px 16px', fontFamily: 'var(--text-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
            Waiting for events...
          </div>
        )}
      </div>
    </div>
  );
}
