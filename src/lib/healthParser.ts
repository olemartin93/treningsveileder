import type { HealthDay } from './types';
import type { HealthWorkout } from './healthTypes';

/**
 * Incremental parser for Apple Health's export.xml. Feed it text chunks; it only looks at
 * <Record> and <Workout> start tags, so memory stays flat even for multi-GB exports.
 */
export class HealthXmlParser {
  private buffer = '';
  private readonly cutoff: string;
  // day -> source -> value (sum). Taking the max across sources avoids double counting
  // when both iPhone and Apple Watch record the same thing.
  private steps = new Map<string, Map<string, number>>();
  private sleep = new Map<string, Map<string, number>>();
  private avg = { restingHr: new Map<string, [number, number]>(), hrv: new Map<string, [number, number]>() };
  private bodyMass = new Map<string, number>();
  readonly workouts: HealthWorkout[] = [];

  constructor(sinceDays: number, now = new Date()) {
    const c = new Date(now.getTime() - sinceDays * 86400000);
    this.cutoff = c.toISOString().slice(0, 10);
  }

  push(chunk: string): void {
    this.buffer += chunk;
    const re = /<(Record|Workout)\s([^>]*)>/g;
    let m: RegExpExecArray | null;
    let consumed = 0;
    while ((m = re.exec(this.buffer)) !== null) {
      this.handle(m[1] as 'Record' | 'Workout', m[2] ?? '');
      consumed = re.lastIndex;
    }
    // Keep a possibly incomplete tag at the end for the next chunk.
    const rest = this.buffer.slice(consumed);
    const lastOpen = rest.lastIndexOf('<');
    this.buffer = lastOpen === -1 ? '' : rest.slice(lastOpen);
    if (this.buffer.length > 1_000_000) this.buffer = this.buffer.slice(-10_000);
  }

  private handle(tag: 'Record' | 'Workout', attrText: string): void {
    const a = attrs(attrText);
    const start = a.startDate ?? '';
    const day = start.slice(0, 10);
    if (day < this.cutoff) return;

    if (tag === 'Workout') {
      let duration = parseFloat(a.duration ?? '0');
      if (a.durationUnit === 's') duration /= 60;
      if (a.durationUnit === 'hr') duration *= 60;
      if (!duration && a.endDate) duration = (parseHealthDate(a.endDate) - parseHealthDate(start)) / 60000;
      const energy = parseFloat(a.totalEnergyBurned ?? '');
      this.workouts.push({
        start: new Date(parseHealthDate(start)).toISOString(),
        durationMin: Math.round(duration),
        activity: (a.workoutActivityType ?? '').replace('HKWorkoutActivityType', ''),
        energyKcal: Number.isFinite(energy) ? Math.round(energy) : undefined,
      });
      return;
    }

    const type = a.type ?? '';
    const value = parseFloat(a.value ?? '');
    const source = a.sourceName ?? '?';
    switch (type) {
      case 'HKQuantityTypeIdentifierStepCount':
        addBySource(this.steps, day, source, value);
        break;
      case 'HKQuantityTypeIdentifierRestingHeartRate':
        addAvg(this.avg.restingHr, day, value);
        break;
      case 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN':
        addAvg(this.avg.hrv, day, value);
        break;
      case 'HKQuantityTypeIdentifierBodyMass': {
        const kg = a.unit === 'lb' ? value * 0.4536 : value;
        if (Number.isFinite(kg)) this.bodyMass.set(day, kg);
        break;
      }
      case 'HKCategoryTypeIdentifierSleepAnalysis': {
        if (!/Asleep/.test(a.value ?? '')) break; // ignore InBed / Awake
        const end = a.endDate ?? start;
        const hours = (parseHealthDate(end) - parseHealthDate(start)) / 3600000;
        // Attribute sleep to the day you wake up.
        if (hours > 0 && hours < 16) addBySource(this.sleep, end.slice(0, 10), source, hours);
        break;
      }
    }
  }

  finish(): { days: HealthDay[]; workouts: HealthWorkout[] } {
    const days = new Map<string, HealthDay>();
    const get = (d: string): HealthDay => {
      let v = days.get(d);
      if (!v) days.set(d, (v = { date: d }));
      return v;
    };
    for (const [d, bySrc] of this.steps) get(d).steps = Math.round(Math.max(...bySrc.values()));
    for (const [d, bySrc] of this.sleep) get(d).sleepHours = round1(Math.max(...bySrc.values()));
    for (const [d, [sum, n]] of this.avg.restingHr) get(d).restingHr = Math.round(sum / n);
    for (const [d, [sum, n]] of this.avg.hrv) get(d).hrv = Math.round(sum / n);
    for (const [d, kg] of this.bodyMass) get(d).bodyMass = round1(kg);
    return { days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)), workouts: this.workouts };
  }
}

function attrs(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(\w+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out[m[1] ?? ''] = m[2] ?? '';
  return out;
}

/** "2024-01-05 07:12:00 +0100" -> epoch ms */
export function parseHealthDate(s: string): number {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/.exec(s.trim());
  if (m) return Date.parse(`${m[1]}T${m[2]}${m[3]}:${m[4]}`);
  return Date.parse(s);
}

function addBySource(map: Map<string, Map<string, number>>, day: string, source: string, v: number): void {
  if (!Number.isFinite(v)) return;
  let bySrc = map.get(day);
  if (!bySrc) map.set(day, (bySrc = new Map()));
  bySrc.set(source, (bySrc.get(source) ?? 0) + v);
}

function addAvg(map: Map<string, [number, number]>, day: string, v: number): void {
  if (!Number.isFinite(v)) return;
  const cur = map.get(day) ?? [0, 0];
  map.set(day, [cur[0] + v, cur[1] + 1]);
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Maps an Apple Health activity type to our workout kinds. */
export function classifyActivity(activity: string): 'styrke' | 'kondisjon' | 'annet' {
  if (/StrengthTraining|CrossTraining|CoreTraining|HighIntensityInterval/.test(activity)) return 'styrke';
  if (/Running|Walking|Cycling|Swimming|Rowing|Elliptical|Hiking|StairClimbing|CrossCountrySkiing|Mixed.*Cardio|Cardio/.test(activity))
    return 'kondisjon';
  return 'annet';
}

const ACTIVITY_NB: Record<string, string> = {
  TraditionalStrengthTraining: 'Styrketrening',
  FunctionalStrengthTraining: 'Funksjonell styrke',
  HighIntensityIntervalTraining: 'HIIT',
  CrossTraining: 'Crosstrening',
  CoreTraining: 'Kjernetrening',
  Running: 'Løping',
  Walking: 'Gåtur',
  Cycling: 'Sykling',
  Swimming: 'Svømming',
  Hiking: 'Fottur',
  Yoga: 'Yoga',
  CrossCountrySkiing: 'Langrenn',
  Rowing: 'Roing',
  Elliptical: 'Ellipsemaskin',
};

export function activityLabel(activity: string): string {
  return ACTIVITY_NB[activity] ?? activity.replace(/([a-z])([A-Z])/g, '$1 $2');
}
