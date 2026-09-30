// JavaScript port of simulator/engine.py — used by the in-browser mock backend.
// Keep the operational model in sync with the Python original (the source of truth).
import network from '../../../shared/network.json';
import params from '../../../shared/params.json';
import catalog from '../../../shared/catalog.json';

export { network, params, catalog };

const ID_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export const iso = (tsSec) => new Date(tsSec * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bisectRight(arr, x) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (x < arr[mid]) hi = mid; else lo = mid + 1; }
  return lo;
}

export class Lane {
  constructor(raw) {
    Object.assign(this, { id: raw.id, src: raw.from, dst: raw.to, label: raw.label, km: raw.distanceKm,
      coords: raw.coords, cum: raw.cumKm, segments: raw.segments });
  }
  position(km) {
    const i = Math.max(0, Math.min(bisectRight(this.cum, km) - 1, this.cum.length - 2));
    const span = (this.cum[i + 1] - this.cum[i]) || 1e-9;
    const t = Math.max(0, Math.min(1, (km - this.cum[i]) / span));
    const [x1, y1] = this.coords[i], [x2, y2] = this.coords[i + 1];
    const lon = x1 + (x2 - x1) * t, lat = y1 + (y2 - y1) * t;
    const dx = (x2 - x1) * Math.PI / 180 * Math.cos(((y1 + y2) / 2) * Math.PI / 180);
    const heading = (Math.atan2(dx, (y2 - y1) * Math.PI / 180) * 180 / Math.PI + 360) % 360;
    return [lat, lon, heading];
  }
  country(km) {
    for (const s of this.segments) if (km < s.endKm) return s.country;
    return this.segments[this.segments.length - 1].country;
  }
  crossingsAfter(km) {
    const out = [];
    for (let i = 1; i < this.segments.length; i++)
      if (this.segments[i].startKm > km) out.push([this.segments[i - 1].country, this.segments[i].country]);
    return out;
  }
}

export const LANES = Object.fromEntries(network.lanes.map((l) => [l.id, new Lane(l)]));

export class Fleet {
  constructor({ seed = 1, start = Date.now() / 1000 } = {}) {
    this.random = mulberry32(seed);
    this.now = start;
    this.carry = 0;
    this.vehicles = catalog.vehicles.map((spec) => ({
      ...spec, hub: spec.home, mode: 'IDLE', modeUntil: 0, sinceBreakMin: 0, todayMin: 0, shipment: null, outbox: [],
    }));
    for (const v of this.vehicles) {
      v.modeUntil = this.now + this.uniform(0, 720) * 60;
      v.todayMin = this.uniform(0, 500);
      v.sinceBreakMin = this.uniform(0, Math.min(200, v.todayMin));
    }
  }

