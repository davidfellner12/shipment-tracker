// Walk through the live Tracelane app and save screenshots with red explanations.
// Usage (from the repo root, needs `npm ci` in report/ and the simulator running):
//   node presentation/demo-walkthrough/capture.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// playwright-core is installed for the report build; reuse it from there
const { chromium } = createRequire(new URL('../../report/package.json', import.meta.url))('playwright-core');
const out = fileURLToPath(new URL('.', import.meta.url));
const BASE = 'https://d1wmhpibcpn9mb.cloudfront.net';
const RED = '#e3061b';

let browser;
for (const channel of ['msedge', 'chrome']) { try { browser = await chromium.launch({ channel }); break; } catch {} }
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });

// --- target helpers: each returns a Playwright locator --------------------------------
const card = (text) => page.getByText(text, { exact: true }).first().locator('xpath=ancestor::*[contains(concat(" ",@class," ")," card ")][1]');
const panel = (title) => page.locator('section.card', { has: page.locator('h2', { hasText: new RegExp(`^${title}$`) }) }).first();
const el = (text) => page.getByText(text, { exact: true }).first();
const css = (sel) => page.locator(sel).first();

async function box(target) {
  if (Array.isArray(target)) {               // union of several targets
    const bs = (await Promise.all(target.map(box))).filter(Boolean);
    const x = Math.min(...bs.map(b => b.x)), y = Math.min(...bs.map(b => b.y));
    return { x, y, width: Math.max(...bs.map(b => b.x + b.width)) - x, height: Math.max(...bs.map(b => b.y + b.height)) - y };
  }
  return target.boundingBox();
}

async function shot(file, title, notes, { fullPage = false } = {}) {
  await page.evaluate(() => document.querySelectorAll('.demo-anno').forEach(e => e.remove()));
  const items = [];
  for (const [i, n] of notes.entries()) {
    const b = await box(n.target).catch(() => null);
    if (!b) { console.warn(`  ! ${file}: target for note ${i + 1} not found`); continue; }
    items.push({ ...n, target: undefined, b, num: i + 1 });
  }
  await page.evaluate(({ title, items, RED }) => {
    const sx = window.scrollX, sy = window.scrollY, W = document.documentElement.scrollWidth;
    const add = (style, html = '') => {
      const d = document.createElement('div');
      d.className = 'demo-anno';
      d.style.cssText = `position:absolute;z-index:99999;pointer-events:none;font:600 14px/1.35 "Segoe UI",system-ui,sans-serif;${style}`;
      d.innerHTML = html;
      document.body.appendChild(d);
      return d;
    };
    add(`left:${16 + sx}px;top:${380 + sy}px;width:223px;box-sizing:border-box;color:#fff;background:${RED};padding:10px 14px;border-radius:8px;font-size:17px;box-shadow:0 2px 8px rgba(0,0,0,.25)`, title);
    for (const it of items) {
      const { x, y, width: w, height: h } = it.b;
      add(`left:${x + sx - 4}px;top:${y + sy - 4}px;width:${w + 8}px;height:${h + 8}px;border:3px solid ${RED};border-radius:10px;box-sizing:border-box`);
      const badge = `<span style="display:inline-block;min-width:22px;height:22px;border-radius:11px;background:${RED};color:#fff;text-align:center;margin-right:6px;line-height:22px">${it.num}</span>`;
      const lbl = add(`max-width:${it.width || 380}px;color:${RED};background:#fff;border:2px solid ${RED};border-radius:8px;padding:6px 10px;box-shadow:0 3px 12px rgba(0,0,0,.18)`, badge + it.text);
      const lw = lbl.offsetWidth, lh = lbl.offsetHeight;
      const pos = {
        below: [x, y + h + 10], above: [x, y - lh - 10], right: [x + w + 12, y],
        left: [x - lw - 12, y], inside: [x + 10, y + 10], 'inside-bottom': [x + 10, y + h - lh - 10],
        'inside-right': [x + w - lw - 14, y + 12],
      }[it.at || 'below'];
      if (it.pos) pos[0] = it.pos[0], pos[1] = it.pos[1];
      lbl.style.left = Math.max(8, Math.min(pos[0] + sx, W - lw - 8)) + 'px';
      lbl.style.top = Math.max(8, pos[1] + sy) + 'px';
    }
  }, { title, items, RED });
  await page.screenshot({ path: `${out}/${file}`, fullPage });
  console.log('wrote', file);
}

async function open(path, waitFor) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  if (waitFor) await page.getByText(waitFor, { exact: true }).first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(2500);                        // let the map and charts settle
}

