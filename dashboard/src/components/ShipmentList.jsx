import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { ExceptionPill, Progress, SeverityDot, StatusPill, cx } from './ui';
import { delayText, time } from '../lib/format';

/** Compact shipment rows for side panels (exceptions, a customer's active loads). */
export default function ShipmentList({ shipments, selectedId, onHover, showCustomer }) {
  return (
    <ul className="divide-y divide-line">
      {shipments.map((s) => (
        <li key={s.shipmentId}>
          <Link to={`/app/shipments/${s.shipmentId}`}
            onMouseEnter={() => onHover?.(s.shipmentId)}
            className={cx('group block px-5 py-3 transition-colors hover:bg-subtle/60', selectedId === s.shipmentId && 'bg-subtle/60')}>
            <div className="flex items-center gap-2">
              <SeverityDot severity={s.severity} />
              <span className="font-mono text-[13px] font-medium text-ink">{s.shipmentId}</span>
              <span className="truncate text-xs text-ink-3">{s.routeLabel}</span>
              <ArrowRight size={14} className="ml-auto shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            {showCustomer && <div className="mt-0.5 pl-4 text-xs text-ink-3">{s.customerName}</div>}
            <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-4">
              {s.exceptions.length ? s.exceptions.map((e) => <ExceptionPill key={e} code={e} />) : <StatusPill status={s.status} />}
            </div>
            <div className="mt-2 flex items-center gap-3 pl-4">
              <Progress value={s.progress} tone={s.status === 'DELIVERED' ? 'good' : 'accent'} />
              <span className="shrink-0 text-xs tabular-nums text-ink-2">
                {s.status === 'DELIVERED' ? `Delivered ${time(s.deliveredAt)}` : `ETA ${time(s.etaAt)}`}
                <span className={cx('ml-1.5', s.delayMin > 0 ? 'text-critical' : 'text-ink-3')}>{delayText(s.delayMin)}</span>
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
