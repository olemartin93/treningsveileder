import type { HealthWorkerMessage, HealthWorkout } from './healthTypes';
import type { Workout } from './types';
import { activityLabel, classifyActivity } from './healthParser';
import { addWorkouts, mergeHealth } from './store';

export function healthWorkoutsToWorkouts(list: HealthWorkout[]): Workout[] {
  return list.map((h) => ({
    id: `ah-${h.start}`,
    date: h.start,
    durationMin: h.durationMin || undefined,
    title: activityLabel(h.activity),
    kind: classifyActivity(h.activity),
    exercises: [],
    source: 'apple-health',
  }));
}

/** Parses an Apple Health export (zip or xml) in a worker and stores the result. */
export function importHealthFile(
  file: File,
  onProgress: (fraction: number) => void,
): Promise<{ days: number; workouts: number }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/healthWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<HealthWorkerMessage>) => {
      const m = ev.data;
      if (m.type === 'progress') onProgress(m.total ? m.bytes / m.total : 0);
      else if (m.type === 'error') {
        worker.terminate();
        reject(new Error(m.message));
      } else {
        worker.terminate();
        const days = mergeHealth(m.days);
        const workouts = addWorkouts(healthWorkoutsToWorkouts(m.workouts));
        resolve({ days, workouts });
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'Ukjent feil i import'));
    };
    worker.postMessage({ file, sinceDays: 400 });
  });
}
