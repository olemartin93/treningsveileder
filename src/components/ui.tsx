import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useEffect } from 'react';
import type { Level } from '../lib/coach';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx('rounded-2xl bg-ink-900 p-4 ring-1 ring-white/5', className)}>{children}</section>;
}

export function CardTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold tracking-wide text-ink-300 uppercase">{children}</h2>
      {action}
    </div>
  );
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const styles: Record<Variant, string> = {
    primary: 'bg-gradient-to-br from-accent-500 to-accent-600 text-white shadow-lg shadow-accent-600/20',
    secondary: 'bg-ink-700 text-ink-50',
    ghost: 'bg-transparent text-ink-300 hover:bg-ink-800',
    danger: 'bg-bad/15 text-bad',
  };
  return (
    <button
      type="button"
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-40',
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}

const LEVEL_STYLE: Record<Level, { ring: string; text: string; label: string; icon: string }> = {
  viktig: { ring: 'ring-bad/40 bg-bad/10', text: 'text-bad', label: 'Viktig', icon: '!' },
  obs: { ring: 'ring-warn/30 bg-warn/10', text: 'text-warn', label: 'Obs', icon: '▲' },
  info: { ring: 'ring-info/25 bg-info/10', text: 'text-info', label: 'Tips', icon: 'i' },
  bra: { ring: 'ring-good/25 bg-good/10', text: 'text-good', label: 'Bra', icon: '✓' },
};

export function LevelBadge({ level }: { level: Level }) {
  const s = LEVEL_STYLE[level];
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ring-1', s.ring, s.text)}>
      <span aria-hidden>{s.icon}</span>
      {s.label}
    </span>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-ink-900 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] ring-1 ring-white/10 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-full bg-ink-800 text-ink-300" aria-label="Lukk">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl bg-ink-800 p-3">
      <div className="text-[11px] font-medium text-ink-400 uppercase">{label}</div>
      <div className="mt-0.5 text-xl font-bold tabular-nums">{value}</div>
      {sub ? <div className="text-xs text-ink-400">{sub}</div> : null}
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-xl bg-ink-800 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            'min-h-9 flex-1 rounded-lg px-2 text-sm font-medium transition',
            o.value === value ? 'bg-ink-600 text-white' : 'text-ink-400',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [message, onDone]);
  if (!message) return null;
  return (
    <div className="fixed inset-x-4 top-[calc(1rem+env(safe-area-inset-top))] z-[60] mx-auto max-w-md rounded-xl bg-ink-700 px-4 py-3 text-sm font-medium shadow-2xl ring-1 ring-white/10">
      {message}
    </div>
  );
}
