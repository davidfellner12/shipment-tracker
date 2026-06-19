// src/App.jsx — page router
import React, { useState } from 'react';
import LandingPage      from './pages/LandingPage';
import FleetPage        from './pages/FleetPage';
import AnalyticsPage    from './pages/AnalyticsPage';
import ArchitecturePage from './pages/ArchitecturePage';
import { useShipments } from './hooks/useShipments';

export default function App() {
  const [page, setPage] = useState('landing');
  const { shipments, lastUpdated, latencyMs, error, loading, updateDelay } = useShipments();

  const navigate = (target) => setPage(target);
  const enterDashboard = () => setPage('fleet');

  // Shared data props passed to every page that needs live data
  const dataProps = { shipments, lastUpdated, latencyMs, error, loading, updateDelay, onNavigate: navigate };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {page === 'landing'       && <LandingPage      onEnter={enterDashboard} />}
      {page === 'fleet'         && <FleetPage        {...dataProps} />}
      {page === 'analytics'     && <AnalyticsPage    {...dataProps} />}
      {page === 'architecture'  && <ArchitecturePage {...dataProps} />}
    </div>
  );
}
