// src/components/ShipmentDetailPage.jsx
// Full-page shipment detail view — triggered by clicking "View Details" on a card

import React, { useState } from 'react';
import { ROUTES_DATA, CONTACTS, COORDINATORS, CUSTOMERS, VEHICLES } from '../lib/mockData.js';
import { exportShipmentCSV } from '../lib/export.js';
import ContactOverlay from './ContactOverlay.jsx';

const STATUS_COLOR = {
  IN_TRANSIT:    'var(--neon-cyan)',
  ARRIVING_SOON: 'var(--neon-green)',
  DELAYED:       'var(--neon-red)',
  DELIVERED:     'var(--neon-green)',
};
const PRIORITY_COLOR = {
  CRITICAL: 'var(--neon-red)',
  HIGH:     'var(--neon-amber)',
  MEDIUM:   'var(--neon-cyan)',
  LOW:      'var(--text-muted)',
};

// ── Small reusable atoms ───────────────────────────────────────────────────

function Card({ children, style }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: '4px',
      padding: '16px',
      ...style,
    }}>{children}</div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{
      fontFamily: 'var(--font-display)',
      fontSize: '9px', letterSpacing: '0.22em',
      color: 'var(--text-muted)', textTransform: 'uppercase',
      borderBottom: '1px solid var(--border)',
      paddingBottom: '6px', marginBottom: '12px',
    }}>{children}</div>
  );
}

function KV({ label, value, color, mono, wide }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '5px 0', borderBottom: '1px solid var(--border)',
      flexDirection: wide ? 'column' : 'row', gap: wide ? '3px' : 0,
    }}>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.06em', flexShrink: 0 }}>{label}</span>
      <span style={{
        fontFamily: mono ? 'var(--text-mono)' : 'var(--font-display)',
        fontWeight: mono ? 'normal' : 600,
        fontSize: '12px',
        color: color || 'var(--text-primary)',
        textAlign: wide ? 'left' : 'right',
        wordBreak: 'break-word',
      }}>{value}</span>
    </div>
  );
}

