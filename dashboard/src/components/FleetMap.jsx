// Vector map (MapLibre + OpenFreeMap tiles — free, no API key, commercial use OK).
// Trucks animate smoothly between telemetry updates; the selected shipment's
// road route is drawn as driven (solid) + remaining (dashed).
import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { LANES } from '../sim/engine.js';
import { useSession } from '../lib/session';

const STYLE = { light: 'https://tiles.openfreemap.org/styles/positron', dark: 'https://tiles.openfreemap.org/styles/dark' };
const COLORS = {
  light: { ok: '#4f46e5', idle: '#94a3b8', warning: '#fab219', critical: '#d03b3b', done: '#0ca30c', ring: '#ffffff', route: '#4f46e5' },
  dark:  { ok: '#818cf8', idle: '#64748b', warning: '#fab219', critical: '#d03b3b', done: '#0ca30c', ring: '#111827', route: '#818cf8' },
};
const PAUSED = new Set(['BREAK', 'REST', 'LOADING', 'UNLOADING']);

function lanePart(laneId, fromKm, toKm) {
  const lane = LANES[laneId];
  if (!lane) return [];
  const pts = [];
  const [la, lo] = lane.position(fromKm);
  pts.push([lo, la]);
  for (let i = 0; i < lane.cum.length; i++) if (lane.cum[i] > fromKm && lane.cum[i] < toKm) pts.push(lane.coords[i]);
  const [lb, lob] = lane.position(toKm);
  pts.push([lob, lb]);
  return pts;
}

const line = (coords) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} });
const fc = (features) => ({ type: 'FeatureCollection', features });

function kind(s) {
  if (s.status === 'DELIVERED') return 'done';
  if (s.severity === 'critical') return 'critical';
  if (s.severity === 'warning') return 'warning';
  return PAUSED.has(s.status) ? 'idle' : 'ok';
}

