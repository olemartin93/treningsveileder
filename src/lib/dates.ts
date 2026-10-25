const DAY = 24 * 60 * 60 * 1000;

export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Monday 00:00 of the week containing d. */
export function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const diff = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - diff);
  return out;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / DAY);
}

/** ISO 8601 week number. */
export function weekNumber(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / DAY + 1) / 7);
}

const fmtDate = new Intl.DateTimeFormat('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtTime = new Intl.DateTimeFormat('nb-NO', { hour: '2-digit', minute: '2-digit' });

export function formatDate(iso: string): string {
  return fmtDate.format(new Date(iso));
}

export function formatTime(iso: string): string {
  return fmtTime.format(new Date(iso));
}

export function relativeDays(iso: string, now = new Date()): string {
  const n = daysBetween(startOfDay(new Date(iso)), startOfDay(now));
  if (n <= 0) return 'i dag';
  if (n === 1) return 'i går';
  return `${n} dager siden`;
}

export function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}
