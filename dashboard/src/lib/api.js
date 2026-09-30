// Data access. Same calls and response shapes in both modes:
//   live — the AWS REST API (URL from /config.json written by CDK, or VITE_API_URL)
//   mock — the in-browser simulation (src/sim/mockBackend.js), no AWS needed

let API_URL = '';
let MOCK = true;
let backend = null;

export async function loadConfig() {
  let url = '';
  try {
    const res = await fetch('/config.json', { cache: 'no-store' });
    if (res.ok && res.headers.get('content-type')?.includes('json')) url = (await res.json()).apiUrl || '';
  } catch { /* no runtime config */ }
  url = url || import.meta.env.VITE_API_URL || '';
  API_URL = url.replace(/\/+$/, '');
  MOCK = !API_URL || API_URL.includes('YOUR_API_ID');
  if (MOCK) {
    const { mockBackend } = await import('../sim/mockBackend.js');
    backend = mockBackend();
  }
}

export const isMock = () => MOCK;

async function get(path, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== ''));
  const res = await fetch(`${API_URL}${path}${qs.size ? `?${qs}` : ''}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export const api = {
  listShipments: (params = {}) => (MOCK ? backend.listShipments(params) : get('/shipments', params)),
  getShipment:   (id) => (MOCK ? backend.getShipment(id) : get(`/shipments/${encodeURIComponent(id)}`)),
  metrics:       (params = {}) => (MOCK ? backend.metrics(params) : get('/metrics', params)),
  flag:          (id, isDelayed, reason) => (MOCK ? backend.setFlag(id, isDelayed, reason) : putFlag(id, isDelayed, reason)),
};

// Writes need the operator API key (API Gateway usage plan). It is never bundled
// into the site: the operator pastes it once per browser session.
const KEY_STORAGE = 'tracelane.apiKey';

function apiKey(forcePrompt = false) {
  let key = null;
  try { key = sessionStorage.getItem(KEY_STORAGE); } catch { /* storage blocked */ }
  if (!key || forcePrompt) {
    key = window.prompt('Operator API key required to flag shipments:')?.trim() || null;
    if (key) { try { sessionStorage.setItem(KEY_STORAGE, key); } catch { /* ignore */ } }
  }
  return key;
}

async function putFlag(id, isDelayed, reason) {
  const send = (key) => fetch(`${API_URL}/shipments/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
    body: JSON.stringify(reason ? { isDelayed, delayReason: reason } : { isDelayed }),
  });
  let key = apiKey();
  if (!key) throw new Error('Operator API key required');
  let res = await send(key);
  if (res.status === 403) {
    key = apiKey(true);
    if (!key) throw new Error('Operator API key required');
    res = await send(key);
  }
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