// --- 1. Overview -------------------------------------------------------------------------
await open('/app', 'Needs attention');
await shot('01-overview.png', 'Step 2 · Operator view: the control tower', [
  { target: [card('Active shipments'), card('Cargo value moved · 30 d')], at: 'below', width: 560,
    pos: [640, 40], text: 'KPIs come from GET /metrics: the api Lambda computes on-time %, ETA accuracy and CO₂e from the DynamoDB tables' },
  { target: css('.maplibregl-canvas'), at: 'inside-bottom', width: 430,
    text: 'Each dot is a truck. Its position travels IoT Core → SQS → Lambda → DynamoDB; the dashboard polls the API every 2 s' },
  { target: card('Needs attention'), at: 'inside-bottom', width: 330,
    text: 'Exceptions: the ETA (with EU driving-time rules) is later than the plan → "Late risk"' },
  { target: el('Live · AWS pipeline').locator('xpath=ancestor::div[2]'), at: 'above', width: 220,
    text: 'Live mode: data from the deployed AWS API, not the in-browser mock' },
]);

// --- 2. Shipments list ---------------------------------------------------------------------
await open('/app/shipments', 'Shipment');
const row = page.locator('tbody tr', { hasText: 'In transit' }).first();
await shot('02-shipments.png', 'Step 4 · Pick an in-transit shipment', [
  { target: [css('thead'), row], pos: [600, 28], width: 480,
    text: 'One item per shipment in the Shipments table: current position, status, ETA vs. plan. Click a row to open it' },
  { target: [el('Live'), el('History')], pos: [1100, 28], width: 320,
    text: 'Live = on the road now · History = delivered in the last 90 days (DynamoDB TTL)' },
]);

// --- 3. Shipment detail ----------------------------------------------------------------------
await row.click();
await page.getByText('Milestones', { exact: true }).first().waitFor({ timeout: 20000 });
await page.waitForTimeout(2500);
const shipmentId = page.url().split('/').pop();
await shot('03-shipment-detail.png', 'Step 4 · Shipment detail: flag it, share it', [
  { target: [page.getByRole('button', { name: /Share tracking link/ }), page.getByRole('button', { name: /Flag shipment/ })], at: 'left', width: 500,
    text: '<b>Flag</b>: PUT /shipments/{id} through API Gateway, needs the operator API key; the next GPS ping does not reset it. <b>Share</b>: copies the public link for the customer' },
  { target: panel('Milestones'), at: 'left', width: 300,
    text: 'Timeline from the ShipmentEvents table: key shipmentId + sort key time#seq, read with one Query' },
]);

// --- 4. Public tracking page ---------------------------------------------------------------
await open(`/track/${shipmentId}`);
await shot('04-track.png', 'Step 4 · What the customer sees', [
  { target: css('main'), at: 'inside-right', width: 420,
    text: 'Public tracking page: no login, only this one shipment, live ETA. This replaces the "where is my order?" phone call' },
]);

// --- 5. System -----------------------------------------------------------------------------
await open('/app/system', 'Data flow');
await shot('05-system.png', 'Step 3 · Latency proof', [
  { target: [card('Ingest latency p50'), card('Ingest latency p95')], pos: [530, 20], width: 520,
    text: 'The Lambda stamps every message: device send time → DynamoDB write. Target: under 5 s end-to-end (+ 2 s dashboard poll)' },
  { target: [card('Trucks reporting'), card('Last message')], pos: [1070, 20], width: 350,
    text: 'Health check: every truck is transmitting and data is fresh' },
  { target: panel('Data flow'), at: 'inside-right', width: 560,
    text: 'The whole pipeline is serverless and defined in one CDK stack. A bad message goes to the SQS dead-letter queue (step 5)' },
  { target: panel('Running cost'), at: 'inside-right', width: 420,
    text: 'Pay-per-use: no servers. Whole AWS run ≈ $0.25 estimated (step 6)' },
]);

// --- 6. Analytics --------------------------------------------------------------------------
await open('/app/analytics', 'Lanes');
await shot('06-analytics.png', 'Optional · Analytics (30-day history)', [
  { target: [card('On-time delivery'), card('Energy + tolls')], pos: [620, 30], width: 420,
    text: 'Computed from delivered shipments kept 90 days in DynamoDB' },
  { target: panel('ETA accuracy'), at: 'inside-right', width: 380,
    text: 'ETA error by trip progress: driving-time rules make the ETA ~8× better than distance ÷ speed' },
]);

// --- 7. Fleet ------------------------------------------------------------------------------
await open('/app/fleet', 'Vehicle');
await shot('07-fleet.png', 'Optional · Fleet', [
  { target: [el('Driving left today'), el('Until break')], pos: [1040, 28], width: 380,
    text: 'EU driving-time rules (4.5 h → 45 min break, 9 h/day) feed the ETA' },
]);

await browser.close();
