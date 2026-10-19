// Printable shipment documents (CMR, invoice, packing list, customs, ADR, reefer log, POD),
// generated from the shipment data and opened in a new tab: print or save as PDF from there.
// Every document is marked as a specimen: all companies and shipments are fictional.
import { BRAND, CARRIER, dateTime, eventText, eur, num } from './format';

const esc = (v) => String(v ?? '—').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const party = (title, p) => `
  <div class="box"><div class="lbl">${title}</div>
    <div class="strong">${esc(p?.name)}</div><div>${esc(p?.site)}</div><div>${esc(p?.city)}</div></div>`;

const table = (head, rows) => `
  <table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
  <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

const goods = (s) => table(
  ['Goods', 'HS code', 'Packaging', 'Pallets', 'Gross weight', ...(s.cargo?.adr ? ['ADR'] : [])],
  [[s.cargo?.type, s.cargo?.hsCode, s.cargo?.packaging, s.cargo?.pallets, `${num(s.cargo?.tonnes)} t`,
    ...(s.cargo?.adr ? [`Class ${s.cargo.adr.class} · ${s.cargo.adr.un}`] : [])]],
);

const transport = (s) => `
  <div class="grid3">
    <div class="box"><div class="lbl">Carrier</div><div class="strong">${esc(CARRIER)}</div><div>Vehicle ${esc(s.plate)}</div><div>Driver ${esc(s.driverName)}</div></div>
    <div class="box"><div class="lbl">Taking over the goods</div><div>${esc(s.originName)}</div><div>${esc(dateTime(s.departedAt || s.plannedPickupAt))}</div></div>
    <div class="box"><div class="lbl">Place of delivery</div><div>${esc(s.destinationName)}</div><div>Planned ${esc(dateTime(s.plannedDeliveryAt))}</div></div>
  </div>`;

const signatures = (labels) => `
  <div class="grid3 sign">${labels.map((l) => `<div><div class="line"></div><div class="lbl">${esc(l)}</div></div>`).join('')}</div>`;

function body(kind, s, events) {
  const parties = `<div class="grid2">${party('Sender / shipper', s.shipper)}${party('Consignee', s.consignee)}</div>`;
  switch (kind) {
    case 'cmr':
      return `${parties}${transport(s)}${goods(s)}
        <p class="small">Carriage under the Convention on the Contract for the International Carriage of Goods by Road (CMR). Order ${esc(s.orderRef)}.</p>
        ${signatures(['Sender', 'Carrier', 'Consignee'])}`;
    case 'invoice': {
      const value = s.cargo?.valueEur || 0;
      return `${parties}
        ${table(['Description', 'HS code', 'Quantity', 'Value'], [[s.cargo?.type, s.cargo?.hsCode, `${s.cargo?.pallets} pallets · ${num(s.cargo?.tonnes)} t`, eur(value)]])}
        <p class="total">Total value of goods: ${esc(eur(value))} · Incoterms DAP ${esc(s.destinationName)}</p>
        ${signatures(['Issued by the shipper'])}`;
    }
    case 'packing':
      return `${parties}
        ${table(['Pallet', 'Goods', 'Packaging', 'Weight'], Array.from({ length: s.cargo?.pallets || 0 }, (_, i) =>
          [`${i + 1} / ${s.cargo.pallets}`, s.cargo.type, s.cargo.packaging, `${num((s.cargo.tonnes * 1000) / s.cargo.pallets)} kg`]))}`;
    case 'ead':
    case 't1':
      return `${parties}${transport(s)}${goods(s)}
        <p class="small">${kind === 'ead' ? 'Export accompanying document' : 'Union transit (T1)'} · route ${esc(s.routeLabel)} ·
        customs offices on the border crossings of this lane. Movement reference ${esc(`${s.cmrNo}-${kind.toUpperCase()}`)}.</p>
        ${signatures(['Declarant', 'Customs office'])}`;
    case 'adr':
      return `${parties}${goods(s)}
        <p class="small">Dangerous goods: ${esc(s.cargo?.adr?.un)}, class ${esc(s.cargo?.adr?.class)}. Vehicle ${esc(s.plate)} carries the
        orange plates and the instructions in writing; driver ${esc(s.driverName)} holds an ADR certificate.</p>
        ${signatures(['Consignor', 'Driver'])}`;
    case 'reefer': {
      const t = s.totals || {};
      return `<p>Set range ${esc(s.cargo?.tempMinC)} … ${esc(s.cargo?.tempMaxC)} °C · current ${esc(s.reeferTempC)} °C ·
        maximum ${esc(t.maxTempC ?? '—')} °C · ${esc(t.tempExcursions || 0)} excursion(s), ${esc(t.tempExcursionMin || 0)} min out of range.</p>
        ${table(['Time', 'Event', 'Detail'], events.map((e) => { const x = eventText(e); return [dateTime(e.at), x.title, x.detail || ''] }))}`;
    }
    case 'pod':
      return `${parties}${goods(s)}
        <div class="grid2"><div class="box"><div class="lbl">Delivered</div><div class="strong">${esc(dateTime(s.deliveredAt))}</div><div>${esc(s.destinationName)}</div></div>
        <div class="box"><div class="lbl">Signed by</div><div class="strong">${esc(s.pod?.signedBy)}</div><div>${esc(s.pod?.remarks)}</div></div></div>
        ${signatures(['Consignee (electronic signature)'])}`;
    default:
      return `${parties}${goods(s)}`;
  }
}

export function docKind(name) {
  if (name.startsWith('CMR')) return 'cmr';
  if (name.startsWith('Commercial invoice')) return 'invoice';
  if (name.startsWith('Packing list')) return 'packing';
  if (name.startsWith('Export declaration')) return 'ead';
  if (name.startsWith('Transit document')) return 't1';
  if (name.startsWith('ADR')) return 'adr';
  if (name.startsWith('Reefer')) return 'reefer';
  return 'other';
}

export function openDocument(shipment, name, events = []) {
  const kind = name === 'Proof of delivery' ? 'pod' : docKind(name);
  const s = shipment;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(name)} · ${esc(s.shipmentId)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: #111827; max-width: 800px; margin: 24px auto; padding: 0 16px; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 16px; }
  h1 { font-size: 20px; margin: 0; } .meta { text-align: right; font-size: 12px; color: #4b5563; }
  .grid2, .grid3 { display: grid; gap: 10px; margin-bottom: 12px; } .grid2 { grid-template-columns: 1fr 1fr; } .grid3 { grid-template-columns: 1fr 1fr 1fr; }
  .box { border: 1px solid #d1d5db; border-radius: 6px; padding: 8px 10px; }
  .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; margin-bottom: 2px; }
  .strong { font-weight: 600; } .small { font-size: 11px; color: #4b5563; } .total { font-weight: 600; text-align: right; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 12px; } th, td { border: 1px solid #d1d5db; padding: 5px 8px; text-align: left; font-size: 12px; }
  th { background: #f3f4f6; font-weight: 600; }
  .sign { margin-top: 36px; } .line { border-bottom: 1px solid #9ca3af; height: 28px; margin-bottom: 4px; }
  .specimen { margin-top: 28px; font-size: 10px; color: #9ca3af; text-align: center; }
  .bar { position: sticky; top: 0; background: #fff; padding: 8px 0; text-align: right; } .bar button { font: inherit; padding: 6px 14px; border-radius: 6px; border: 1px solid #111827; background: #111827; color: #fff; cursor: pointer; }
  @media print { .bar { display: none; } body { margin: 0; } }
</style></head><body>
<div class="bar"><button onclick="print()">Print / Save as PDF</button></div>
<header><div><h1>${esc(name)}</h1><div class="small">${esc(s.routeLabel)} · ${esc(s.customerName)}</div></div>
  <div class="meta"><div><b>${esc(s.cmrNo)}</b></div><div>Shipment ${esc(s.shipmentId)}</div><div>Order ${esc(s.orderRef)}</div><div>Issued ${esc(dateTime(s.departedAt || s.plannedPickupAt))}</div></div></header>
${body(kind, s, events)}
<div class="specimen">Specimen generated by the ${esc(BRAND)} demo. All companies, people and shipments are fictional.</div>
</body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
