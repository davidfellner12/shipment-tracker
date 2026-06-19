// src/lib/export.js — CSV/report download utilities (pure browser, no server)

function downloadCSV(filename, rows) {
  const csv = rows
    .map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function ts() { return new Date().toISOString().slice(0, 10); }

// ── Fleet CSV: all live shipments ─────────────────────────────────────────────
export function exportFleetCSV(shipments) {
  const header = [
    'Shipment ID', 'Route', 'Status', 'Progress %', 'Speed (km/h)',
    'ETA (min)', 'Nearest City', 'Cargo', 'Delayed', 'Delay Reason',
    'Priority', 'Cargo Value (€)', 'Weight', 'Origin', 'Destination',
    'Latitude', 'Longitude', 'Last Update',
  ];
  const rows = shipments.map(s => [
    s.shipmentId, s.routeLabel, s.status,
    Math.round(parseFloat(s.progress) * 100),
    parseFloat(s.speedKmh).toFixed(1),
    s.etaMinutes, s.nearestCity, s.cargo,
    s.isDelayed ? 'YES' : 'NO',
    s.delayReason || '',
    s.priority || '', s.cargoValue || '', s.weight || '',
    s.origin || '', s.destination || '',
    parseFloat(s.latitude).toFixed(6), parseFloat(s.longitude).toFixed(6),
    s.timestamp,
  ]);
  downloadCSV(`shiptrack-fleet-${ts()}.csv`, [header, ...rows]);
}

// ── Single shipment report ────────────────────────────────────────────────────
export function exportShipmentCSV(shipment, routeData = {}) {
  const pct = Math.round(parseFloat(shipment.progress) * 100);
  const rows = [
    ['Field', 'Value'],
    ['--- Shipment ---', ''],
    ['Shipment ID',       shipment.shipmentId],
    ['Route',            shipment.routeLabel],
    ['Origin',           routeData.origin || ''],
    ['Destination',      routeData.destination || ''],
    ['Status',           shipment.status],
    ['Priority',         routeData.priority || ''],
    ['Progress',         `${pct}%`],
    ['--- Live Telemetry ---', ''],
    ['Current Speed',    `${parseFloat(shipment.speedKmh).toFixed(1)} km/h`],
    ['ETA',              `${shipment.etaMinutes} min`],
    ['Nearest City',     shipment.nearestCity],
    ['Latitude',         parseFloat(shipment.latitude).toFixed(6)],
    ['Longitude',        parseFloat(shipment.longitude).toFixed(6)],
    ['Last Update',      shipment.timestamp],
    ['--- Cargo ---', ''],
    ['Cargo Type',       routeData.cargo || shipment.cargo],
    ['Cargo Value',      routeData.cargoValue ? `€${routeData.cargoValue.toLocaleString()}` : ''],
    ['Weight',           routeData.weight || ''],
    ['--- Schedule ---', ''],
    ['Departed',         routeData.departedAt || ''],
    ['Scheduled Arrival',routeData.scheduledArrival || ''],
    ['--- Delay ---', ''],
    ['Delayed',          shipment.isDelayed ? 'YES' : 'NO'],
    ['Delay Reason',     shipment.delayReason || ''],
    ['--- Documents ---', ''],
    ...(routeData.documents || []).map((doc, i) => [`Document ${i + 1}`, doc]),
    ['--- Export ---', ''],
    ['Exported At',      new Date().toISOString()],
    ['Exported By',      'ShipTrack Dashboard'],
  ];
  downloadCSV(`shiptrack-${shipment.shipmentId}-${ts()}.csv`, rows);
}

// ── Analytics summary CSV ─────────────────────────────────────────────────────
export function exportAnalyticsCSV(shipments) {
  const delayed   = shipments.filter(s => s.status === 'DELAYED');
  const delivered = shipments.filter(s => s.status === 'DELIVERED');
  const active    = shipments.filter(s => s.status !== 'DELIVERED');
  const onTimeRate = shipments.length ? Math.round(((shipments.length - delayed.length) / shipments.length) * 100) : 100;
  const totalCargoValue = shipments.reduce((a, s) => a + (s.cargoValue || 30000), 0);
  const atRiskValue = delayed.reduce((a, s) => a + (s.cargoValue || 30000), 0);
  const avgSpeed = active.length ? (active.reduce((a, s) => a + parseFloat(s.speedKmh), 0) / active.length).toFixed(1) : 0;
  const MONTHLY_SAVE = Math.round(18000 * 0.65);

  const summaryRows = [
    ['Metric', 'Value'],
    ['Export Date',               new Date().toLocaleString()],
    ['Total Shipments',           shipments.length],
    ['Active (In Transit)',        active.length],
    ['Delayed',                   delayed.length],
    ['Delivered',                 delivered.length],
    ['On-Time Rate',              `${onTimeRate}%`],
    ['Avg Fleet Speed',           `${avgSpeed} km/h`],
    ['Total Cargo Value',         `€${totalCargoValue.toLocaleString()}`],
    ['At-Risk Cargo Value',       `€${atRiskValue.toLocaleString()}`],
    ['Est. Monthly Saving',       `€${MONTHLY_SAVE.toLocaleString()}`],
    ['AWS PoC Cost',              '< $0.05'],
    ['', ''],
    ['--- Per-Shipment Detail ---', ''],
    ['Shipment ID', 'Route', 'Status', 'Progress %', 'Speed', 'ETA', 'Delayed', 'Cargo Value'],
    ...shipments.map(s => [
      s.shipmentId, s.routeLabel, s.status,
      `${Math.round(parseFloat(s.progress) * 100)}%`,
      `${parseFloat(s.speedKmh).toFixed(0)} km/h`,
      `${s.etaMinutes} min`,
      s.isDelayed ? 'YES' : 'NO',
      s.cargoValue ? `€${s.cargoValue.toLocaleString()}` : '€30,000',
    ]),
  ];
  downloadCSV(`shiptrack-analytics-${ts()}.csv`, summaryRows);
}
