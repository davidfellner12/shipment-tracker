// JavaScript port of lambda/api/views.py — shipment views + KPI computation for mock mode.
// Keep in sync with the Python original (the source of truth for the deployed API).

const INTERNAL = new Set(['ttl', 'manualDelay', 'delayReason', 'updatedBy', 'manualUpdatedAt', 'etaAtHalfway', 'halfwaySeq']);
const SIGNAL_LOST_AFTER_S = 5 * 60;
const CAUSE_LABELS = { customs: 'Customs clearance', spotCheck: 'Border spot checks', traffic: 'Traffic congestion' };

export const ts = (v) => (v ? Date.parse(v) / 1000 : null);
const num = (v) => (Number.isFinite(+v) ? +v : 0);
const isoDay = (sec) => new Date(sec * 1000).toISOString().slice(0, 10);
const isoSec = (sec) => new Date(sec * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');

export function delayMinutes(item) {
  const planned = ts(item.plannedDeliveryAt), actual = ts(item.deliveredAt || item.etaAt);
  return planned == null || actual == null ? null : Math.round((actual - planned) / 60);
}

export function shipmentView(item, realNow) {
  const view = Object.fromEntries(Object.entries(item).filter(([k]) => !INTERNAL.has(k)));
  const delivered = item.status === 'DELIVERED';
  const delay = delayMinutes(item);
  view.delayMin = delay;
  view.onTime = delivered && delay != null ? delay <= 0 : null;
  view.flag = item.manualDelay ? { reason: item.delayReason || 'Flagged by operator', at: item.manualUpdatedAt } : null;

  const exceptions = [];
  if (!delivered) {
    if (delay != null && delay > 0) exceptions.push('LATE_RISK');
    const c = item.cargo || {}, temp = item.reeferTempC;
    if (temp != null && c.tempMinC != null && !(c.tempMinC <= temp && temp <= c.tempMaxC)) exceptions.push('TEMP_EXCURSION');
    if (item.status === 'BORDER_HOLD') exceptions.push('BORDER_HOLD');
    const seen = ts(item.lastSeenAt);
    if (seen && realNow - seen > SIGNAL_LOST_AFTER_S) exceptions.push('SIGNAL_LOST');
  }
  if (item.manualDelay && !delivered) exceptions.push('FLAGGED');
  view.exceptions = exceptions;
  const critical = exceptions.includes('TEMP_EXCURSION') || exceptions.includes('SIGNAL_LOST')
    || (exceptions.includes('LATE_RISK') && (delay || 0) > 120);
  view.severity = critical ? 'critical' : exceptions.length ? 'warning' : 'ok';
  return view;
}

export function clock(items) {
  let max = null;
  for (const i of items) { const t = ts(i.simTime); if (t != null && (max == null || t > max)) max = t; }
  return max ?? Date.now() / 1000;
}

export function computeMetrics(allItems, days = 30, customerId = null) {
  const now = clock(allItems), since = now - days * 86400;
  const items = customerId ? allItems.filter((i) => i.customerId === customerId) : allItems;
  const active = items.filter((i) => i.status !== 'DELIVERED');
  const delivered = items.filter((i) => i.status === 'DELIVERED' && (ts(i.deliveredAt) || 0) >= since);

  const delays = delivered.map(delayMinutes);
  const onTime = delays.filter((d) => d != null && d <= 0);
  const late = delays.filter((d) => d != null && d > 0);
  const etaErr = delivered.filter((i) => i.etaAtHalfway).map((i) => Math.abs(ts(i.deliveredAt) - ts(i.etaAtHalfway)) / 60);
  const tot = (i, k) => num((i.totals || {})[k]);
  const tkmOf = (i) => num(i.distanceKm) * num((i.cargo || {}).tonnes);
  const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);

  const tkm = sum(delivered, tkmOf), co2 = sum(delivered, (i) => tot(i, 'co2eKg'));
  const km = sum(delivered, (i) => num(i.distanceKm));
  const cost = sum(delivered, (i) => tot(i, 'fuelEur') + tot(i, 'tollEur'));
  const transit = delivered.filter((i) => i.departedAt).map((i) => (ts(i.deliveredAt) - ts(i.departedAt)) / 3600);
  const reefer = delivered.filter((i) => (i.cargo || {}).tempMinC != null);
  const excursed = reefer.filter((i) => tot(i, 'tempExcursions') > 0);

  const daily = new Map();
  for (let d = days - 1; d >= 0; d--) daily.set(isoDay(now - d * 86400), { delivered: 0, onTime: 0, late: 0, co2eKg: 0 });
  delivered.forEach((i, idx) => {
    const row = daily.get(isoDay(ts(i.deliveredAt)));
    if (!row) return;
    row.delivered += 1;
    const d = delays[idx];
    row[d != null && d <= 0 ? 'onTime' : 'late'] += 1;
    row.co2eKg += tot(i, 'co2eKg');
  });

  const group = (keyFn, labelFn) => {
    const groups = new Map();
    for (const i of delivered) { const k = keyFn(i); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); }
    return [...groups.entries()].map(([key, grp]) => {
      const ds = grp.map(delayMinutes), gTkm = sum(grp, tkmOf), gCo2 = sum(grp, (i) => tot(i, 'co2eKg'));
      return {
        key, label: labelFn(grp[0]), shipments: grp.length,
        onTimeRate: Math.round((ds.filter((d) => d != null && d <= 0).length / grp.length) * 1000) / 1000,
        avgTransitHours: Math.round((sum(grp.filter((i) => i.departedAt), (i) => (ts(i.deliveredAt) - ts(i.departedAt)) / 3600) / grp.length) * 10) / 10,
        co2eKg: Math.round(gCo2), gCo2ePerTkm: gTkm ? Math.round((gCo2 * 1000) / gTkm) : null,
        costEur: Math.round(sum(grp, (i) => tot(i, 'fuelEur') + tot(i, 'tollEur'))),
      };
    }).sort((a, b) => b.shipments - a.shipments);
  };

  const causes = Object.fromEntries(Object.entries(CAUSE_LABELS).map(([k, label]) => [k, { cause: label, minutes: 0, shipments: 0 }]));
  for (const i of delivered) {
    for (const [k, m] of Object.entries((i.totals || {}).holdMin || {})) {
      if (causes[k] && num(m) > 0) { causes[k].minutes += Math.round(num(m)); causes[k].shipments += 1; }
    }
  }

  const buckets = [['≤ 15 min', 15], ['≤ 30 min', 30], ['≤ 1 h', 60], ['≤ 2 h', 120], ['> 2 h', Infinity]];
  let prev = -1;
  const etaAccuracy = buckets.map(([bucket, hi]) => {
    const n = etaErr.filter((e) => prev < e && e <= hi).length; prev = hi; return { bucket, shipments: n };
  });

  const statusCounts = {};
  for (const i of active) statusCounts[i.status] = (statusCounts[i.status] || 0) + 1;
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 1000 : null);

  return {
    generatedAt: isoSec(now), window: { days, from: isoSec(since) }, customerId,
    kpis: {
      active: active.length,
      atRisk: active.filter((i) => (delayMinutes(i) || 0) > 0).length,
      delivered: delivered.length,
      onTimeRate: pct(onTime.length, onTime.length + late.length),
      avgLateMin: late.length ? Math.round(sum(late, (x) => x) / late.length) : 0,
      etaMaeMin: etaErr.length ? Math.round(sum(etaErr, (x) => x) / etaErr.length) : null,
      etaWithin30Rate: pct(etaErr.filter((e) => e <= 30).length, etaErr.length),
      co2eKg: Math.round(co2), gCo2ePerTkm: tkm ? Math.round((co2 * 1000) / tkm) : null,
      distanceKm: Math.round(km), tonneKm: Math.round(tkm),
      avgTransitHours: transit.length ? Math.round((sum(transit, (x) => x) / transit.length) * 10) / 10 : null,
      costEur: Math.round(cost), costPerKmEur: km ? Math.round((cost / km) * 100) / 100 : null,
      reeferShipments: reefer.length, tempExcursionRate: pct(excursed.length, reefer.length),
      cargoValueEur: Math.round(sum(delivered, (i) => num((i.cargo || {}).valueEur))),
    },
    statusCounts,
    daily: [...daily.entries()].map(([date, r]) => ({ date, ...r, co2eKg: Math.round(r.co2eKg) })),
    lanes: group((i) => i.laneId, (i) => i.routeLabel).slice(0, 12),
    customers: customerId ? [] : group((i) => i.customerId, (i) => i.customerName),
    fuelMix: group((i) => i.fuelType, (i) => i.fuelType),
    delayCauses: Object.values(causes).sort((a, b) => b.minutes - a.minutes),
    etaAccuracy,
  };
}
