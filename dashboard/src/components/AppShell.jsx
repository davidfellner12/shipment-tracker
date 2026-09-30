import { useState } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { LayoutDashboard, Package, BarChart3, Truck, Server, Moon, Sun, Menu, X, Building2 } from 'lucide-react';
import { useSession } from '../lib/session';
import { isMock } from '../lib/api';
import { BRAND, CARRIER, CUSTOMERS } from '../lib/format';
import { cx } from './ui';

export function Logo({ className }) {
  return (
    <Link to="/" className={cx('flex items-center gap-2 font-semibold tracking-tight text-ink', className)}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <defs>
          <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4f46e5" /><stop offset="0.55" stopColor="#7c3aed" /><stop offset="1" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="8" fill="url(#logo-g)" />
        <path d="M8 20h10l6-8" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="24" cy="12" r="2.5" fill="white" />
      </svg>
      {BRAND}
    </Link>
  );
}

export function ThemeToggle() {
  const { dark, setDark } = useSession();
  return (
    <button onClick={() => setDark(!dark)} className="btn-ghost !px-2.5" aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

function WorkspaceSwitcher() {
  const { workspace, setWorkspace } = useSession();
  return (
    <label className="block">
      <span className="label flex items-center gap-1.5"><Building2 size={12} /> Workspace</span>
      <select value={workspace} onChange={(e) => setWorkspace(e.target.value)}
        className="input mt-1.5 w-full cursor-pointer pr-8 text-[13px]">
        <option value="operator">Operator · all customers</option>
        <optgroup label={`Customer portal (${CARRIER})`}>
          {Object.entries(CUSTOMERS).map(([id, c]) => <option key={id} value={id}>{c.name}</option>)}
        </optgroup>
      </select>
    </label>
  );
}

function Nav({ onNavigate }) {
  const { isOperator } = useSession();
  const items = [
    ['/app', 'Overview', LayoutDashboard, true],
    ['/app/shipments', 'Shipments', Package],
    ['/app/analytics', isOperator ? 'Analytics' : 'Reports', BarChart3],
    ...(isOperator ? [['/app/fleet', 'Fleet', Truck], ['/app/system', 'System', Server]] : []),
  ];
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map(([to, label, Icon, end]) => (
        <NavLink key={to} to={to} end={end} onClick={onNavigate}
          className={({ isActive }) => cx('flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors',
            isActive ? 'bg-subtle text-ink' : 'text-ink-2 hover:bg-subtle/60 hover:text-ink')}>
          <Icon size={16} strokeWidth={2} />{label}
        </NavLink>
      ))}
    </nav>
  );
}

function Sidebar({ onNavigate }) {
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Logo className="px-1" />
      <WorkspaceSwitcher />
      <Nav onNavigate={onNavigate} />
      <div className="mt-auto space-y-3">
        <div className="rounded-lg border border-line p-3 text-xs text-ink-3">
          <div className="flex items-center gap-2 font-medium text-ink-2">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-good opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-good" />
            </span>
            {isMock() ? 'Demo data · simulated fleet' : 'Live · AWS pipeline'}
          </div>
          <p className="mt-1 leading-relaxed">
            {isMock() ? 'Runs fully in your browser. Deploy the stack to stream real telemetry.' : 'IoT Core → Kinesis → Lambda → DynamoDB'}
          </p>
        </div>
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-ink-3">© {new Date().getFullYear()} {BRAND}</span>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}

export default function AppShell() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-line bg-surface lg:block">
        <Sidebar />
      </aside>

      {/* mobile */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface px-4 lg:hidden">
        <Logo />
        <button className="btn-ghost !px-2.5" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={18} /></button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-surface shadow-xl">
            <button className="btn-ghost absolute right-3 top-3 !px-2.5" onClick={() => setOpen(false)} aria-label="Close menu"><X size={18} /></button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <main className="min-w-0 flex-1 px-4 pb-12 pt-20 sm:px-6 lg:px-8 lg:pt-8">
        <div className="mx-auto max-w-[1400px]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
