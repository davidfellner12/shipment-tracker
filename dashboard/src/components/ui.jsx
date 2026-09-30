import { AlertTriangle, CheckCircle2, CircleDashed, OctagonAlert, Radio, Thermometer, Flag, ShieldAlert } from 'lucide-react';
import { STATUS, EXCEPTION } from '../lib/format';

export const cx = (...c) => c.filter(Boolean).join(' ');

export function Card({ title, subtitle, action, children, className, bodyClass }) {
  return (
    <section className={cx('card', className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4">
          <div>
            {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={cx('p-5', title && 'pt-3', bodyClass)}>{children}</div>
    </section>
  );
}

/** Hero-number tile. `tone` colours only the small trend/context line, never the number. */
export function Kpi({ label, value, unit, context, tone, icon: Icon, loading }) {
  const toneClass = { good: 'text-good', warning: 'text-[#b27c00] dark:text-warning', critical: 'text-critical' }[tone] || 'text-ink-3';
  return (
    <div className="card px-5 py-4">
      <div className="flex items-center gap-2 text-xs font-medium text-ink-3">
        {Icon && <Icon size={14} strokeWidth={2} />}
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        {loading ? <div className="h-8 w-20 animate-pulse rounded bg-subtle" />
          : <span className="text-[28px] font-semibold leading-none tracking-tight text-ink">{value}</span>}
        {unit && !loading && <span className="text-sm text-ink-3">{unit}</span>}
      </div>
      {context && <div className={cx('mt-2 text-xs', toneClass)}>{context}</div>}
    </div>
  );
}

const TONES = {
  neutral: 'bg-subtle text-ink-2',
  accent: 'bg-accent-soft text-accent-ink',
  good: 'bg-good/10 text-[#087a08] dark:text-good',
  warning: 'bg-warning/15 text-[#8a6200] dark:text-warning',
  critical: 'bg-critical/10 text-critical',
};

export function Pill({ tone = 'neutral', icon: Icon, children, className }) {
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', TONES[tone], className)}>
      {Icon && <Icon size={12} strokeWidth={2.25} />}
      {children}
    </span>
  );
}

export function StatusPill({ status }) {
  const s = STATUS[status] || { label: status, tone: 'neutral' };
  const icon = status === 'DELIVERED' ? CheckCircle2 : status === 'BORDER_HOLD' ? ShieldAlert : status === 'IN_TRANSIT' ? Radio : CircleDashed;
  return <Pill tone={s.tone} icon={icon}>{s.label}</Pill>;
}

const EXC_ICON = { LATE_RISK: AlertTriangle, TEMP_EXCURSION: Thermometer, BORDER_HOLD: ShieldAlert, SIGNAL_LOST: OctagonAlert, FLAGGED: Flag };

export function ExceptionPill({ code }) {
  const e = EXCEPTION[code];
  return <Pill tone={e?.severity || 'warning'} icon={EXC_ICON[code]}>{e?.label || code}</Pill>;
}

export function SeverityDot({ severity }) {
  const c = { ok: 'bg-good', warning: 'bg-warning', critical: 'bg-critical' }[severity] || 'bg-ink-3';
  return <span className={cx('inline-block size-2 shrink-0 rounded-full', c)} aria-hidden />;
}

export function Progress({ value, tone = 'accent' }) {
  const color = tone === 'good' ? 'bg-good' : 'bg-accent';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-full transition-[width] duration-700', color)} style={{ width: `${Math.min(100, value * 100)}%` }} />
    </div>
  );
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)}
          className={cx('h-7 rounded-md px-3 text-xs font-medium transition-colors cursor-pointer',
            v === value ? 'bg-subtle text-ink' : 'text-ink-3 hover:text-ink')}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, className }) {
  return (
    <div className={className}>
      <div className="label">{label}</div>
      <div className="mt-0.5 text-sm text-ink">{children}</div>
    </div>
  );
}

export function Empty({ icon: Icon = CircleDashed, title, children }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <Icon size={28} className="text-ink-3" />
      <div className="text-sm font-medium text-ink">{title}</div>
      {children && <div className="max-w-sm text-xs text-ink-3">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-3">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
