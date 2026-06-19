// src/lib/api.js
import { ROUTES_DATA, mockLiveState, lerp } from './mockData.js';

const API_URL  = import.meta.env.VITE_API_URL || '';
const USE_MOCK = !API_URL || API_URL.includes('YOUR_API_ID');

function noise() { return (Math.random() - 0.5) * 0.009; }

function buildMockShipment(id) {
  const r    = ROUTES_DATA[id];
  const prog = mockLiveState.progress[id];
  const lat  = lerp(r.originLat, r.destLat, prog) + noise();
  const lon  = lerp(r.originLon, r.destLon, prog) + noise();

  const isDelayed = !!r.delayed;
  let status = 'IN_TRANSIT';
  if (prog >= 1)        status = 'DELIVERED';
  else if (isDelayed)   status = 'DELAYED';
  else if (prog > 0.88) status = 'ARRIVING_SOON';

  const speed    = isDelayed ? 22 + Math.random() * 18 : 68 + Math.random() * 22;
  const remKm    = r.distanceKm * (1 - prog);
  const etaMin   = Math.round((remKm / speed) * 60);

  const cityList = r.waypoints;
  const cityIdx  = Math.min(cityList.length - 1, Math.floor(prog * cityList.length));

  // Advance for next tick
  if (prog < 1) {
    const inc = (isDelayed ? 0.003 : 0.008) * (0.85 + Math.random() * 0.3);
    mockLiveState.progress[id] = Math.min(1, prog + inc);
  }

  return {
    shipmentId:    id,
    timestamp:     new Date().toISOString(),
    latitude:      lat.toFixed(6),
    longitude:     lon.toFixed(6),
    status,
    nearestCity:   cityList[cityIdx],
    cargo:         r.cargo,
    routeLabel:    r.label,
    speedKmh:      speed.toFixed(1),
    etaMinutes:    etaMin,
    progress:      mockLiveState.progress[id].toFixed(3),
    isDelayed,
    priority:      r.priority,
    distanceKm:    r.distanceKm,
    cargoValue:    r.cargoValue,
    weight:        r.weight,
    origin:        r.origin,
    destination:   r.destination,
    driverId:      r.driverId,
    coordId:       r.coordId,
    customerId:    r.customerId,
    vehicleId:     r.vehicleId,
    delayReason:   r.delayReason || null,
  };
}

export async function fetchShipments() {
  if (USE_MOCK) {
    await new Promise(r => setTimeout(r, 120 + Math.random() * 150));
    return Object.keys(ROUTES_DATA).map(buildMockShipment);
  }
  const res = await fetch(`${API_URL}/shipments`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  return data.shipments || [];
}

// PUT /shipments/{id} — toggle delay flag for live demo
export async function updateShipmentDelay(id, isDelayed, reason = '') {
  if (USE_MOCK) {
    await new Promise(r => setTimeout(r, 80 + Math.random() * 60));
    const route = ROUTES_DATA[id];
    if (route) {
      route.delayed     = isDelayed;
      route.delayReason = isDelayed ? (reason || 'Manually flagged via dashboard') : undefined;
    }
    return { updated: id };
  }
  const res = await fetch(`${API_URL}/shipments/${id}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ isDelayed, delayReason: reason || undefined }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export function isMockMode() { return USE_MOCK; }
