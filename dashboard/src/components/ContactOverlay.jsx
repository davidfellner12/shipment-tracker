// src/components/ContactOverlay.jsx
// Full-screen overlay for contacting driver, coordinator, and customer for a shipment.
import React, { useState } from 'react';
import { CONTACTS, COORDINATORS, CUSTOMERS, ROUTES_DATA } from '../lib/mockData';

function cleanPhone(phone) {
  return phone.replace(/[\s\-()]/g, '');
}

function Avatar({ initials, color, size = 48 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color + '18', border: `2px solid ${color}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-display)', fontWeight: 700,
      fontSize: size * 0.3, color, flexShrink: 0, letterSpacing: '0.05em',
    }}>{initials}</div>
  );
}

function ActionBtn({ href, color, label, icon, onClick }) {
  const [hov, setHov] = useState(false);
  const el = (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
        padding: '14px 18px',
        background: hov ? color + '20' : color + '0d',
        border: `1px solid ${color}`,
        borderRadius: '6px', cursor: 'pointer',
        transition: 'all 0.15s ease', minWidth: '80px',
        textDecoration: 'none',
      }}
    >
      <span style={{ fontSize: '22px', lineHeight: 1 }}>{icon}</span>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color }}>{label}</span>
    </div>
  );
  return href ? <a href={href} style={{ textDecoration: 'none' }}>{el}</a> : el;
}

function ContactCard({ person, role, accentColor, isDelayed, shipmentId, routeLabel }) {
  const [alertSent, setAlertSent] = useState(false);
  const wa = `https://wa.me/${cleanPhone(person.phone)}`;
  const subject = isDelayed
    ? `URGENT: Shipment ${shipmentId} Delay Alert`
    : `Status Update: Shipment ${shipmentId}`;
  const body = isDelayed
    ? `Hello ${person.name.split(' ')[0]},\n\nShipment ${shipmentId} (${routeLabel}) is currently marked as DELAYED.\n\nPlease confirm your current status and expected arrival time.\n\nShipTrack Dashboard`
    : `Hello ${person.name.split(' ')[0]},\n\nThis is an automated status update for Shipment ${shipmentId} (${routeLabel}).\n\nPlease confirm your current position.\n\nShipTrack Dashboard`;
  const mailto = `mailto:${person.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <div style={{
      padding: '20px 24px',
      background: 'var(--bg-card)',
      border: `1px solid var(--border)`,
      borderLeft: `4px solid ${accentColor}`,
      borderRadius: '6px',
    }}>
      {/* Person header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
        <Avatar initials={person.avatar} color={accentColor} size={52} />
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)', marginBottom: '2px' }}>{person.name}</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '11px', color: accentColor, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{role}{person.region ? ` · ${person.region}` : ''}</div>
          <div style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>{person.phone}</div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <ActionBtn href={`tel:${cleanPhone(person.phone)}`} color={accentColor} label="Call" icon="📞" />
        <ActionBtn href={mailto}                            color={accentColor} label="Email" icon="✉️" />
        <ActionBtn href={wa}                               color="#25D366"     label="WhatsApp" icon="💬" />
        <ActionBtn
          color="var(--border-bright)"
          label="Copy №"
          icon="📋"
          onClick={() => { navigator.clipboard?.writeText(person.phone); }}
        />
      </div>

      {/* Email detail */}
      <div style={{ fontFamily: 'var(--text-mono)', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '14px' }}>
        {person.email}
      </div>

      {/* Quick alert button for delayed */}
      {isDelayed && (
        <button
          onClick={() => { window.location.href = mailto; setAlertSent(true); }}
          style={{
            width: '100%', padding: '10px',
            background: alertSent ? 'rgba(0,230,118,0.1)' : 'rgba(255,23,68,0.1)',
            border: `1px solid ${alertSent ? 'var(--neon-green)' : 'var(--neon-red)'}`,
            color: alertSent ? 'var(--neon-green)' : 'var(--neon-red)',
            fontFamily: 'var(--font-display)', fontSize: '11px', letterSpacing: '0.15em',
            textTransform: 'uppercase', cursor: 'pointer', borderRadius: '4px',
            transition: 'all 0.2s',
          }}
        >
          {alertSent ? '✓ Alert Sent' : '⚠ Send Delay Alert'}
        </button>
      )}
    </div>
  );
}

export default function ContactOverlay({ shipment, onClose }) {
  if (!shipment) return null;

  const r    = ROUTES_DATA[shipment.shipmentId] || {};
  const drv  = CONTACTS[r.driverId]      || { name: 'Unknown Driver',      phone: '—', email: '—', avatar: '?', role: 'Driver' };
  const crd  = COORDINATORS[r.coordId]   || { name: 'Unknown Coordinator', phone: '—', email: '—', avatar: '?', role: 'Coordinator' };
  const cust = CUSTOMERS[r.customerId]   || {};

  const statusColor = shipment.status === 'DELAYED' ? 'var(--neon-red)' : 'var(--neon-cyan)';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 900,
      background: 'rgba(9,12,16,0.88)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{
        width: '680px', maxHeight: '90vh',
        background: 'var(--bg-surface)',
        border: `1px solid ${statusColor}`,
        borderTop: `3px solid ${statusColor}`,
        borderRadius: '8px',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        animation: 'fade-in-up 0.2s ease',
        boxShadow: `0 0 60px ${statusColor}20`,
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-panel)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '18px', color: statusColor, letterSpacing: '0.08em' }}>
              Contact — {shipment.shipmentId}
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>
              {shipment.routeLabel} · {shipment.status.replace('_', ' ')}
              {shipment.isDelayed && <span style={{ color: 'var(--neon-red)', marginLeft: '8px' }}>⚠ DELAYED</span>}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: '1px solid var(--border-bright)',
            color: 'var(--text-muted)', cursor: 'pointer',
            padding: '6px 14px', fontFamily: 'var(--font-display)',
            fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', borderRadius: '4px',
          }}>Close ✕</button>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Driver */}
          <ContactCard
            person={drv}
            role="Driver"
            accentColor="var(--neon-cyan)"
            isDelayed={shipment.isDelayed}
            shipmentId={shipment.shipmentId}
            routeLabel={shipment.routeLabel}
          />

          {/* Coordinator */}
          <ContactCard
            person={crd}
            role={crd.role || 'Logistics Coordinator'}
            accentColor="var(--neon-amber)"
            isDelayed={shipment.isDelayed}
            shipmentId={shipment.shipmentId}
            routeLabel={shipment.routeLabel}
          />

          {/* Customer */}
          {cust.name && (
            <div style={{
              padding: '20px 24px', background: 'var(--bg-card)',
              border: '1px solid var(--border)', borderLeft: '4px solid var(--neon-green)',
              borderRadius: '6px',
            }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '9px', letterSpacing: '0.2em', color: 'var(--neon-green)', textTransform: 'uppercase', marginBottom: '12px' }}>
                Customer
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '14px' }}>
                <div style={{ width: '52px', height: '52px', borderRadius: '6px', background: 'rgba(0,230,118,0.1)', border: '2px solid var(--neon-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '18px', color: 'var(--neon-green)' }}>
                  {cust.name?.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)', marginBottom: '2px' }}>{cust.name}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{cust.industry} · {cust.contact}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <ActionBtn href={`tel:${cleanPhone(cust.phone || '')}`} color="var(--neon-green)" label="Call" icon="📞" />
                <ActionBtn href={`mailto:${cust.email}`} color="var(--neon-green)" label="Email" icon="✉️" />
                <ActionBtn href={`https://wa.me/${cleanPhone(cust.phone || '')}`} color="#25D366" label="WhatsApp" icon="💬" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
