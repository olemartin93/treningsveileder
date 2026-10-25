import { useSyncExternalStore } from 'react';
import type { AppData, HealthDay, Settings, Workout } from './types';

const KEY = 'treningsveileder:v1';

export const DEFAULT_SETTINGS: Settings = {
  goal: 'muskelvekst',
  experience: 'viderekommen',
  daysPerWeek: 3,
  restSeconds: 120,
  barWeight: 20,
  name: '',
};

function emptyData(): AppData {
  return { version: 1, workouts: [], health: {}, settings: { ...DEFAULT_SETTINGS }, activeWorkout: null };
}

function load(): AppData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyData();
    const parsed = JSON.parse(raw) as Partial<AppData>;
    return {
      ...emptyData(),
      ...parsed,
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
    };
  } catch {
    return emptyData();
  }
}

let state: AppData = load();
const listeners = new Set<() => void>();

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Kunne ikke lagre data', err);
  }
}

export function getState(): AppData {
  return state;
}

export function setState(updater: (prev: AppData) => AppData): void {
  state = updater(state);
  persist();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAppData(): AppData {
  return useSyncExternalStore(subscribe, getState);
}

// Ask the browser not to evict our data (important for installed iOS PWAs).
export async function requestPersistence(): Promise<void> {
  if (navigator.storage?.persist) await navigator.storage.persist();
}

const byDate = (a: Workout, b: Workout): number => b.date.localeCompare(a.date);

/** Adds workouts, skipping ones that duplicate an existing session. Returns how many were added. */
export function addWorkouts(incoming: Workout[]): number {
  let added = 0;
  setState((prev) => {
    const existing = [...prev.workouts];
    for (const w of incoming) {
      if (isDuplicate(w, existing)) continue;
      existing.push(w);
      added++;
    }
    return { ...prev, workouts: existing.sort(byDate) };
  });
  return added;
}

function isDuplicate(w: Workout, list: Workout[]): boolean {
  const t = Date.parse(w.date);
  return list.some((o) => {
    if (o.id === w.id) return true;
    const sameTime = Math.abs(Date.parse(o.date) - t) < 90 * 60 * 1000;
    if (!sameTime) return false;
    // An Apple Health session at the same time as a logged session is the same workout.
    if (w.source === 'apple-health' || o.source === 'apple-health') return w.kind === o.kind;
    return w.source === o.source && w.exercises.length === o.exercises.length;
  });
}

export function saveWorkout(w: Workout): void {
  setState((prev) => ({
    ...prev,
    workouts: [w, ...prev.workouts.filter((o) => o.id !== w.id)].sort(byDate),
  }));
}

export function deleteWorkout(id: string): void {
  setState((prev) => ({ ...prev, workouts: prev.workouts.filter((w) => w.id !== id) }));
}

export function mergeHealth(days: HealthDay[]): number {
  setState((prev) => {
    const health = { ...prev.health };
    for (const d of days) health[d.date] = { ...health[d.date], ...stripUndefined(d) };
    return { ...prev, health };
  });
  return days.length;
}

function stripUndefined(d: HealthDay): HealthDay {
  const out: HealthDay = { date: d.date };
  if (d.restingHr !== undefined) out.restingHr = d.restingHr;
  if (d.hrv !== undefined) out.hrv = d.hrv;
  if (d.sleepHours !== undefined) out.sleepHours = d.sleepHours;
  if (d.steps !== undefined) out.steps = d.steps;
  if (d.bodyMass !== undefined) out.bodyMass = d.bodyMass;
  return out;
}

export function updateSettings(patch: Partial<Settings>): void {
  setState((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
}

export function setActiveWorkout(w: Workout | null): void {
  setState((prev) => ({ ...prev, activeWorkout: w }));
}

export function exportBackup(): string {
  return JSON.stringify(state, null, 2);
}

export function importBackup(json: string): void {
  const parsed = JSON.parse(json) as Partial<AppData>;
  if (parsed.version !== 1 || !Array.isArray(parsed.workouts)) throw new Error('Ugyldig sikkerhetskopi');
  setState(() => ({ ...emptyData(), ...parsed, settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) } }));
}

export function resetAll(): void {
  setState(() => emptyData());
}

export function uid(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
