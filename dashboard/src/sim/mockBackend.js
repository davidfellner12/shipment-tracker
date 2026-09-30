// In-browser stand-in for the AWS backend (IoT → Kinesis → Lambda → DynamoDB → API).
// Runs the fleet simulation, "ingests" its telemetry exactly like process_event does,
// and answers the same API calls with the same response shapes.
import { Fleet } from './engine.js';
import { shipmentView, computeMetrics, clock, ts } from './views.js';

const BACKFILL_DAYS = 30;
const DAY = 86400;
const TICK_MS = 1000;
// Real time by default: the simulated clock equals the wall clock, so ETAs are real
// times and every tab/reload sees the same shipments (shareable tracking links).
// Add ?speed=30 to the URL to fast-forward for a lively demo.
const SPEED = (() => {
  try { return Math.min(600, Math.max(1, Number(new URLSearchParams(window.location.search).get('speed')) || 1)); }
  catch { return 1; }
})();

class MockBackend {
  constructor() {
    // Anchor history to UTC midnight so it is identical for every page load that day
    const start = Math.floor(Date.now() / 1000 / DAY) * DAY - BACKFILL_DAYS * DAY;
    this.fleet = new Fleet({ seed: 20260428, start });
    this.items = new Map();   // shipmentId → stored item (like the Shipments table)
    this.events = new Map();  // shipmentId → events (like the ShipmentEvents table)
    const target = Date.now() / 1000;
    while (this.fleet.now + 900 <= target) {
      this.fleet.advance(15);
      this.ingest(this.fleet.messages({ significantOnly: true }));
    }
    this.fleet.advance((target - this.fleet.now) / 60);
    this.ingest(this.fleet.messages());
    setInterval(() => this.tick(), TICK_MS);
  }

  tick() {
    this.fleet.advance(((TICK_MS / 1000) * SPEED) / 60);
    this.ingest(this.fleet.messages());
  }

  ingest(msgs) {
    const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    for (const msg of msgs) {
      const { events, schema, ...state } = msg;
      if (events?.length) {
        const list = this.events.get(msg.shipmentId) || [];
        list.push(...events);
        this.events.set(msg.shipmentId, list);
      }
      const prev = this.items.get(msg.shipmentId);
      if (prev && prev.seq >= msg.seq) continue;                       // idempotent, like the Lambda
      const item = { ...prev, ...state, lastSeenAt: nowIso, ingestLatencyMs: 40 + Math.round(Math.random() * 60) };
      if (msg.progress >= 0.5 && msg.status !== 'DELIVERED' && !item.etaAtHalfway) item.etaAtHalfway = msg.etaAt;
      this.items.set(msg.shipmentId, item);
    }
  }

  all() { return [...this.items.values()]; }

  listShipments({ customerId, scope, days = 30 } = {}) {
    let items = this.all();
    const nowSim = clock(items), realNow = Date.now() / 1000;
    if (customerId) items = items.filter((i) => i.customerId === customerId);
    if (scope === 'history') {
      const since = nowSim - days * 86400;
      items = items.filter((i) => i.status === 'DELIVERED' && ts(i.deliveredAt) >= since)
        .sort((a, b) => (b.deliveredAt || '').localeCompare(a.deliveredAt || ''));
    } else {
      items = items.filter((i) => i.status !== 'DELIVERED' || ts(i.deliveredAt) >= nowSim - 86400)
        .sort((a, b) => a.shipmentId.localeCompare(b.shipmentId));
    }
    const shipments = items.map((i) => shipmentView(i, realNow));
    return { shipments, count: shipments.length, simTime: new Date(nowSim * 1000).toISOString() };
  }

  getShipment(id) {
    const item = this.items.get(id);
    if (!item) return null;
    return { shipment: shipmentView(item, Date.now() / 1000), events: [...(this.events.get(id) || [])] };
  }

  metrics({ customerId, days = 30 } = {}) { return computeMetrics(this.all(), days, customerId || null); }

  setFlag(id, isDelayed, reason) {
    const item = this.items.get(id);
    if (!item) throw new Error('Shipment not found');
    item.manualDelay = isDelayed;
    item.manualUpdatedAt = new Date().toISOString();
    if (isDelayed) item.delayReason = reason || 'Manually flagged by operator';
    else delete item.delayReason;
    return { updated: id, isDelayed };
  }

  vehicles() { return this.fleet.vehicles; }
}

let instance = null;
export const mockBackend = () => (instance ??= new MockBackend());