export default function FleetMap({ shipments = [], selectedId, onSelect, showLanes = true, fit = 'all', className, interactive = true }) {
  const { dark } = useSession();
  const el = useRef(null), map = useRef(null), ready = useRef(false);
  const positions = useRef(new Map());      // id → [lon, lat] currently drawn
  const anim = useRef(null);
  const latest = useRef({ shipments, selectedId });
  latest.current = { shipments, selectedId, onSelect };
  const fitted = useRef(null);

  // create map once
  useEffect(() => {
    const m = new maplibregl.Map({
      container: el.current, style: STYLE[dark ? 'dark' : 'light'],
      center: [11.5, 48.6], zoom: 4.6, attributionControl: { compact: true },
      interactive, dragRotate: false, pitchWithRotate: false,
    });
    if (interactive) m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.current = m;
    const onLoad = () => { addLayers(m, dark); ready.current = true; draw(true); };
    m.on('style.load', onLoad);
    m.on('error', (e) => console.error('Map error:', e.error?.message || e));
    m.on('click', 'trucks', (e) => latest.current.onSelect?.(e.features[0].properties.id));
    m.on('mouseenter', 'trucks', () => { m.getCanvas().style.cursor = 'pointer'; });
    m.on('mouseleave', 'trucks', () => { m.getCanvas().style.cursor = ''; });
    return () => { cancelAnimationFrame(anim.current); m.remove(); map.current = null; ready.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // theme switch → new basemap style, layers re-added on style.load
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    ready.current = false;
    m.setStyle(STYLE[dark ? 'dark' : 'light']);
    m.once('style.load', () => { addLayers(m, dark); ready.current = true; draw(true); });
  }, [dark]);

  useEffect(() => { if (ready.current) draw(false); });

  function addLayers(m, isDark) {
    const c = COLORS[isDark ? 'dark' : 'light'];
    for (const id of ['lanes', 'route-done', 'route-todo', 'trucks']) {
      if (!m.getSource(id)) m.addSource(id, { type: 'geojson', data: fc([]) });
    }
    m.addLayer({ id: 'lanes', type: 'line', source: 'lanes', paint: { 'line-color': c.route, 'line-width': 2, 'line-opacity': 0.28 } });
    m.addLayer({ id: 'route-todo', type: 'line', source: 'route-todo', layout: { 'line-cap': 'round' },
      paint: { 'line-color': c.route, 'line-width': 3, 'line-dasharray': [1.5, 1.5], 'line-opacity': 0.8 } });
    m.addLayer({ id: 'route-done', type: 'line', source: 'route-done', layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': c.route, 'line-width': 4 } });
    m.addLayer({ id: 'trucks', type: 'circle', source: 'trucks', paint: {
      'circle-radius': ['case', ['get', 'selected'], 9, 6.5],
      'circle-color': ['match', ['get', 'kind'], 'critical', c.critical, 'warning', c.warning, 'idle', c.idle, 'done', c.done, c.ok],
      'circle-stroke-color': c.ring, 'circle-stroke-width': 2.5,
    } });
    m.addLayer({ id: 'truck-labels', type: 'symbol', source: 'trucks', minzoom: 5.5,
      layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-offset': [0, 1.4], 'text-anchor': 'top',
        'text-font': ['Noto Sans Regular'], 'text-allow-overlap': false },
      paint: { 'text-color': isDark ? '#cbd5e1' : '#475569', 'text-halo-color': c.ring, 'text-halo-width': 1.5 } });
  }

  function draw(instant) {
    const m = map.current;
    if (!m) return;
    const { shipments: list, selectedId: sel } = latest.current;

    // lanes of all visible shipments (faint network)
    const laneIds = showLanes ? [...new Set(list.filter((s) => s.status !== 'DELIVERED').map((s) => s.laneId))] : [];
    m.getSource('lanes')?.setData(fc(laneIds.map((id) => line(LANES[id]?.coords || []))));

    const selected = list.find((s) => s.shipmentId === sel);
    if (selected && LANES[selected.laneId]) {
      const km = selected.distanceDoneKm, total = LANES[selected.laneId].km;
      m.getSource('route-done')?.setData(fc([line(lanePart(selected.laneId, 0, km))]));
      m.getSource('route-todo')?.setData(fc([line(lanePart(selected.laneId, km, total))]));
    } else {
      m.getSource('route-done')?.setData(fc([]));
      m.getSource('route-todo')?.setData(fc([]));
    }

    // fit bounds once per selection / dataset
    const fitKey = fit === 'selected' && selected ? selected.shipmentId : fit === 'all' ? `all:${list.length > 0}` : null;
    if (fitKey && fitted.current !== fitKey && list.length) {
      fitted.current = fitKey;
      const coords = fit === 'selected' && selected ? LANES[selected.laneId]?.coords || [] : list.map((s) => [s.longitude, s.latitude]);
      if (coords.length) {
        const b = coords.reduce((bb, c) => bb.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
        m.fitBounds(b, { padding: 60, maxZoom: 8, duration: instant ? 0 : 600 });
      }
    }

    // animate trucks from their drawn position to the new one
    const targets = new Map(list.map((s) => [s.shipmentId, [s.longitude, s.latitude]]));
    const from = new Map(positions.current);
    const start = performance.now(), dur = instant ? 0 : 900;
    cancelAnimationFrame(anim.current);
    const frame = (t) => {
      const k = dur ? Math.min(1, (t - start) / dur) : 1;
      const feats = list.map((s) => {
        const to = targets.get(s.shipmentId), f = from.get(s.shipmentId) || to;
        const pos = [f[0] + (to[0] - f[0]) * k, f[1] + (to[1] - f[1]) * k];
        positions.current.set(s.shipmentId, pos);
        return { type: 'Feature', geometry: { type: 'Point', coordinates: pos },
          properties: { id: s.shipmentId, label: s.shipmentId, kind: kind(s), selected: s.shipmentId === sel } };
      });
      feats.sort((a, b) => a.properties.selected - b.properties.selected);
      m.getSource('trucks')?.setData(fc(feats));
      if (k < 1) anim.current = requestAnimationFrame(frame);
    };
    anim.current = requestAnimationFrame(frame);
  }

  // MapLibre forces position:relative on its container, so size a wrapper instead
  return (
    <div className={className} role="region" aria-label="Map of shipments">
      <div ref={el} className="h-full w-full" />
    </div>
  );
}
