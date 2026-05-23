// src/lib/mockData.js
// Rich mock data — 10 shipments across Europe with full metadata

export const CONTACTS = {
  'DRV-001': { name: 'Thomas Bauer',     phone: '+43 664 112 3344', email: 'tbauer@logix-eu.com',      role: 'Driver',           avatar: 'TB' },
  'DRV-002': { name: 'Marek Novák',      phone: '+43 660 987 6543', email: 'mnovak@logix-eu.com',      role: 'Driver',           avatar: 'MN' },
  'DRV-003': { name: 'Piotr Wiśniewski', phone: '+48 501 234 567',  email: 'pwisniewski@logix-eu.com', role: 'Driver',           avatar: 'PW' },
  'DRV-004': { name: 'Hans Müller',      phone: '+49 171 445 6677', email: 'hmuller@logix-eu.com',     role: 'Driver',           avatar: 'HM' },
  'DRV-005': { name: 'Sophie Lefèvre',   phone: '+33 612 345 678',  email: 'slefevre@logix-eu.com',    role: 'Driver',           avatar: 'SL' },
  'DRV-006': { name: 'Jan Kovář',        phone: '+420 777 123 456', email: 'jkovar@logix-eu.com',      role: 'Driver',           avatar: 'JK' },
  'DRV-007': { name: 'Luca Ferretti',    phone: '+39 333 456 7890', email: 'lferretti@logix-eu.com',   role: 'Driver',           avatar: 'LF' },
  'DRV-008': { name: 'Anna Schmidt',     phone: '+43 699 321 0987', email: 'aschmidt@logix-eu.com',    role: 'Driver',           avatar: 'AS' },
  'DRV-009': { name: 'Zsolt Horváth',    phone: '+36 30 567 8901',  email: 'zhorvath@logix-eu.com',    role: 'Driver',           avatar: 'ZH' },
  'DRV-010': { name: 'Elena Popescu',    phone: '+40 722 334 455',  email: 'epopescu@logix-eu.com',    role: 'Driver',           avatar: 'EP' },
};

export const COORDINATORS = {
  'COORD-AT': { name: 'Markus Gruber',   phone: '+43 1 505 1234',   email: 'mgruber@logix-eu.com',     role: 'Logistics Coord.', avatar: 'MG', region: 'Austria / Germany' },
  'COORD-PL': { name: 'Katarzyna Wójcik',phone: '+48 22 456 7890',  email: 'kwojcik@logix-eu.com',     role: 'Logistics Coord.', avatar: 'KW', region: 'Poland / Czech Rep.' },
  'COORD-FR': { name: 'Éric Dupont',     phone: '+33 1 42 68 1234', email: 'edupont@logix-eu.com',     role: 'Logistics Coord.', avatar: 'ED', region: 'France / Switzerland' },
  'COORD-IT': { name: 'Giulia Ricci',    phone: '+39 06 123 4567',  email: 'gricci@logix-eu.com',      role: 'Logistics Coord.', avatar: 'GR', region: 'Italy / Balkans' },
};

export const CUSTOMERS = {
  'CUST-001': { name: 'Siemens AG',          contact: 'Klaus Weber',      phone: '+49 89 636-00',     email: 'k.weber@siemens.com',       industry: 'Industrial Electronics' },
  'CUST-002': { name: 'BMW Group',            contact: 'Petra Hofmann',    phone: '+49 89 382-0',      email: 'p.hofmann@bmwgroup.com',     industry: 'Automotive' },
  'CUST-003': { name: 'Medicover Poland',     contact: 'Aleksandra Kowal', phone: '+48 22 678-9000',   email: 'a.kowal@medicover.pl',       industry: 'Healthcare' },
  'CUST-004': { name: 'Novartis Pharma AG',   contact: 'Stefan Braun',     phone: '+41 61 324-1111',   email: 's.braun@novartis.com',       industry: 'Pharmaceuticals' },
  'CUST-005': { name: 'Carrefour France',     contact: 'Marie Dubois',     phone: '+33 1 41 04-26-00', email: 'm.dubois@carrefour.fr',      industry: 'Retail / FMCG' },
  'CUST-006': { name: 'Škoda Auto',           contact: 'Pavel Černý',      phone: '+420 326 811 111',  email: 'p.cerny@skoda-auto.cz',      industry: 'Automotive' },
  'CUST-007': { name: 'Ferrari S.p.A.',       contact: 'Marco Rossi',      phone: '+39 0536 949 111',  email: 'm.rossi@ferrari.com',        industry: 'Luxury Automotive' },
  'CUST-008': { name: 'Red Bull GmbH',        contact: 'Lisa Pichler',     phone: '+43 662 6582-0',    email: 'l.pichler@redbull.com',      industry: 'Food & Beverage' },
  'CUST-009': { name: 'MOL Group',            contact: 'Béla Szabo',       phone: '+36 1 464 1234',    email: 'b.szabo@molgroup.info',      industry: 'Energy / Chemicals' },
  'CUST-010': { name: 'Dacia (Renault Group)',contact: 'Ion Gheorghe',     phone: '+40 248 203 000',   email: 'i.gheorghe@dacia.ro',        industry: 'Automotive' },
};

