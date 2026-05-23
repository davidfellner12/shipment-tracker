// src/components/MapView.jsx
import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

// Status → color mapping
const STATUS_COLOR = {
  IN_TRANSIT:    '#00e5ff',
  ARRIVING_SOON: '#39ff14',
  DELAYED:       '#ff1744',
  DELIVERED:     '#39ff14',
};

function makeIcon(color, size = 14) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size * 2}" height="${size * 2}" viewBox="0 0 ${size * 2} ${size * 2}">
    <circle cx="${size}" cy="${size}" r="${size - 2}" fill="${color}22" stroke="${color}" stroke-width="1.5"/>
    <circle cx="${size}" cy="${size}" r="4" fill="${color}"/>
  </svg>`;
  return L.divIcon({
    html: `<div style="position:relative;width:${size * 2}px;height:${size * 2}px">
      ${svg}
      <div style="
        position:absolute;top:50%;left:50%;
        transform:translate(-50%,-50%);
        width:${size * 2}px;height:${size * 2}px;
        border-radius:50%;
        border:1px solid ${color};
        animation:pulse-ring 1.8s ease-out infinite;
        opacity:0.6;
      "></div>
    </div>`,
    className: '',
    iconSize: [size * 2, size * 2],
    iconAnchor: [size, size],
  });
}

export default function MapView({ shipments, selectedId }) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const markersRef   = useRef({});
  const popupsRef    = useRef({});

  // Initialise map once
  useEffect(() => {
    if (mapRef.current) return;
    mapRef.current = L.map(containerRef.current, {
      center: [49.5, 13.5],
      zoom: 5,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
    }).addTo(mapRef.current);
  }, []);

  // Update markers whenever shipments change
  useEffect(() => {
    if (!mapRef.current || !shipments.length) return;
    const map = mapRef.current;

    shipments.forEach((ship) => {
      const lat = parseFloat(ship.latitude);
      const lon = parseFloat(ship.longitude);
      if (isNaN(lat) || isNaN(lon)) return;

      const color = STATUS_COLOR[ship.status] || '#00e5ff';
      const isSelected = ship.shipmentId === selectedId;
      const icon = makeIcon(color, isSelected ? 18 : 12);

      if (markersRef.current[ship.shipmentId]) {
        markersRef.current[ship.shipmentId]
          .setLatLng([lat, lon])
          .setIcon(icon);
      } else {
        const pct = Math.round(parseFloat(ship.progress) * 100);
        const marker = L.marker([lat, lon], { icon })
          .addTo(map)
          .bindPopup(
            `<div style="font-family:'Barlow Condensed',sans-serif;min-width:160px;">
              <b style="font-size:15px;color:#00e5ff;">${ship.shipmentId}</b><br/>
              <span style="color:#7a9bb5;font-size:12px;">${ship.routeLabel}</span><br/>
              <hr style="border-color:#1e2d3d;margin:6px 0"/>
              <div style="font-size:12px;">
                <b>Status:</b> ${ship.status}<br/>
                <b>Near:</b> ${ship.nearestCity}<br/>
                <b>Cargo:</b> ${ship.cargo}<br/>
                <b>Progress:</b> ${pct}%<br/>
                <b>Speed:</b> ${parseFloat(ship.speedKmh).toFixed(0)} km/h<br/>
                <b>ETA:</b> ${ship.etaMinutes} min
              </div>
            </div>`,
            { className: 'dark-popup' }
          );
        markersRef.current[ship.shipmentId] = marker;
      }
    });
  }, [shipments, selectedId]);

  // Pan to selected
  useEffect(() => {
    if (!mapRef.current || !selectedId) return;
    const ship = shipments.find(s => s.shipmentId === selectedId);
    if (!ship) return;
    const lat = parseFloat(ship.latitude);
    const lon = parseFloat(ship.longitude);
    if (!isNaN(lat) && !isNaN(lon)) {
      mapRef.current.setView([lat, lon], 7, { animate: true, duration: 0.6 });
      markersRef.current[selectedId]?.openPopup();
    }
  }, [selectedId]);

  return (
    <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
      {/* Scan-line effect */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1000, pointerEvents: 'none',
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,229,255,0.015) 2px, rgba(0,229,255,0.015) 4px)',
      }} />
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
