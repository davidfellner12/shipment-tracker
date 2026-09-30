import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import Landing from './pages/Landing';
import Overview from './pages/Overview';
import Shipments from './pages/Shipments';
import ShipmentDetail from './pages/ShipmentDetail';
import Analytics from './pages/Analytics';
import Fleet from './pages/Fleet';
import System from './pages/System';
import Track from './pages/Track';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/track/:id" element={<Track />} />
      <Route path="/app" element={<AppShell />}>
        <Route index element={<Overview />} />
        <Route path="shipments" element={<Shipments />} />
        <Route path="shipments/:id" element={<ShipmentDetail />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="fleet" element={<Fleet />} />
        <Route path="system" element={<System />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
