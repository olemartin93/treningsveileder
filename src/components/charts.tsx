import { useState, type ReactNode } from 'react';
import { cx } from './ui';

/*
 * Small single-series SVG charts. One accent colour, recessive grid, values in tooltips.
 * Tap/hover a bar or point to see its value.
 */

interface BarDatum {
  label: string;
  value: number;
  tooltip: string;
}

export function BarChart({ data, target, height = 140, ariaLabel }: { data: BarDatum[]; target?: number; height?: number; ariaLabel: string }) {
  const [active, setActive] = useState<number | null>(null);
  // Headroom above the tallest bar so the target label never clips.
  const max = Math.max(1, target ?? 0, ...data.map((d) => d.value)) * 1.2;
  const w = 320;
  const padB = 18;
  const plotH = height - padB - 6;
  const slot = w / data.length;
  const barW = Math.min(22, slot - 6);
  const y = (v: number): number => 6 + plotH - (v / max) * plotH;
  const activeD = active !== null ? data[active] : undefined;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full" role="img" aria-label={ariaLabel} onMouseLeave={() => setActive(null)}>
        <line x1={0} x2={w} y1={y(0)} y2={y(0)} className="stroke-ink-700" strokeWidth={1} />
        {target !== undefined ? (
          <g>
            <line x1={0} x2={w} y1={y(target)} y2={y(target)} className="stroke-ink-400" strokeWidth={1} strokeDasharray="4 4" />
            <text x={w - 2} y={y(target) - 4} textAnchor="end" className="fill-ink-400 text-[10px]">
              mål {target}
            </text>
          </g>
        ) : null}
        {data.map((d, i) => {
          const x = i * slot + (slot - barW) / 2;
          const top = y(d.value);
          const h = Math.max(0, y(0) - top);
          return (
            <g key={d.label + i} onMouseEnter={() => setActive(i)} onClick={() => setActive(active === i ? null : i)}>
              <rect x={i * slot} y={0} width={slot} height={height} fill="transparent" />
              {h > 0 ? (
                <path
                  d={roundedTop(x, top, barW, h, 4)}
                  className={cx('transition-opacity', active === null || active === i ? 'opacity-100' : 'opacity-50')}
                  fill="var(--color-accent-500)"
                />
              ) : null}
              <text x={x + barW / 2} y={height - 4} textAnchor="middle" className="fill-ink-400 text-[10px]">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      {activeD ? (
        <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 rounded-lg bg-ink-700 px-2.5 py-1 text-xs font-medium text-ink-50 shadow-lg">
          {activeD.tooltip}
        </div>
      ) : null}
    </div>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

interface Point {
  x: number;
  y: number;
  tooltip: string;
}

export function LineChart({
  points,
  height = 150,
  ariaLabel,
  xLabels,
}: {
  points: Point[];
  height?: number;
  ariaLabel: string;
  xLabels?: [string, string];
}) {
  const [active, setActive] = useState<number | null>(null);
  if (points.length === 0) return <p className="py-6 text-center text-sm text-ink-400">Ingen data ennå</p>;
  const w = 320;
  const padL = 34;
  const padB = xLabels ? 18 : 6;
  const ys = points.map((p) => p.y);
  let lo = Math.min(...ys);
  let hi = Math.max(...ys);
  if (hi - lo < 1) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.12;
  lo -= pad;
  hi += pad;
  const xs = points.map((p) => p.x);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs, x0 + 1);
  const sx = (x: number): number => padL + ((x - x0) / (x1 - x0)) * (w - padL - 8);
  const sy = (y: number): number => 6 + (1 - (y - lo) / (hi - lo)) * (height - padB - 6);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad];
  const activeP = active !== null ? points[active] : undefined;

  const nearest = (clientX: number, rect: DOMRect): void => {
    const vx = ((clientX - rect.left) / rect.width) * w;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(sx(p.x) - vx) < Math.abs(sx(points[best]?.x ?? 0) - vx)) best = i;
    });
    setActive(best);
  };

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${w} ${height}`}
        className="w-full touch-pan-y"
        role="img"
        aria-label={ariaLabel}
        onPointerMove={(e) => nearest(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerDown={(e) => nearest(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setActive(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={w} y1={sy(t)} y2={sy(t)} className="stroke-ink-800" strokeWidth={1} />
            <text x={padL - 6} y={sy(t) + 3} textAnchor="end" className="fill-ink-400 text-[10px] tabular-nums">
              {Math.round(t)}
            </text>
          </g>
        ))}
        {xLabels ? (
          <>
            <text x={padL} y={height - 4} className="fill-ink-400 text-[10px]">
              {xLabels[0]}
            </text>
            <text x={w - 8} y={height - 4} textAnchor="end" className="fill-ink-400 text-[10px]">
              {xLabels[1]}
            </text>
          </>
        ) : null}
        <path d={path} fill="none" stroke="var(--color-accent-500)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {activeP ? (
          <>
            <line x1={sx(activeP.x)} x2={sx(activeP.x)} y1={6} y2={height - padB} className="stroke-ink-600" strokeWidth={1} />
            <circle cx={sx(activeP.x)} cy={sy(activeP.y)} r={5} fill="var(--color-accent-500)" stroke="var(--color-ink-900)" strokeWidth={2} />
          </>
        ) : (
          points.length <= 30 &&
          points.map((p, i) => (
            <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={3} fill="var(--color-accent-500)" stroke="var(--color-ink-900)" strokeWidth={2} />
          ))
        )}
      </svg>
      {activeP ? (
        <div className="pointer-events-none absolute top-0 right-0 rounded-lg bg-ink-700 px-2.5 py-1 text-xs font-medium shadow-lg">
          {activeP.tooltip}
        </div>
      ) : null}
    </div>
  );
}

/** Horizontal bar with the recommended range shown as a band. */
export function RangeBar({ label, value, range, max }: { label: string; value: number; range: [number, number]; max: number }) {
  const pct = (v: number): string => `${Math.min(100, (v / max) * 100)}%`;
  const status = value < range[0] ? 'under' : value > range[1] ? 'over' : 'ok';
  return (
    <div className="grid grid-cols-[6.5rem_1fr_3.5rem] items-center gap-2 text-sm">
      <span className="truncate text-ink-300">{label}</span>
      <div className="relative h-3 rounded-full bg-ink-800">
        <div className="absolute inset-y-0 rounded-full bg-ink-600/60" style={{ left: pct(range[0]), width: `calc(${pct(range[1])} - ${pct(range[0])})` }} />
        <div className="absolute inset-y-0.5 left-0 rounded-full bg-accent-500" style={{ width: pct(value) }} />
      </div>
      <span className="text-right text-xs tabular-nums text-ink-300">
        {String(Math.round(value * 10) / 10).replace('.', ',')}
        <span className={cx('ml-1', status === 'ok' ? 'text-good' : status === 'under' ? 'text-warn' : 'text-info')}>
          {status === 'ok' ? '✓' : status === 'under' ? '↓' : '↑'}
        </span>
      </span>
    </div>
  );
}

/** Circular progress for "sessions this week". */
export function Ring({ value, max, children }: { value: number; max: number; children: ReactNode }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const frac = Math.min(1, value / Math.max(1, max));
  return (
    <div className="relative size-24 shrink-0">
      <svg viewBox="0 0 80 80" className="size-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--color-ink-700)" strokeWidth="8" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke="var(--color-accent-500)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${c * frac} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}
