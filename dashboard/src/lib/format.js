// Formatting + domain vocabulary shared by every page.
import { network, catalog } from '../sim/engine.js';

export const BRAND = 'Tracelane';
export const CARRIER = catalog.carrier.name;
export const CUSTOMERS = catalog.customers;
export const HUBS = network.hubs;

const nf0 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

export const num = (v, digits = 0) => (v == null ? '—' : (digits ? nf1 : nf0).format(v));
export const pct = (v, digits = 0) => (v == null ? '—' : `${(v * 100).toFixed(digits)}%`);
export const eur = (v) => (v == null ? '—' : `€${nf0.format(v)}`);
export const compactEur = (v) => (v == null ? '—' : v >= 1e6 ? `€${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `€${Math.round(v / 1e3)}k` : `€${v}`);
export const tonnes = (kg) => (kg == null ? '—' : kg >= 1000 ? `${nf1.format(kg / 1000)} t` : `${nf0.format(kg)} kg`);

export function duration(min) {
  if (min == null) return '—';
  const m = Math.round(Math.abs(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 24) return r ? `${h}h ${r}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export const compact = (v) => (v == null ? '' : Math.abs(v) >= 1000 ? `${nf1.format(v / 1000)}k` : nf0.format(v));

export const delayText = (min) =>
  min == null ? '—' : min <= 0 ? `${duration(-min)} early` : `${duration(min)} late`;

const dtf = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vienna' });
const tf = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vienna' });
const df = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'Europe/Vienna' });
export const dateTime = (iso) => (iso ? dtf.format(new Date(iso)) : '—');
export const time = (iso) => (iso ? tf.format(new Date(iso)) : '—');
export const day = (iso) => (iso ? df.format(new Date(iso)) : '—');

export function ago(iso, nowMs = Date.now()) {
  if (!iso) return '—';
  const s = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

export const STATUS = {
  LOADING:     { label: 'Loading',       tone: 'neutral' },
  IN_TRANSIT:  { label: 'In transit',    tone: 'accent' },
  BREAK:       { label: 'Driver break',  tone: 'neutral' },
  REST:        { label: 'Daily rest',    tone: 'neutral' },
  BORDER_HOLD: { label: 'Border hold',   tone: 'warning' },
  UNLOADING:   { label: 'Unloading',     tone: 'neutral' },
  DELIVERED:   { label: 'Delivered',     tone: 'good' },
};

export const EXCEPTION = {
  LATE_RISK:      { label: 'Late risk',       severity: 'warning' },
  TEMP_EXCURSION: { label: 'Temp excursion',  severity: 'critical' },
  BORDER_HOLD:    { label: 'Border hold',     severity: 'warning' },
  SIGNAL_LOST:    { label: 'Signal lost',     severity: 'critical' },
  FLAGGED:        { label: 'Flagged',         severity: 'warning' },
};

export const FUEL = { DIESEL: 'Diesel', LNG: 'LNG', HVO: 'HVO100', ELECTRIC: 'Battery-electric' };

const COUNTRY = { AT: 'Austria', DE: 'Germany', NL: 'Netherlands', BE: 'Belgium', FR: 'France', CH: 'Switzerland',
  IT: 'Italy', CZ: 'Czechia', SK: 'Slovakia', PL: 'Poland', HU: 'Hungary', SI: 'Slovenia', LU: 'Luxembourg', HR: 'Croatia' };
export const country = (c) => COUNTRY[c] || c;

export function eventText(e) {
  const d = e.data || {};
  switch (e.type) {
    case 'PICKUP_STARTED':  return { title: 'Loading at pickup', detail: HUBS[d.hub]?.name };
    case 'DEPARTED':        return { title: 'Departed', detail: 'Left the pickup site' };
    case 'BORDER_CROSSED':  return { title: `Crossed into ${country(d.to)}`, detail: `${country(d.from)} → ${country(d.to)}` };
    case 'HOLD_STARTED':    return { title: d.kind === 'customs' ? 'Customs clearance started' : 'Border spot check', detail: 'Vehicle held at border' };
    case 'HOLD_ENDED':      return { title: d.kind === 'customs' ? 'Customs cleared' : 'Spot check completed', detail: `Held ${duration(d.minutes)}` };
    case 'TRAFFIC_JAM':     return { title: 'Traffic congestion', detail: `${d.lengthKm} km slow traffic ahead` };
    case 'BREAK_STARTED':   return { title: 'Driver break', detail: '45 min mandatory break (EU 561/2006)' };
    case 'REST_STARTED':    return { title: 'Daily rest', detail: '11 h rest period (EU 561/2006)' };
    case 'DRIVING_RESUMED': return { title: 'Driving resumed', detail: null };
    case 'TEMP_EXCURSION':  return { title: 'Temperature excursion', detail: `${d.tempC} °C (limit ${d.limitC} °C)` };
    case 'TEMP_RECOVERED':  return { title: 'Temperature back in range', detail: `${d.tempC} °C` };
    case 'ETA_CHANGED':     return { title: 'ETA updated', detail: `${time(d.from)} → ${time(d.to)}` };
    case 'ARRIVED':         return { title: 'Arrived at destination', detail: HUBS[d.hub]?.name };
    case 'DELIVERED':       return { title: 'Delivered', detail: d.signedBy ? `Signed for by ${d.signedBy}` : 'Proof of delivery captured' };
    default:                return { title: e.type, detail: null };
  }
}

// Customer-facing timeline hides internal-only milestones
export const CUSTOMER_EVENTS = new Set(['PICKUP_STARTED', 'DEPARTED', 'BORDER_CROSSED', 'HOLD_STARTED', 'HOLD_ENDED',
  'TEMP_EXCURSION', 'TEMP_RECOVERED', 'ETA_CHANGED', 'ARRIVED', 'DELIVERED']);
