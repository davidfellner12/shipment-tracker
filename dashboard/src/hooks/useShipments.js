// src/hooks/useShipments.js
import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchShipments, updateShipmentDelay } from '../lib/api';

// 2 s polling: pipeline latency ~1–2 s + poll overhead 0–2 s = ≤4 s total.
// Satisfies the <5 s end-to-end latency target stated in the 1-pager.
const POLL_MS = Number(import.meta.env.VITE_POLL_INTERVAL) || 2000;

export function useShipments() {
  const [shipments, setShipments]     = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [latencyMs, setLatencyMs]     = useState(null);
  const [error, setError]             = useState(null);
  const [loading, setLoading]         = useState(true);
  const timerRef = useRef(null);

  const poll = useCallback(async () => {
    const t0 = performance.now();
    try {
      const data = await fetchShipments();
      setShipments(data);
      setLastUpdated(new Date());
      setLatencyMs(Math.round(performance.now() - t0));
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    poll();
    timerRef.current = setInterval(poll, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [poll]);

  // Toggle delay on a single shipment then immediately refresh
  const updateDelay = useCallback(async (id, isDelayed, reason) => {
    await updateShipmentDelay(id, isDelayed, reason);
    await poll();
  }, [poll]);

  return { shipments, lastUpdated, latencyMs, error, loading, updateDelay };
}
