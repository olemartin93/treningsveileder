import type { ExerciseEntry, Workout } from './types';

/** Minimal RFC 4180 CSV parser with auto-detected delimiter (comma, semicolon or tab). */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.slice(0, clean.indexOf('\n') === -1 ? undefined : clean.indexOf('\n'));
  const delim = [',', ';', '\t'].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best,
  );
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

const norm = (s: string): string => s.trim().toLowerCase().replace(/[_\s]+/g, ' ');

function findCol(headers: string[], candidates: RegExp[], exclude?: RegExp): number {
  for (const re of candidates) {
    const idx = headers.findIndex((h) => re.test(h) && !(exclude?.test(h) ?? false));
    if (idx !== -1) return idx;
  }
  return -1;
}

function num(s: string | undefined): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

type DateOrder = 'dmy' | 'mdy';

function detectOrder(values: string[]): DateOrder {
  for (const v of values) {
    const m = /^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/.exec(v.trim());
    if (!m) continue;
    if (Number(m[1]) > 12) return 'dmy';
    if (Number(m[2]) > 12) return 'mdy';
  }
  // Dotted dates (31.12.2024) are always day-first in Norway.
  return values.some((v) => /^\d{1,2}\.\d{1,2}\./.test(v.trim())) ? 'dmy' : 'mdy';
}

export function parseDate(raw: string, order: DateOrder): Date | null {
  const s = raw.trim();
  if (!s) return null;
  const numeric = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?/i.exec(s);
  if (numeric) {
    const [, a, b, y, hh, mm, ss, ampm] = numeric;
    const day = Number(order === 'dmy' ? a : b);
    const month = Number(order === 'dmy' ? b : a);
    let year = Number(y);
    if (year < 100) year += 2000;
    let hour = Number(hh ?? 12);
    if (ampm?.toLowerCase() === 'pm' && hour < 12) hour += 12;
    if (ampm?.toLowerCase() === 'am' && hour === 12) hour = 0;
    return new Date(year, month - 1, day, hour, Number(mm ?? 0), Number(ss ?? 0));
  }
  // ISO (2024-01-05 17:30:00) – treat as local time
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (iso && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    const [, y, mo, d, hh, mm, ss] = iso;
    return new Date(Number(y), Number(mo) - 1, Number(d), Number(hh ?? 12), Number(mm ?? 0), Number(ss ?? 0));
  }
  const t = Date.parse(s.replace(/,(?=\s*\d{1,2}:)/, ''));
  return Number.isNaN(t) ? null : new Date(t);
}

export interface CsvImportResult {
  workouts: Workout[];
  sets: number;
  skippedRows: number;
}

/**
 * Imports workout history from Lyfta's CSV export. Columns are detected by name, so exports
 * from Strong, Hevy and similar apps work too.
 */
export function importWorkoutCsv(text: string): CsvImportResult {
  const rows = parseCsv(text);
  const header = rows[0];
  if (!header) throw new Error('Filen er tom');
  const h = header.map(norm);

  const col = {
    date: findCol(h, [/^date$/, /^dato$/, /start ?time/, /workout date/, /^start$/, /date/, /dato/]),
    title: findCol(h, [/workout ?name/, /^title$/, /^workout$/, /økt/, /routine/]),
    exercise: findCol(h, [/exercise ?name/, /exercise ?title/, /^exercise$/, /øvelse/, /exercise/]),
    weight: findCol(h, [/^weight/, /^vekt/, /weight/, /load/, /kg/, /lbs?\b/], /body|distance|unit/),
    reps: findCol(h, [/^reps$/, /repetitions/, /^reps/, /rep/]),
    rpe: findCol(h, [/rpe/, /rir/]),
    setType: findCol(h, [/set ?type/, /^type$/, /warm/]),
    duration: findCol(h, [/workout ?duration/, /^duration$/, /varighet/], /set|exercise/),
    end: findCol(h, [/end ?time/]),
    unit: findCol(h, [/weight ?unit/, /^unit/]),
  };
  if (col.date === -1 || col.exercise === -1) {
    throw new Error('Fant ikke kolonner for dato og øvelse. Sjekk at dette er en treningseksport fra Lyfta.');
  }
  const lbsHeader = col.weight !== -1 && /lb/.test(h[col.weight] ?? '');
  const order = detectOrder(rows.slice(1, 200).map((r) => r[col.date] ?? ''));

  const byKey = new Map<string, Workout>();
  let sets = 0;
  let skippedRows = 0;

  for (const r of rows.slice(1)) {
    const date = parseDate(r[col.date] ?? '', order);
    const exName = (r[col.exercise] ?? '').trim();
    if (!date || !exName) {
      skippedRows++;
      continue;
    }
    const title = col.title !== -1 ? (r[col.title] ?? '').trim() : '';
    const key = `${date.toISOString()}|${title}`;
    let w = byKey.get(key);
    if (!w) {
      w = {
        id: `lyfta-${date.getTime()}-${title}`,
        date: date.toISOString(),
        title: title || undefined,
        kind: 'styrke',
        exercises: [],
        source: 'lyfta',
      };
      const dur = parseDuration(col.duration !== -1 ? r[col.duration] : undefined);
      const end = col.end !== -1 ? parseDate(r[col.end] ?? '', order) : null;
      if (dur) w.durationMin = dur;
      else if (end) w.durationMin = Math.round((end.getTime() - date.getTime()) / 60000) || undefined;
      byKey.set(key, w);
    }
    let ex: ExerciseEntry | undefined = w.exercises.find((e) => e.name === exName);
    if (!ex) {
      ex = { name: exName, sets: [] };
      w.exercises.push(ex);
    }
    let weight = col.weight !== -1 ? num(r[col.weight]) : 0;
    const lbs = lbsHeader || (col.unit !== -1 && /lb/i.test(r[col.unit] ?? ''));
    if (lbs) weight = Math.round(weight * 0.4536 * 10) / 10;
    const reps = col.reps !== -1 ? Math.round(num(r[col.reps])) : 0;
    const setType = col.setType !== -1 ? (r[col.setType] ?? '').toLowerCase() : '';
    const rpe = col.rpe !== -1 ? num(r[col.rpe]) : 0;
    ex.sets.push({
      weight,
      reps,
      done: true,
      warmup: /warm|oppvarm/.test(setType) || undefined,
      rpe: rpe > 0 ? rpe : undefined,
    });
    sets++;
  }
  return { workouts: [...byKey.values()], sets, skippedRows };
}

/** Parses "1h 5m", "65", "01:05:00", "65 min" into minutes. */
export function parseDuration(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const s = raw.trim().toLowerCase();
  if (!s) return undefined;
  const hms = /^(\d+):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (hms) {
    const [, a, b, c] = hms;
    return c !== undefined ? Number(a) * 60 + Number(b) : Number(a);
  }
  const h = /(\d+(?:[.,]\d+)?)\s*h/.exec(s);
  const m = /(\d+)\s*m/.exec(s);
  if (h || m) return Math.round(num(h?.[1]) * 60 + num(m?.[1]));
  const n = num(s);
  if (!n) return undefined;
  // Large bare numbers are seconds (Strong/Hevy export seconds)
  return n > 600 ? Math.round(n / 60) : Math.round(n);
}
