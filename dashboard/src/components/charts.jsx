// Chart primitives following the dataviz spec: thin marks, 4px rounded data-ends,
// recessive grid, one axis, hover tooltip on every mark, legend for ≥2 series.
import { compact } from '../lib/format';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const axis = { stroke: 'var(--color-ink-3)', fontSize: 11, tickLine: false, axisLine: false };
const grid = <CartesianGrid vertical={false} stroke="var(--color-line)" />;

function TooltipBox({ active, payload, label, format = (v) => v, labelFormat = (l) => l }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-ink">{labelFormat(label)}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-ink-2">
          <span className="size-2 rounded-sm" style={{ background: p.color || p.fill }} />
          <span>{p.name}</span>
          <span className="ml-auto pl-3 font-medium tabular-nums text-ink">{format(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-ink-2">
      {items.map(([label, color]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: color }} />{label}
        </span>
      ))}
    </div>
  );
}

/** Vertical bars over time; `series` = [[key, label, color], …] stacked in order. */
export function TimeBars({ data, series, height = 220, format, labelFormat, xFormat }) {
  const last = series.length - 1;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }} barCategoryGap="18%">
        {grid}
        <XAxis dataKey="date" {...axis} tickFormatter={xFormat} minTickGap={16} />
        <YAxis {...axis} allowDecimals={false} width={44} tickFormatter={compact} />
        <Tooltip cursor={{ fill: 'var(--color-subtle)' }} content={<TooltipBox format={format} labelFormat={labelFormat} />} />
        {series.map(([key, label, color], i) => (
          <Bar key={key} dataKey={key} name={label} stackId="s" fill={color} maxBarSize={28}
            stroke="var(--color-surface)" strokeWidth={i < last ? 1 : 0}
            radius={i === last ? [4, 4, 0, 0] : 0} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Horizontal bars for ranked categories (single series). */
export function RankBars({ data, valueKey, labelKey = 'label', color = 'var(--color-series-1)', format = (v) => v, height, name }) {
  const h = height || Math.max(120, data.length * 34);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 72, left: 0, bottom: 0 }} barCategoryGap="28%">
        <XAxis type="number" hide />
        <YAxis type="category" dataKey={labelKey} {...axis} width={150} tick={{ fill: 'var(--color-ink-2)', fontSize: 12 }} />
        <Tooltip cursor={{ fill: 'var(--color-subtle)' }} content={<TooltipBox format={format} />} />
        <Bar dataKey={valueKey} name={name} fill={color} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}
          label={{ position: 'right', fill: 'var(--color-ink-2)', fontSize: 11, formatter: format }} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Ordinal histogram (single series, one hue light→dark). */
export function Histogram({ data, xKey, valueKey, height = 200, name, format = (v) => v }) {
  const ramp = ['#184f95', '#256abf', '#3987e5', '#6da7ec', '#86b6ef'];   // ordinal: most accurate = darkest; lightest step ≥ 2:1 on the surface
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 16, right: 4, left: -16, bottom: 0 }} barCategoryGap="22%">
        {grid}
        <XAxis dataKey={xKey} {...axis} />
        <YAxis {...axis} allowDecimals={false} width={44} />
        <Tooltip cursor={{ fill: 'var(--color-subtle)' }} content={<TooltipBox format={format} />} />
        <Bar dataKey={valueKey} name={name} radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={false}
          label={{ position: 'top', fill: 'var(--color-ink-2)', fontSize: 11 }}>
          {data.map((_, i) => <Cell key={i} fill={ramp[Math.min(i, ramp.length - 1)]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
