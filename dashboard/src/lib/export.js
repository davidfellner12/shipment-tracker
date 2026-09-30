// CSV export (UTF-8 with BOM so Excel detects the encoding; RFC 4180 quoting)
export function downloadCsv(filename, rows, columns) {
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map(([, header]) => esc(header)).join(',')];
  for (const r of rows) lines.push(columns.map(([get]) => esc(typeof get === 'function' ? get(r) : r[get])).join(','));
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const SHIPMENT_COLUMNS = [
  ['shipmentId', 'Shipment'],
  ['orderRef', 'Order ref'],
  ['cmrNo', 'CMR no.'],
  ['customerName', 'Customer'],
  [(s) => s.shipper?.site, 'Pickup site'],
  [(s) => s.consignee?.name, 'Consignee'],
  [(s) => s.consignee?.site, 'Delivery site'],
  ['routeLabel', 'Lane'],
  ['status', 'Status'],
  [(s) => s.cargo?.type, 'Cargo'],
  [(s) => s.cargo?.hsCode, 'HS code'],
  [(s) => s.cargo?.adr ? `${s.cargo.adr.class} ${s.cargo.adr.un}` : '', 'ADR'],
  [(s) => s.cargo?.tonnes, 'Weight (t)'],
  [(s) => s.cargo?.pallets, 'Pallets'],
  ['distanceKm', 'Distance (km)'],
  ['plannedDeliveryAt', 'Planned delivery (UTC)'],
  [(s) => s.deliveredAt || s.etaAt, 'Delivered / ETA (UTC)'],
  ['delayMin', 'Delay (min)'],
  [(s) => (s.onTime == null ? '' : s.onTime ? 'yes' : 'no'), 'On time'],
  [(s) => s.totals?.co2eKg, 'CO2e (kg)'],
  [(s) => s.totals?.tempExcursions, 'Temp excursions'],
  ['plate', 'Vehicle'],
  [(s) => s.pod?.signedBy, 'POD signed by'],
];
