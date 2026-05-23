// src/hooks/useShipments.js
import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchShipments } from '../lib/api';

const POLL_MS = Number(import.meta.env.VITE_POLL_INTERVAL) || 4000;

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

  return { shipments, lastUpdated, latencyMs, error, loading };
}
