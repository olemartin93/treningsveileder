import type { HealthDay } from './types';
import { dayKey } from './dates';

/**
 * Reads health values sent by the iOS Shortcut, e.g.
 *   #/importer?dato=2024-05-01&hvilepuls=52&hrv=61&sovn=7.4&skritt=9500&vekt=82.3
 * Values may use comma decimals (Norwegian locale) and sleep may be given in minutes (sovnmin).
 */
export function parseShortcutParams(params: URLSearchParams, today = new Date()): HealthDay | null {
  const n = (...keys: string[]): number | undefined => {
    for (const k of keys) {
      const raw = params.get(k);
      if (raw === null || raw.trim() === '') continue;
      const v = parseFloat(raw.replace(/\s/g, '').replace(',', '.'));
      if (Number.isFinite(v) && v > 0) return v;
    }
    return undefined;
  };
  const date = params.get('dato') ?? params.get('date') ?? dayKey(today);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const sleepMin = n('sovnmin', 'sleepmin');
  let sleepHours = n('sovn', 'sleep');
  if (sleepHours === undefined && sleepMin !== undefined) sleepHours = sleepMin / 60;
  // Shortcuts sometimes hand over seconds for durations.
  if (sleepHours !== undefined && sleepHours > 24) sleepHours = sleepHours > 1440 ? sleepHours / 3600 : sleepHours / 60;

  const day: HealthDay = { date };
  const rhr = n('hvilepuls', 'rhr');
  const hrv = n('hrv');
  const steps = n('skritt', 'steps');
  const weight = n('vekt', 'weight');
  if (rhr !== undefined) day.restingHr = Math.round(rhr);
  if (hrv !== undefined) day.hrv = Math.round(hrv);
  if (sleepHours !== undefined) day.sleepHours = Math.round(sleepHours * 10) / 10;
  if (steps !== undefined) day.steps = Math.round(steps);
  if (weight !== undefined) day.bodyMass = Math.round(weight * 10) / 10;
  return Object.keys(day).length > 1 ? day : null;
}