export const VEHICLES = {
  'VEH-001': { plate: 'W-LX 1234', model: 'Mercedes Actros 1851', year: 2023, fuel: 'Diesel', capacity: '24t', lastService: '2026-03-15' },
  'VEH-002': { plate: 'W-LX 2345', model: 'MAN TGX 18.470',       year: 2022, fuel: 'Diesel', capacity: '22t', lastService: '2026-02-28' },
  'VEH-003': { plate: 'W-LX 3456', model: 'Volvo FH 460',         year: 2024, fuel: 'LNG',    capacity: '25t', lastService: '2026-04-01' },
  'VEH-004': { plate: 'W-LX 4567', model: 'Scania R 450',         year: 2023, fuel: 'Diesel', capacity: '24t', lastService: '2026-03-22' },
  'VEH-005': { plate: 'W-LX 5678', model: 'DAF XF 480',           year: 2022, fuel: 'Diesel', capacity: '23t', lastService: '2026-01-18' },
  'VEH-006': { plate: 'W-LX 6789', model: 'Iveco S-Way 490',      year: 2023, fuel: 'LNG',    capacity: '22t', lastService: '2026-03-30' },
  'VEH-007': { plate: 'W-LX 7890', model: 'Mercedes Actros 2553', year: 2024, fuel: 'Diesel', capacity: '26t', lastService: '2026-04-10' },
  'VEH-008': { plate: 'W-LX 8901', model: 'MAN TGX 26.460',       year: 2021, fuel: 'Diesel', capacity: '22t', lastService: '2025-12-05' },
  'VEH-009': { plate: 'W-LX 9012', model: 'Scania S 500',         year: 2023, fuel: 'HVO',    capacity: '24t', lastService: '2026-02-14' },
  'VEH-010': { plate: 'W-LX 0123', model: 'Volvo FH Electric',    year: 2025, fuel: 'Electric',capacity:'20t', lastService: '2026-04-18' },
};