  // ── random helpers ──
  uniform(a, b) { return a + (b - a) * this.random(); }
  rand([a, b]) { return this.uniform(a, b); }
  choice(arr) { return arr[Math.floor(this.random() * arr.length)]; }
  gauss(mu, sigma) {
    const u = 1 - this.random(), w = this.random();
    return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w);
  }
  newId() {
    const yy = new Date(this.now * 1000).getUTCFullYear().toString().slice(2);
    let s = '';
    for (let i = 0; i < 5; i++) s += this.choice(ID_ALPHABET);
    return `AFL-${yy}-${s}`;
  }

  // ── jobs & planning ──
  pickJob(v) {
    const maxKm = params.fuel[v.fuel].maxLaneKm ?? Infinity;
    let lanes = Object.values(LANES).filter((l) => l.src === v.hub && l.km <= maxKm);
    if (!lanes.length) lanes = [Object.values(LANES).filter((l) => l.src === v.hub).sort((a, b) => a.km - b.km)[0]];
    const options = [];
    for (const lane of lanes) {
      for (const [cid, c] of Object.entries(catalog.customers)) {
        const w = c.hubs.includes(lane.src) && c.hubs.includes(lane.dst) ? 3
          : c.hubs.includes(lane.src) || c.hubs.includes(lane.dst) ? 1 : 0;
        for (const cargo of c.cargo) {
          if (w && (!cargo.tempC || v.reefer)) for (let i = 0; i < w; i++) options.push([lane, cid, cargo]);
        }
      }
    }
    if (!options.length) {
      const pool = Object.entries(catalog.customers).flatMap(([k, c]) => c.cargo.filter((cg) => !cg.tempC).map((cg) => [k, cg]));
      options.push([this.choice(lanes), ...this.choice(pool)]);
    }
    return this.choice(options);
  }

  party(cust, hub, index) {
    const city = network.hubs[hub].name;
    if (cust.sites[hub]) return { name: cust.name, site: cust.sites[hub], city };
    const pool = catalog.consignees[hub];
    return { name: pool[index % pool.length], site: `Receiving dock, ${city}`, city };
  }

  documents(lane, cargo) {
    const docs = ['CMR consignment note', 'Commercial invoice', 'Packing list'];
    if (lane.crossingsAfter(0).some(([a, b]) => this.isCustoms(a, b))) docs.push('Export declaration (EAD)', 'Transit document T1');
    if (cargo.adr) docs.push(`ADR transport document (class ${cargo.adr.class}, ${cargo.adr.un})`);
    if (cargo.tempC) docs.push('Reefer temperature log');
    return docs;
  }

  randint(a, b) { return a + Math.floor(this.random() * (b - a + 1)); }

  startShipment(v) {
    const [lane, cid, cargo] = this.pickJob(v);
    const cust = catalog.customers[cid];
    const temp = cargo.tempC;
    const yy = new Date(this.now * 1000).getUTCFullYear().toString().slice(2);
    const s = {
      shipmentId: this.newId(), seq: 0, customerId: cid, laneId: lane.id,
      orderRef: `PO-${cid.slice(5)}-${this.randint(100000, 999999)}`,
      cmrNo: `CMR-${yy}-${this.randint(1000000, 9999999)}`,
      shipper: this.party(cust, lane.src, this.randint(0, 8)),
      consignee: this.party(cust, lane.dst, this.randint(0, 8)),
      documents: this.documents(lane, cargo),
      pod: null,
      cargo: {
        type: cargo.type, hsCode: cargo.hsCode, packaging: cargo.packaging, adr: cargo.adr ?? null,
        tonnes: Math.round(this.rand(cargo.tonnes) * 10) / 10,
        pallets: Math.floor(this.rand(cargo.pallets)),
        valueEur: Math.floor(this.rand(cargo.valueEur) / 100) * 100,
        tempMinC: temp ? temp[0] : null, tempMaxC: temp ? temp[1] : null,
      },
      km: 0, status: 'LOADING', plannedPickupAt: this.now + 45 * 60, departedAt: null, deliveredAt: null,
      reeferTempC: temp ? (temp[0] + temp[1]) / 2 : null, fault: null, excursion: false, jam: null, hold: null,
      etaBaseline: null, halfwayFlag: false, speedKmh: 0,
      totals: { co2eKg: 0, fuelUnits: 0, fuelEur: 0, tollEur: 0, holdMin: { customs: 0, spotCheck: 0, traffic: 0 },
        breakMin: 0, restMin: 0, tempExcursionMin: 0, tempExcursions: 0, maxTempC: null },
      events: [],
    };
    v.shipment = s;
    const drive = this.driveMinutes(lane, 0);
    const wait = this.hosWait(drive, v.sinceBreakMin, v.todayMin);
    const drivePlanned = drive * params.planningTrafficFactor;   // allowance for congestion
    const customs = lane.crossingsAfter(0).filter(([a, b]) => this.isCustoms(a, b)).length;
    s.plannedDeliveryAt = s.plannedPickupAt + (drivePlanned + wait + customs * 60 + 45 + this.rand(cust.slackMin) * params.bookingSlackFactor) * 60;
    v.mode = 'LOADING';
    v.modeUntil = this.now + this.rand(params.operations.loadingMin) * 60;
    this.event(v, 'PICKUP_STARTED', { hub: lane.src });
  }

  cruise(country) { return Math.min((params.truckSpeedLimitKmh[country] ?? 80) + 4, 89); }
  isCustoms(a, b) { const cc = params.borders.customsCountries; return cc.includes(a) || cc.includes(b); }

  driveMinutes(lane, fromKm) {
    const urban = params.urbanKm, urbanV = params.urbanSpeedKmh;
    let total = 0;
    for (const seg of lane.segments) {
      const a = Math.max(seg.startKm, fromKm), b = seg.endKm;
      if (b > a) total += (b - a) / this.cruise(seg.country) * 60;
    }
    for (const [start, end] of [[fromKm, urban], [Math.max(fromKm, lane.km - urban), lane.km]]) {
      if (end > start) total += (end - start) * (60 / urbanV - 60 / this.cruise(lane.country(start)));
    }
    return total;
  }

  // Mirrors the decision order of drive() exactly (see simulator/engine.py _hos_wait)
  hosWait(driveMin, since, today) {
    const h = params.hos;
    let wait = 0;
    while (driveMin > 1e-9) {
      const extend = driveMin <= h.extendedDailyDrivingMin - today;
      if (today >= h.maxDailyDrivingMin && !extend) { wait += h.dailyRestMin; since = 0; today = 0; continue; }
      if (since >= h.maxContinuousDrivingMin) { wait += h.breakMin; since = 0; continue; }
      let step = Math.min(driveMin, h.maxContinuousDrivingMin - since);
      if (today < h.maxDailyDrivingMin) step = Math.min(step, h.maxDailyDrivingMin - today);
      driveMin -= step; since += step; today += step;
    }
    return wait;
  }

  event(v, type, data) {
    const s = v.shipment, lane = LANES[s.laneId];
    const [lat, lon] = lane.position(s.km);
    s.events.push({ type, at: iso(this.now), lat: +lat.toFixed(5), lon: +lon.toFixed(5), country: lane.country(s.km),
      ...(data ? { data } : {}) });
  }

  eta(v) {
    const s = v.shipment, lane = LANES[s.laneId];
    let t = this.now, since = v.sinceBreakMin, today = v.todayMin;
    if (['LOADING', 'BREAK', 'REST', 'HOLD'].includes(v.mode)) {
      t = Math.max(t, v.modeUntil);
      if (v.mode === 'BREAK') since = 0;
      if (v.mode === 'REST') { since = 0; today = 0; }
    }
    if (v.mode === 'UNLOADING') return Math.max(v.modeUntil, this.now);
    const drive = this.driveMinutes(lane, s.km);
    const wait = this.hosWait(drive, since, today);
    const customs = lane.crossingsAfter(s.km).filter(([a, b]) => this.isCustoms(a, b)).length;
    return t + (drive + wait + customs * 60 + 45) * 60;
  }

  // ── simulation ──
  advance(minutes) {
    this.carry += minutes;
    const steps = Math.floor(this.carry + 1e-9);
    this.carry -= steps;
    for (let i = 0; i < steps; i++) {
      this.now += 60;
      for (const v of this.vehicles) this.step(v);
    }
  }

  step(v) {
    const s = v.shipment, mode = v.mode, ops = params.operations;
    if (mode === 'IDLE') { if (this.now >= v.modeUntil) this.startShipment(v); return; }
    if (s) this.reefer(v);
    if (mode === 'DRIVING') { this.drive(v); return; }

    if (mode === 'BREAK') s.totals.breakMin += 1;
    else if (mode === 'REST') s.totals.restMin += 1;
    else if (mode === 'HOLD') s.totals.holdMin[s.hold] += 1;
    if (this.now < v.modeUntil) return;

    if (mode === 'LOADING') {
      s.status = 'IN_TRANSIT'; s.departedAt = this.now; v.mode = 'DRIVING';
      this.event(v, 'DEPARTED');
      s.etaBaseline = this.eta(v);
    } else if (mode === 'BREAK' || mode === 'REST') {
      v.sinceBreakMin = 0;
      if (mode === 'REST') v.todayMin = 0;
      v.mode = 'DRIVING'; s.status = 'IN_TRANSIT';
      this.event(v, 'DRIVING_RESUMED');
    } else if (mode === 'HOLD') {
      this.event(v, 'HOLD_ENDED', { kind: s.hold, minutes: Math.round(s.holdLen) });
      s.hold = null; v.mode = 'DRIVING'; s.status = 'IN_TRANSIT';
    } else if (mode === 'UNLOADING') {
      s.status = 'DELIVERED'; s.deliveredAt = this.now;
      s.pod = { signedBy: this.choice(catalog.signatories), at: iso(this.now),
        remarks: s.totals.tempExcursions ? 'Accepted, temperature log attached' : 'Received in good condition' };
      this.event(v, 'DELIVERED', { pallets: s.cargo.pallets, signedBy: s.pod.signedBy });
      v.outbox.push(s);
      v.hub = LANES[s.laneId].dst;
      v.shipment = null;
      v.mode = 'TURNAROUND'; v.modeUntil = this.now + this.rand(ops.turnaroundMin) * 60;
    } else if (mode === 'TURNAROUND') {
      v.sinceBreakMin = 0;
      v.mode = 'IDLE'; v.modeUntil = this.now;
    }
  }

  drive(v) {
    const s = v.shipment, lane = LANES[s.laneId], p = params, tr = params.traffic;
    const country = lane.country(s.km);
    const nearCity = s.km < tr.nearCityKm || s.km > lane.km - tr.nearCityKm;
    const hour = (new Date(this.now * 1000).getUTCHours() + 1) % 24;
    const rush = tr.rushHours.some(([a, b]) => a <= hour && hour < b);

    if (s.jam && s.km >= s.jam.untilKm) s.jam = null;
    if (!s.jam) {
      const chance = nearCity && rush ? tr.jamChancePerHourNearCity : tr.jamChancePerHourOpenRoad;
      if (this.random() < chance / 60) {
        const length = this.rand(tr.jamLengthKm);
        s.jam = { untilKm: s.km + length, speed: this.rand(tr.jamSpeedKmh) };
        this.event(v, 'TRAFFIC_JAM', { lengthKm: Math.round(length * 10) / 10 });
      }
    }
    let speed;
    if (s.jam) {
      speed = s.jam.speed;
      s.totals.holdMin.traffic += Math.max(0, 1 - speed / this.cruise(country));
    } else if (s.km < p.urbanKm || s.km > lane.km - p.urbanKm) {
      speed = p.urbanSpeedKmh + this.gauss(0, 4);
    } else {
      speed = this.cruise(country) + this.gauss(0, 2.5);
    }
    speed = Math.max(5, speed);
    s.speedKmh = speed;

    const before = s.km;
    s.km = Math.min(lane.km, s.km + speed / 60);
    const dkm = s.km - before;
    const f = p.fuel[v.fuel];
    const units = (f.baseper100km + f.perTonne * s.cargo.tonnes) / 100 * dkm;
    const t = s.totals;
    t.fuelUnits += units; t.co2eKg += units * f.kgCo2ePerUnit; t.fuelEur += units * f.eurPerUnit;
    t.tollEur += (p.tollEurPerKm[country] ?? 0.2) * dkm;

    v.sinceBreakMin += 1; v.todayMin += 1;
    if (!s.halfwayFlag && s.km >= lane.km / 2) { s.halfwayFlag = true; s.halfway = true; }

    const newCountry = lane.country(s.km);
    if (newCountry !== country) {
      this.event(v, 'BORDER_CROSSED', { from: country, to: newCountry });
      const b = p.borders;
      let hold = null, minutes = 0;
      if (this.isCustoms(country, newCountry)) { hold = 'customs'; minutes = this.rand(b.customsHoldMin); }
      else if (b.spotCheckCountries.includes(newCountry) && this.random() < b.spotCheckChance) {
        hold = 'spotCheck'; minutes = this.rand(b.spotCheckHoldMin);
      }
      if (hold) {
        s.hold = hold; s.holdLen = minutes; s.status = 'BORDER_HOLD';
        v.mode = 'HOLD'; v.modeUntil = this.now + minutes * 60;
        this.event(v, 'HOLD_STARTED', { kind: hold });
        return;
      }
    }
    if (s.km >= lane.km) {
      s.status = 'UNLOADING'; s.speedKmh = 0;
      v.mode = 'UNLOADING'; v.modeUntil = this.now + this.rand(p.operations.unloadingMin) * 60;
      this.event(v, 'ARRIVED', { hub: lane.dst });
      return;
    }
    const h = p.hos;
    const extend = this.driveMinutes(lane, s.km) <= h.extendedDailyDrivingMin - v.todayMin;
    if (v.todayMin >= h.maxDailyDrivingMin && !extend) {
      s.status = 'REST'; s.speedKmh = 0; v.mode = 'REST'; v.modeUntil = this.now + h.dailyRestMin * 60;
      this.event(v, 'REST_STARTED');
    } else if (v.sinceBreakMin >= h.maxContinuousDrivingMin) {
      s.status = 'BREAK'; s.speedKmh = 0; v.mode = 'BREAK'; v.modeUntil = this.now + h.breakMin * 60;
      this.event(v, 'BREAK_STARTED');
    }
    if (Math.floor(this.now / 60) % 15 === 0 && s.etaBaseline) {
      const eta = this.eta(v);
      if (Math.abs(eta - s.etaBaseline) >= p.operations.etaChangeEventMin * 60) {
        this.event(v, 'ETA_CHANGED', { from: iso(s.etaBaseline), to: iso(eta) });
        s.etaBaseline = eta;
      }
    }
  }

  reefer(v) {
    const s = v.shipment, c = s.cargo;
    if (c.tempMinC == null) return;
    const r = params.reefer, lo = c.tempMinC, hi = c.tempMaxC, setpoint = (lo + hi) / 2;
    if (s.fault) {
      s.reeferTempC += r.faultDriftCPerHour / 60;
      if (this.now >= s.fault) s.fault = null;
    } else {
      s.reeferTempC += (setpoint - s.reeferTempC) * 0.08 + this.gauss(0, r.noiseC * 0.3);
      if (v.mode === 'DRIVING' && this.random() < r.faultChancePerHour / 60)
        s.fault = this.now + this.rand(r.faultDurationMin) * 60;
    }
    const temp = s.reeferTempC, out = temp > hi || temp < lo, t = s.totals;
    if (out) {
      t.tempExcursionMin += 1;
      t.maxTempC = Math.round(Math.max(t.maxTempC ?? temp, temp) * 10) / 10;
      if (!s.excursion) {
        s.excursion = true; t.tempExcursions += 1;
        this.event(v, 'TEMP_EXCURSION', { tempC: Math.round(temp * 10) / 10, limitC: temp > hi ? hi : lo });
      }
    } else if (s.excursion) {
      s.excursion = false;
      this.event(v, 'TEMP_RECOVERED', { tempC: Math.round(temp * 10) / 10 });
    }
  }

  // ── messages (same schema as the Python simulator publishes to IoT Core) ──
  message(v, s, sentAt) {
    const lane = LANES[s.laneId], cust = catalog.customers[s.customerId];
    const [lat, lon, heading] = lane.position(s.km);
    s.seq += 1;
    const done = s.status === 'DELIVERED', t = s.totals, r1 = (x) => Math.round(x * 10) / 10;
    const msg = {
      schema: 2, shipmentId: s.shipmentId, seq: s.seq, sentAt: iso(sentAt), simTime: iso(this.now),
      customerId: s.customerId, customerName: cust.name, laneId: lane.id, routeLabel: lane.label,
      origin: lane.src, destination: lane.dst,
      originName: network.hubs[lane.src].name, destinationName: network.hubs[lane.dst].name,
      vehicleId: v.id, plate: v.plate, vehicleModel: v.model, fuelType: v.fuel,
      driverId: v.driver, driverName: catalog.drivers[v.driver].name,
      orderRef: s.orderRef, cmrNo: s.cmrNo, shipper: s.shipper, consignee: s.consignee,
      documents: s.documents, pod: s.pod,
      cargo: { ...s.cargo }, status: s.status,
      latitude: +lat.toFixed(5), longitude: +lon.toFixed(5), heading: Math.round(heading),
      speedKmh: v.mode === 'DRIVING' && !done ? r1(s.speedKmh) : 0,
      country: lane.country(s.km), distanceKm: lane.km, distanceDoneKm: r1(s.km),
      progress: Math.round((s.km / lane.km) * 10000) / 10000,
      plannedPickupAt: iso(s.plannedPickupAt), plannedDeliveryAt: iso(s.plannedDeliveryAt),
      departedAt: s.departedAt ? iso(s.departedAt) : null,
      etaAt: iso(done ? s.deliveredAt : this.eta(v)),
      deliveredAt: done ? iso(s.deliveredAt) : null,
      reeferTempC: s.reeferTempC != null ? r1(s.reeferTempC) : null,
      driving: { sinceBreakMin: Math.round(v.sinceBreakMin), todayMin: Math.round(v.todayMin) },
      totals: {
        co2eKg: r1(t.co2eKg), fuelUnits: r1(t.fuelUnits), fuelUnit: params.fuel[v.fuel].unit,
        fuelEur: Math.round(t.fuelEur * 100) / 100, tollEur: Math.round(t.tollEur * 100) / 100,
        holdMin: Object.fromEntries(Object.entries(t.holdMin).map(([k, x]) => [k, Math.round(x)])),
        breakMin: Math.round(t.breakMin), restMin: Math.round(t.restMin),
        tempExcursionMin: Math.round(t.tempExcursionMin), tempExcursions: t.tempExcursions, maxTempC: t.maxTempC,
      },
      events: s.events,
    };
    s.events = [];
    s.halfway = false;
    s.lastPub = this.now;
    return msg;
  }

  messages({ sentAt = Date.now() / 1000, significantOnly = false, heartbeatMin = 120 } = {}) {
    const out = [];
    for (const v of this.vehicles) {
      for (const s of v.outbox) out.push(this.message(v, s, sentAt));
      v.outbox = [];
      const s = v.shipment;
      if (!s) continue;
      if (significantOnly && !(s.events.length || s.halfway || this.now - (s.lastPub ?? 0) >= heartbeatMin * 60)) continue;
      out.push(this.message(v, s, sentAt));
    }
    return out;
  }
}