function Avatar({ initials, color }) {
  return (
    <div style={{
      width: '38px', height: '38px', borderRadius: '50%',
      background: color || 'var(--neon-cyan-dim)',
      border: `1px solid ${color || 'var(--neon-cyan)'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '13px',
      color: color || 'var(--neon-cyan)', flexShrink: 0,
      letterSpacing: '0.05em',
    }}>{initials}</div>
  );
}

function ContactCard({ person, accentColor }) {
  return (
    <div style={{
      display: 'flex', gap: '12px', alignItems: 'flex-start',
      padding: '12px', background: 'var(--bg-panel)',
      border: '1px solid var(--border)',
      borderLeft: `3px solid ${accentColor || 'var(--neon-cyan)'}`,
      borderRadius: '2px',
    }}>
      <Avatar initials={person.avatar} color={accentColor} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)', marginBottom: '2px' }}>{person.name}</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>{person.role}{person.region ? ` · ${person.region}` : ''}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <a href={`tel:${person.phone}`} style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', color: accentColor || 'var(--neon-cyan)', textDecoration: 'none' }}>📞 {person.phone}</a>
          <a href={`mailto:${person.email}`} style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', color: 'var(--text-secondary)', textDecoration: 'none' }}>✉ {person.email}</a>
        </div>
      </div>
    </div>
  );
}

function ProgressTimeline({ waypoints, progress }) {
  const activePct = parseFloat(progress) * 100;
  const activeIdx = Math.min(waypoints.length - 1, Math.floor(parseFloat(progress) * waypoints.length));
  return (
    <div style={{ padding: '4px 0' }}>
      {waypoints.map((city, i) => {
        const done   = i < activeIdx;
        const active = i === activeIdx;
        const color  = active ? 'var(--neon-cyan)' : done ? 'var(--neon-green)' : 'var(--border-bright)';
        return (
          <div key={city} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '2px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '14px', flexShrink: 0 }}>
              <div style={{
                width: active ? '12px' : '9px', height: active ? '12px' : '9px',
                borderRadius: '50%', background: color,
                boxShadow: active ? `0 0 10px ${color}` : 'none',
                border: done || active ? 'none' : `1px solid ${color}`,
                marginTop: '3px', transition: 'all 0.3s',
              }} />
              {i < waypoints.length - 1 && (
                <div style={{ width: '2px', height: '28px', background: done ? 'var(--neon-green)' : 'var(--border)', marginTop: '2px' }} />
              )}
            </div>
            <div style={{ paddingTop: '1px' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: active ? 700 : 400, fontSize: active ? '13px' : '12px', color: active ? 'var(--neon-cyan)' : done ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {i === 0 ? '◉ Origin' : i === waypoints.length - 1 ? '◎ Destination' : `· ${city}`}
              </div>
              <div style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', color: 'var(--text-muted)', marginTop: '1px' }}>
                {city}{active ? ' ← current' : ''}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DocumentBadge({ doc }) {
  const type = doc.startsWith('CMR') ? 'CMR' : doc.startsWith('INV') ? 'INV' : doc.startsWith('ADR') ? 'ADR' : doc.startsWith('GDP') ? 'GDP' : doc.startsWith('EUR') ? 'EUR1' : doc.startsWith('T1') ? 'T1' : 'DOC';
  const colors = { CMR: 'var(--neon-cyan)', INV: 'var(--neon-green)', ADR: 'var(--neon-red)', GDP: 'var(--neon-amber)', EUR1: 'var(--neon-amber)', T1: 'var(--text-secondary)', DOC: 'var(--text-muted)', TEMP: 'var(--neon-cyan)', MSDS: 'var(--neon-red)', CUST: 'var(--text-secondary)' };
  const color = colors[type] || 'var(--text-muted)';
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: '5px 10px', margin: '3px',
      background: 'var(--bg-panel)', border: `1px solid ${color}`,
      borderRadius: '2px', cursor: 'default',
    }}>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: '9px', letterSpacing: '0.1em', color, textTransform: 'uppercase' }}>{type}</span>
      <span style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', color: 'var(--text-secondary)' }}>{doc}</span>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: '9px', color: 'var(--neon-green)' }}>✓</span>
    </div>
  );
}

// ── Tab definitions ────────────────────────────────────────────────────────
const TABS = ['Overview', 'Route & Timeline', 'Cargo & Documents', 'Contacts', 'Vehicle'];

export default function ShipmentDetailPage({ shipment, onBack }) {
  const [tab,          setTab]          = useState('Overview');
  const [showContact,  setShowContact]  = useState(false);
  if (!shipment) return null;

  const id    = shipment.shipmentId;
  const r     = ROUTES_DATA[id] || {};
  const driver    = CONTACTS[r.driverId] || {};
  const coord     = COORDINATORS[r.coordId] || {};
  const customer  = CUSTOMERS[r.customerId] || {};
  const vehicle   = VEHICLES[r.vehicleId] || {};

  const pct         = Math.round(parseFloat(shipment.progress) * 100);
  const statusColor = STATUS_COLOR[shipment.status] || 'var(--neon-cyan)';
  const priorityColor = PRIORITY_COLOR[r.priority] || 'var(--text-muted)';
  const remKm       = Math.round(r.distanceKm * (1 - parseFloat(shipment.progress)));
  const etaDisplay  = shipment.etaMinutes > 60
    ? `${Math.floor(shipment.etaMinutes / 60)}h ${shipment.etaMinutes % 60}m`
    : `${shipment.etaMinutes}m`;

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'var(--bg-base)',
      zIndex: 800,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      animation: 'fade-in-up 0.18s ease',
    }}>
      {/* ── Top bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '16px',
        padding: '0 20px', height: '52px',
        background: 'var(--bg-surface)',
        borderBottom: `1px solid ${statusColor}`,
        flexShrink: 0,
      }}>
        <button onClick={onBack} style={{
          background: 'none', border: '1px solid var(--border-bright)',
          color: 'var(--text-secondary)', cursor: 'pointer',
          padding: '4px 12px', fontFamily: 'var(--font-display)',
          fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase',
          borderRadius: '2px',
        }}>← Back</button>
        <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />
        <div style={{ fontFamily: 'var(--text-mono)', fontSize: '16px', color: statusColor, letterSpacing: '0.1em' }}>{id}</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '13px', color: 'var(--text-secondary)' }}>{r.label}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ padding: '3px 10px', border: `1px solid ${priorityColor}`, fontFamily: 'var(--font-display)', fontSize: '9px', letterSpacing: '0.15em', color: priorityColor, textTransform: 'uppercase', borderRadius: '2px' }}>{r.priority}</span>
          <span style={{ padding: '3px 10px', border: `1px solid ${statusColor}`, fontFamily: 'var(--font-display)', fontSize: '9px', letterSpacing: '0.15em', color: statusColor, textTransform: 'uppercase', borderRadius: '2px' }}>{shipment.status.replace('_', ' ')}</span>
          <button onClick={() => setShowContact(true)} style={{ background: 'none', border: `1px solid ${shipment.isDelayed ? 'var(--neon-red)' : 'var(--neon-cyan)'}`, color: shipment.isDelayed ? 'var(--neon-red)' : 'var(--neon-cyan)', cursor: 'pointer', padding: '4px 12px', fontFamily: 'var(--font-display)', fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', borderRadius: '2px' }}>
            📞 Contact
          </button>
          <button onClick={() => exportShipmentCSV(shipment, r)} style={{ background: 'none', border: '1px solid var(--border-bright)', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px 12px', fontFamily: 'var(--font-display)', fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', borderRadius: '2px' }}>
            ↓ Export
          </button>
        </div>
      </div>

      {/* ── Hero progress strip ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '20px',
        padding: '12px 20px', background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <div style={{ textAlign: 'center', minWidth: '56px' }}>
          <div style={{ fontFamily: 'var(--text-mono)', fontSize: '28px', color: statusColor, lineHeight: 1 }}>{pct}%</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '9px', color: 'var(--text-muted)', letterSpacing: '0.15em' }}>COMPLETE</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--text-secondary)' }}>{r.origin}</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--text-secondary)' }}>{r.destination}</span>
          </div>
          <div style={{ height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: statusColor, boxShadow: `0 0 10px ${statusColor}`, borderRadius: '3px', transition: 'width 0.6s ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', color: 'var(--text-muted)' }}>{Math.round(r.distanceKm * parseFloat(shipment.progress))} km done</span>
            <span style={{ fontFamily: 'var(--text-mono)', fontSize: '10px', color: 'var(--text-muted)' }}>{remKm} km remaining</span>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', textAlign: 'right' }}>
          {[
            ['ETA', shipment.status === 'DELIVERED' ? 'Arrived' : etaDisplay, shipment.isDelayed ? 'var(--neon-red)' : statusColor],
            ['Speed', `${parseFloat(shipment.speedKmh).toFixed(0)} km/h`, 'var(--text-primary)'],
            ['Near', shipment.nearestCity, 'var(--text-secondary)'],
            ['Distance', `${r.distanceKm} km`, 'var(--text-muted)'],
          ].map(([label, val, col]) => (
            <div key={label}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '9px', letterSpacing: '0.15em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</div>
              <div style={{ fontFamily: 'var(--text-mono)', fontSize: '13px', color: col }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{
        display: 'flex', gap: '0',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '10px 18px', background: 'none',
            border: 'none', borderBottom: t === tab ? `2px solid var(--neon-cyan)` : '2px solid transparent',
            color: t === tab ? 'var(--neon-cyan)' : 'var(--text-muted)',
            fontFamily: 'var(--font-display)', fontSize: '11px', letterSpacing: '0.12em',
            textTransform: 'uppercase', cursor: 'pointer', transition: 'color 0.15s',
          }}>{t}</button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>

        {/* ─── OVERVIEW ─── */}
        {tab === 'Overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            <Card>
              <SectionTitle>Shipment Info</SectionTitle>
              <KV label="Shipment ID"   value={id} mono />
              <KV label="Status"        value={shipment.status.replace('_', ' ')} color={statusColor} />
              <KV label="Priority"      value={r.priority} color={priorityColor} />
              <KV label="Route"         value={r.label} />
              <KV label="Origin"        value={r.origin} mono />
              <KV label="Destination"   value={r.destination} mono />
              <KV label="Total Distance" value={`${r.distanceKm} km`} mono />
              <KV label="Departed"      value={new Date(r.departedAt).toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })} mono />
              <KV label="Sched. Arrival" value={new Date(r.scheduledArrival).toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })} mono />
            </Card>

            <Card>
              <SectionTitle>Live Telemetry</SectionTitle>
              <KV label="Progress"      value={`${pct}%`} color={statusColor} mono />
              <KV label="Current Speed" value={`${parseFloat(shipment.speedKmh).toFixed(0)} km/h`} color="var(--neon-cyan)" mono />
              <KV label="ETA"           value={shipment.status === 'DELIVERED' ? 'Arrived' : etaDisplay} color={shipment.isDelayed ? 'var(--neon-red)' : 'var(--neon-cyan)'} mono />
              <KV label="Nearest City"  value={shipment.nearestCity} mono />
              <KV label="Lat / Lon"     value={`${parseFloat(shipment.latitude).toFixed(4)}, ${parseFloat(shipment.longitude).toFixed(4)}`} mono />
              <KV label="Km Remaining"  value={`${remKm} km`} mono />
              <KV label="Last Update"   value={new Date(shipment.timestamp).toLocaleTimeString('en-GB')} mono />
              {shipment.isDelayed && (
                <div style={{ marginTop: '10px', padding: '8px 10px', background: 'var(--neon-red-dim)', border: '1px solid var(--neon-red)', borderRadius: '2px', fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--neon-red)', lineHeight: 1.5 }}>
                  ⚠ DELAYED — {r.delayReason || 'Reason unknown'}
                </div>
              )}
            </Card>

            <Card>
              <SectionTitle>Cargo Summary</SectionTitle>
              <KV label="Cargo Type"    value={r.cargo} />
              <KV label="Cargo Value"   value={`€${r.cargoValue.toLocaleString()}`} color="var(--text-primary)" mono />
              <KV label="Weight"        value={r.weight} mono />
              <KV label="Customer"      value={customer.name || '—'} />
              <KV label="Industry"      value={customer.industry || '—'} color="var(--text-muted)" />
              <KV label="Documents"     value={`${(r.documents || []).length} attached`} color="var(--neon-green)" />
              {r.notes && (
                <div style={{ marginTop: '10px', padding: '8px 10px', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '2px', fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  📋 {r.notes}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ─── ROUTE & TIMELINE ─── */}
        {tab === 'Route & Timeline' && (
          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '16px' }}>
            <Card>
              <SectionTitle>Waypoints</SectionTitle>
              <ProgressTimeline waypoints={r.waypoints || []} progress={shipment.progress} />
            </Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <Card>
                <SectionTitle>Journey Stats</SectionTitle>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {[
                    ['Total Route',     `${r.distanceKm} km`,               'var(--text-primary)'],
                    ['Completed',       `${Math.round(r.distanceKm * parseFloat(shipment.progress))} km`, statusColor],
                    ['Remaining',       `${remKm} km`,                       'var(--text-secondary)'],
                    ['Current Speed',   `${parseFloat(shipment.speedKmh).toFixed(0)} km/h`,  'var(--neon-cyan)'],
                    ['ETA',            shipment.status === 'DELIVERED' ? 'Arrived' : etaDisplay, shipment.isDelayed ? 'var(--neon-red)' : 'var(--neon-green)'],
                    ['Waypoints',       `${(r.waypoints || []).length} cities`, 'var(--text-muted)'],
                  ].map(([l, v, c]) => (
                    <div key={l} style={{ padding: '10px 12px', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '2px' }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: '9px', letterSpacing: '0.15em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>{l}</div>
                      <div style={{ fontFamily: 'var(--text-mono)', fontSize: '18px', color: c }}>{v}</div>
                    </div>
                  ))}
                </div>
              </Card>
              <Card>
                <SectionTitle>Schedule</SectionTitle>
                <KV label="Departed"          value={new Date(r.departedAt).toLocaleString('en-GB')} mono />
                <KV label="Scheduled Arrival" value={new Date(r.scheduledArrival).toLocaleString('en-GB')} mono />
                <KV label="Status"            value={shipment.status.replace('_', ' ')} color={statusColor} />
                {shipment.isDelayed && <KV label="Delay Reason" value={r.delayReason || 'Unknown'} color="var(--neon-red)" wide />}
              </Card>
            </div>
          </div>
        )}

        {/* ─── CARGO & DOCUMENTS ─── */}
        {tab === 'Cargo & Documents' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <Card>
              <SectionTitle>Cargo Details</SectionTitle>
              <KV label="Type"         value={r.cargo} />
              <KV label="Value"        value={`€${r.cargoValue.toLocaleString()}`} color="var(--neon-cyan)" mono />
              <KV label="Weight"       value={r.weight} mono />
              <KV label="Customer"     value={customer.name || '—'} />
              <KV label="Contact"      value={customer.contact || '—'} />
              <KV label="Industry"     value={customer.industry || '—'} color="var(--text-muted)" />
              {r.notes && (
                <div style={{ marginTop: '12px', padding: '10px 12px', background: 'var(--bg-panel)', border: '1px solid var(--neon-amber)', borderLeft: '3px solid var(--neon-amber)', borderRadius: '2px', fontFamily: 'var(--font-display)', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  <span style={{ color: 'var(--neon-amber)', marginRight: '6px' }}>⚑</span>Special Instructions:<br />{r.notes}
                </div>
              )}
            </Card>
            <Card>
              <SectionTitle>Customer Info</SectionTitle>
              <KV label="Company"      value={customer.name || '—'} />
              <KV label="Contact"      value={customer.contact || '—'} />
              <KV label="Industry"     value={customer.industry || '—'} color="var(--text-muted)" />
              <div style={{ marginTop: '10px' }}>
                <a href={`tel:${customer.phone}`} style={{ display: 'block', fontFamily: 'var(--text-mono)', fontSize: '12px', color: 'var(--neon-cyan)', textDecoration: 'none', padding: '4px 0' }}>📞 {customer.phone || '—'}</a>
                <a href={`mailto:${customer.email}`} style={{ display: 'block', fontFamily: 'var(--text-mono)', fontSize: '12px', color: 'var(--text-secondary)', textDecoration: 'none', padding: '4px 0' }}>✉ {customer.email || '—'}</a>
              </div>
            </Card>
            <Card style={{ gridColumn: '1 / -1' }}>
              <SectionTitle>Transport Documents</SectionTitle>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {(r.documents || []).map(doc => <DocumentBadge key={doc} doc={doc} />)}
              </div>
              <div style={{ marginTop: '12px', fontFamily: 'var(--font-display)', fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                All documents verified and on-board. CMR = consignment note · INV = commercial invoice · ADR = hazardous goods declaration · GDP = good distribution practice cert · EUR1 = preferential origin · T1 = customs transit · MSDS = material safety data sheet
              </div>
            </Card>
          </div>
        )}

        {/* ─── CONTACTS ─── */}
        {tab === 'Contacts' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '9px', letterSpacing: '0.2em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px' }}>Driver</div>
              <ContactCard person={driver} accentColor="var(--neon-cyan)" />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '9px', letterSpacing: '0.2em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px' }}>Logistics Coordinator</div>
              <ContactCard person={coord} accentColor="var(--neon-amber)" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '9px', letterSpacing: '0.2em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px' }}>Customer</div>
              <div style={{
                padding: '16px', background: 'var(--bg-card)',
                border: '1px solid var(--border)', borderLeft: '3px solid var(--neon-green)',
                borderRadius: '2px',
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 40px',
              }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)', marginBottom: '4px' }}>{customer.name}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>{customer.industry}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Contact: <strong>{customer.contact}</strong></div>
                </div>
                <div>
                  <a href={`tel:${customer.phone}`} style={{ display: 'block', fontFamily: 'var(--text-mono)', fontSize: '12px', color: 'var(--neon-green)', textDecoration: 'none', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>📞 {customer.phone}</a>
                  <a href={`mailto:${customer.email}`} style={{ display: 'block', fontFamily: 'var(--text-mono)', fontSize: '12px', color: 'var(--text-secondary)', textDecoration: 'none', padding: '5px 0' }}>✉ {customer.email}</a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── CONTACTS tab improvements ─── */}
        {/* ─── VEHICLE ─── */}
        {tab === 'Vehicle' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <Card>
              <SectionTitle>Vehicle Details</SectionTitle>
              <KV label="License Plate" value={vehicle.plate} mono color="var(--neon-cyan)" />
              <KV label="Model"         value={vehicle.model} />
              <KV label="Year"          value={vehicle.year} mono />
              <KV label="Fuel Type"     value={vehicle.fuel} color={vehicle.fuel === 'Electric' ? 'var(--neon-green)' : vehicle.fuel === 'LNG' ? 'var(--neon-cyan)' : vehicle.fuel === 'HVO' ? 'var(--neon-green)' : 'var(--text-secondary)'} />
              <KV label="Max Capacity"  value={vehicle.capacity} mono />
              <KV label="Last Service"  value={vehicle.lastService} mono />
              <KV label="Current Driver" value={driver.name || '—'} />
            </Card>
            <Card>
              <SectionTitle>Current Load</SectionTitle>
              <KV label="Cargo"         value={r.cargo} />
              <KV label="Load Weight"   value={r.weight} mono color="var(--neon-cyan)" />
              <KV label="Max Capacity"  value={vehicle.capacity} mono />
              <div style={{ marginTop: '10px' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '5px' }}>Load Factor</div>
                {(() => {
                  const load = parseFloat(r.weight);
                  const cap  = parseFloat(vehicle.capacity);
                  const pct  = Math.round((load / cap) * 100);
                  return (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', color: 'var(--text-secondary)' }}>{r.weight} / {vehicle.capacity}</span>
                        <span style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', color: pct > 90 ? 'var(--neon-amber)' : 'var(--neon-cyan)' }}>{pct}%</span>
                      </div>
                      <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: pct > 90 ? 'var(--neon-amber)' : 'var(--neon-cyan)', borderRadius: '2px' }} />
                      </div>
                    </>
                  );
                })()}
              </div>
            </Card>
          </div>
        )}
      </div>

      {showContact && <ContactOverlay shipment={shipment} onClose={() => setShowContact(false)} />}
    </div>
  );
}