export const ROUTES_DATA = {
  'SHIP-001': {
    label: 'Vienna → Hamburg',     origin: 'Vienna, AT',      destination: 'Hamburg, DE',
    originLat: 48.2082, originLon: 16.3738, destLat: 53.5503, destLon: 9.9937,
    distanceKm: 972,  cargo: 'Electronics',       cargoValue: 42000, weight: '18.4t',
    driverId: 'DRV-001', coordId: 'COORD-AT', customerId: 'CUST-001', vehicleId: 'VEH-001',
    departedAt: '2026-05-23T06:15:00Z', scheduledArrival: '2026-05-23T21:00:00Z',
    waypoints: ['Vienna','Linz','Passau','Nuremberg','Frankfurt','Dortmund','Hamburg'],
    priority: 'HIGH', notes: 'Fragile – handle with care. Temperature controlled 15–25°C.',
    documents: ['CMR-2026-0523-001', 'INV-SI-4892', 'EUR1-AT-2026-0141'],
  },
  'SHIP-002': {
    label: 'Graz → Paris',         origin: 'Graz, AT',        destination: 'Paris, FR',
    originLat: 47.0707, originLon: 15.4395, destLat: 48.8566, destLon: 2.3522,
    distanceKm: 1240, cargo: 'Auto Parts',         cargoValue: 28000, weight: '22.1t',
    driverId: 'DRV-002', coordId: 'COORD-FR', customerId: 'CUST-002', vehicleId: 'VEH-002',
    departedAt: '2026-05-23T04:30:00Z', scheduledArrival: '2026-05-24T10:00:00Z',
    waypoints: ['Graz','Salzburg','Munich','Stuttgart','Strasbourg','Paris'],
    priority: 'MEDIUM', notes: 'BMW production line delivery – strict arrival window.',
    documents: ['CMR-2026-0523-002', 'INV-BMW-7731', 'T1-AT-9812'],
    delayed: true, delayReason: 'Border inspection at Strasbourg – customs hold',
  },
  'SHIP-003': {
    label: 'Vienna → Warsaw',      origin: 'Vienna, AT',      destination: 'Warsaw, PL',
    originLat: 48.2082, originLon: 16.3738, destLat: 52.2297, destLon: 21.0122,
    distanceKm: 681,  cargo: 'Medical Supplies',   cargoValue: 61000, weight: '8.2t',
    driverId: 'DRV-003', coordId: 'COORD-PL', customerId: 'CUST-003', vehicleId: 'VEH-003',
    departedAt: '2026-05-23T08:00:00Z', scheduledArrival: '2026-05-23T19:30:00Z',
    waypoints: ['Vienna','Brno','Ostrava','Kraków','Warsaw'],
    priority: 'CRITICAL', notes: 'Cold chain required 2–8°C. Hospital delivery – do not delay.',
    documents: ['CMR-2026-0523-003', 'INV-MED-0092', 'ADR-AT-0023', 'TEMP-LOG-0523'],
  },
  'SHIP-004': {
    label: 'Vienna → Zürich',      origin: 'Vienna, AT',      destination: 'Zürich, CH',
    originLat: 48.2082, originLon: 16.3738, destLat: 47.3769, destLon: 8.5417,
    distanceKm: 784,  cargo: 'Pharmaceuticals',    cargoValue: 55000, weight: '6.8t',
    driverId: 'DRV-004', coordId: 'COORD-FR', customerId: 'CUST-004', vehicleId: 'VEH-004',
    departedAt: '2026-05-23T07:45:00Z', scheduledArrival: '2026-05-23T18:00:00Z',
    waypoints: ['Vienna','Salzburg','Innsbruck','Feldkirch','Zürich'],
    priority: 'HIGH', notes: 'GDP certified transport. Seal integrity check on arrival.',
    documents: ['CMR-2026-0523-004', 'INV-NOV-3311', 'GDP-CERT-2026', 'EUR1-CH-0091'],
  },
  'SHIP-005': {
    label: 'Vienna → Lyon',        origin: 'Vienna, AT',      destination: 'Lyon, FR',
    originLat: 48.2082, originLon: 16.3738, destLat: 45.7640, destLon: 4.8357,
    distanceKm: 1060, cargo: 'Food & Beverage',    cargoValue: 19000, weight: '20.5t',
    driverId: 'DRV-005', coordId: 'COORD-FR', customerId: 'CUST-005', vehicleId: 'VEH-005',
    departedAt: '2026-05-23T05:00:00Z', scheduledArrival: '2026-05-24T09:00:00Z',
    waypoints: ['Vienna','Salzburg','Innsbruck','Milan','Turin','Lyon'],
    priority: 'MEDIUM', notes: 'Perishables – best before 2026-05-27. Refrigerated trailer.',
    documents: ['CMR-2026-0523-005', 'INV-CAR-6643'],
  },
  'SHIP-006': {
    label: 'Prague → Vienna',      origin: 'Prague, CZ',      destination: 'Vienna, AT',
    originLat: 50.0755, originLon: 14.4378, destLat: 48.2082, destLon: 16.3738,
    distanceKm: 312,  cargo: 'Auto Components',    cargoValue: 34000, weight: '15.7t',
    driverId: 'DRV-006', coordId: 'COORD-AT', customerId: 'CUST-006', vehicleId: 'VEH-006',
    departedAt: '2026-05-23T10:00:00Z', scheduledArrival: '2026-05-23T14:30:00Z',
    waypoints: ['Prague','Brno','Vienna'],
    priority: 'HIGH', notes: 'JIT delivery for assembly line. Slot 14:00–14:30 only.',
    documents: ['CMR-2026-0523-006', 'INV-SKO-2201'],
  },
  'SHIP-007': {
    label: 'Maranello → Vienna',   origin: 'Maranello, IT',   destination: 'Vienna, AT',
    originLat: 44.5249, originLon: 10.8632, destLat: 48.2082, destLon: 16.3738,
    distanceKm: 820,  cargo: 'Luxury Vehicles',    cargoValue: 380000, weight: '12.0t',
    driverId: 'DRV-007', coordId: 'COORD-IT', customerId: 'CUST-007', vehicleId: 'VEH-007',
    departedAt: '2026-05-23T09:00:00Z', scheduledArrival: '2026-05-23T22:00:00Z',
    waypoints: ['Maranello','Bologna','Verona','Brenner','Innsbruck','Vienna'],
    priority: 'CRITICAL', notes: 'Two Ferrari 296 GTB enclosed transport. White-glove handling.',
    documents: ['CMR-2026-0523-007', 'INV-FER-0007', 'CUSTOMS-IT-AT-077'],
  },
  'SHIP-008': {
    label: 'Salzburg → Prague',    origin: 'Salzburg, AT',    destination: 'Prague, CZ',
    originLat: 47.8095, originLon: 13.0550, destLat: 50.0755, destLon: 14.4378,
    distanceKm: 385,  cargo: 'Beverages',           cargoValue: 12000, weight: '21.3t',
    driverId: 'DRV-008', coordId: 'COORD-AT', customerId: 'CUST-008', vehicleId: 'VEH-008',
    departedAt: '2026-05-23T11:30:00Z', scheduledArrival: '2026-05-23T17:00:00Z',
    waypoints: ['Salzburg','Linz','Passau','Prague'],
    priority: 'LOW', notes: 'Red Bull distribution run. Standard ambient temp.',
    documents: ['CMR-2026-0523-008', 'INV-RB-1124'],
    delayed: true, delayReason: 'Traffic accident on A1 motorway near Linz',
  },
  'SHIP-009': {
    label: 'Budapest → Vienna',    origin: 'Budapest, HU',    destination: 'Vienna, AT',
    originLat: 47.4979, originLon: 19.0402, destLat: 48.2082, destLon: 16.3738,
    distanceKm: 244,  cargo: 'Chemical Raw Materials',cargoValue: 27000, weight: '19.8t',
    driverId: 'DRV-009', coordId: 'COORD-AT', customerId: 'CUST-009', vehicleId: 'VEH-009',
    departedAt: '2026-05-23T12:00:00Z', scheduledArrival: '2026-05-23T15:30:00Z',
    waypoints: ['Budapest','Győr','Vienna'],
    priority: 'MEDIUM', notes: 'ADR Class 3 flammable liquids. Hazmat licensed vehicle.',
    documents: ['CMR-2026-0523-009', 'INV-MOL-5512', 'ADR-HU-0119', 'MSDS-MOL-09'],
  },
  'SHIP-010': {
    label: 'Bucharest → Vienna',   origin: 'Bucharest, RO',   destination: 'Vienna, AT',
    originLat: 44.4268, originLon: 26.1025, destLat: 48.2082, destLon: 16.3738,
    distanceKm: 1380, cargo: 'Automotive Parts',    cargoValue: 31000, weight: '17.6t',
    driverId: 'DRV-010', coordId: 'COORD-IT', customerId: 'CUST-010', vehicleId: 'VEH-010',
    departedAt: '2026-05-23T02:00:00Z', scheduledArrival: '2026-05-24T08:00:00Z',
    waypoints: ['Bucharest','Pitești','Sibiu','Cluj-Napoca','Oradea','Budapest','Vienna'],
    priority: 'MEDIUM', notes: 'EV powertrain components – static-sensitive packaging.',
    documents: ['CMR-2026-0523-010', 'INV-DAC-8873', 'EUR1-RO-0634'],
  },
};

// Live state that advances each tick
export const mockLiveState = {
  progress: {
    'SHIP-001': 0.28, 'SHIP-002': 0.52, 'SHIP-003': 0.71,
    'SHIP-004': 0.45, 'SHIP-005': 0.18, 'SHIP-006': 0.63,
    'SHIP-007': 0.39, 'SHIP-008': 0.55, 'SHIP-009': 0.82,
    'SHIP-010': 0.34,
  },
};

export function lerp(a, b, t) { return a + (b - a) * t; }
